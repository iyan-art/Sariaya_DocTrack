from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .durations import format_hours_minutes
from .models import EmailNotificationLog

# settings.TIME_ZONE is UTC, but email readers need the wall-clock time here.
_MANILA = ZoneInfo('Asia/Manila')


def _format_local(value):
    return timezone.localtime(value, _MANILA).strftime('%Y-%m-%d %H:%M')


def _send_and_log(*, document, recipient_user, recipient_email, notification_type, subject, body):
    """
    Sends one email via Django's send_mail and unconditionally writes one
    EmailNotificationLog row recording the outcome. Wrapped in try/except so
    a single bad recipient/SMTP error never crashes the overdue-scan batch
    loop or the release_to_citizen()/advance_processing_stage() call that
    triggers a citizen email — it just gets logged as FAILED, not raised.
    Returns EmailNotificationLog.Status.SENT or .FAILED so the caller (e.g.
    the "Release to Citizen" button's view) can report a truthful outcome
    back to staff instead of assuming success.
    """
    try:
        # Plain text plus the branded HTML version (email_html.py), built from
        # the same text so the two always say the same thing.
        from .email_html import build_email_html
        html = build_email_html(subject, body, notification_type)
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [recipient_email], fail_silently=False, html_message=html)
        result_status, error_message = EmailNotificationLog.Status.SENT, ''
    except Exception as exc:
        result_status, error_message = EmailNotificationLog.Status.FAILED, str(exc)

    EmailNotificationLog.objects.create(
        document=document,
        recipient=recipient_user,
        recipient_email=recipient_email,
        notification_type=notification_type,
        subject=subject,
        body=body,
        status=result_status,
        error_message=error_message,
    )
    return result_status


def _requester_display_name(document):
    """
    Human name for a document's requester, account or walk-in. guest_name
    (staff-entered, required alongside guest_email at request-creation time
    — see CreateDocumentSerializer.validate()) is the authoritative source
    for a walk-in; form_data.applicant_name is only read as a fallback for
    documents created before guest_name existed. The final 'N/A' fallback
    should be unreachable going forward now that guest_name is required,
    but is kept as a safety net for that legacy data.
    """
    if document.requested_by:
        return document.requested_by.full_name
    return document.guest_name or document.form_data.get('applicant_name') or 'N/A (walk-in request)'


def _format_duration(hours):
    """
    Renders an hour count as whichever unit reads more naturally: days once
    it crosses 24h (e.g. an SLA of 72h), plain hours below that (e.g. an
    SLA of 1h or 4h, common for same-office quick steps) — always with the
    precise hour figure alongside so nothing is lost to rounding.
    """
    return format_hours_minutes(hours)


def _resolve_citizen_recipient(document):
    """
    Returns (name, email) for the citizen-facing "ready for release" email,
    or None if there's nowhere to send it. A registered citizen's own
    account email always wins when available (kept current by the citizen
    themselves); a walk-in with no account (requested_by is None) falls
    back to the guest_email a staff member entered at request-creation
    time. Never both — an unlinked walk-in has no account to leak, and a
    linked citizen's own address always takes priority over any guest_email
    left unused on the row.
    """
    citizen = document.requested_by
    if citizen and citizen.role == citizen.Role.CITIZEN and citizen.is_active and citizen.email:
        return citizen.full_name, citizen.email
    if not citizen and document.guest_email:
        return _requester_display_name(document), document.guest_email
    return None


def document_portal_link(document):
    """Opens this document's record in the staff portal (signing in first if needed)."""
    return f"{settings.FRONTEND_BASE_URL.rstrip('/')}/employee/documents?doc={document.id}"


def _document_title(document):
    """A request has no title field; its purpose (when the form asks) describes it."""
    purpose = (document.form_data or {}).get('purpose')
    return str(purpose).strip() if purpose else ''


def send_overdue_warning_email(document, staff_user, sla_hours, dwell_hours, due_at):
    """
    Staff-facing alert for one document that has reached or passed its
    current step's SLA — see sla_scan.run_overdue_scan(), the only caller
    (shared by the background scheduler, the check_overdue_documents
    command, the cron endpoint and the admin 'Run Scan Now' action).
    """
    overdue_by_hours = dwell_hours - sla_hours
    title = _document_title(document)
    subject = f"[OVERDUE ALERT] Document Tracking No. {document.tracking_number} - Immediate Action Required"
    next_step = f"send it to {document.next_office}" if document.next_office else "complete the transaction"
    body = (
        f"Good day, {staff_user.full_name}.\n\n"
        f"OVERDUE: a document in your office's queue has passed its processing time limit "
        f"(SLA) and has not been sent on or completed yet. Please process it and {next_step} "
        f"right away.\n\n"
        f"Document Type: {document.document_type.name}\n"
        + (f"Document Title / Purpose: {title}\n" if title else "")
        + f"Tracking Code: {document.tracking_number}\n"
        f"Citizen/Requester: {_requester_display_name(document)}\n"
        f"Current Office: {document.current_office}\n"
        f"Received by Office: {_format_local(document.entered_current_office_at)}\n"
        f"Due: {_format_local(due_at)}\n\n"
        f"Time Elapsed: {_format_duration(dwell_hours)}\n"
        f"SLA Threshold: {format_hours_minutes(sla_hours)}\n"
        f"Status: "
        + (f"Overdue by {_format_duration(overdue_by_hours)}" if overdue_by_hours >= 1 / 60 else "SLA limit reached")
        + "\n\n"
        f"Open the document and {next_step} here:\n{document_portal_link(document)}\n\n"
        f"This is an automated alert from Sariaya DocTrack. You will not get another "
        f"overdue alert for this document while it stays at your office.\n"
    )
    _send_and_log(
        document=document,
        recipient_user=staff_user,
        recipient_email=staff_user.email,
        notification_type=EmailNotificationLog.NotificationType.OVERDUE_WARNING,
        subject=subject,
        body=body,
    )


def send_not_received_email(document, staff_user, destination, sent_at, sla_hours, transit_hours, due_at):
    """
    Overdue alert for a document sent to the staff member's office that the
    office has not received (scanned in) within that step's SLA — see
    sla_scan.run_overdue_scan(). Logged as an overdue warning.
    """
    overdue_by_hours = transit_hours - sla_hours
    title = _document_title(document)
    subject = f"[OVERDUE ALERT] Document Tracking No. {document.tracking_number} - Immediate Action Required"
    body = (
        f"Good day, {staff_user.full_name}.\n\n"
        f"A document was sent to your office but has not been received yet, and it has "
        f"passed its processing time limit (SLA). Please locate the document and receive it "
        f"(scan it in) right away.\n\n"
        f"Document Type: {document.document_type.name}\n"
        + (f"Document Title / Purpose: {title}\n" if title else "")
        + f"Tracking Code: {document.tracking_number}\n"
        f"Citizen/Requester: {_requester_display_name(document)}\n"
        f"Sent by: {document.current_office}\n"
        f"Sent to: {destination}\n"
        f"Sent on: {_format_local(sent_at)}\n"
        f"Due: {_format_local(due_at)}\n\n"
        f"Time Elapsed: {_format_duration(transit_hours)}\n"
        f"SLA Threshold: {format_hours_minutes(sla_hours)}\n"
        f"Status: "
        + (f"Not received, overdue by {_format_duration(overdue_by_hours)}" if overdue_by_hours >= 1 / 60
           else "Not received, SLA limit reached")
        + "\n\n"
        f"Open the document here:\n{document_portal_link(document)}\n\n"
        f"This is an automated alert from Sariaya DocTrack. You will not get another "
        f"alert for this document until it is received.\n"
    )
    _send_and_log(
        document=document,
        recipient_user=staff_user,
        recipient_email=staff_user.email,
        notification_type=EmailNotificationLog.NotificationType.OVERDUE_WARNING,
        subject=subject,
        body=body,
    )


def send_pending_receipt_email(document, staff_user, destination, sent_at, waited_hours, sla_hours):
    """
    Friendly reminder to an office that a document sent to it is still in
    its Incoming queue, not yet received in the system — see
    sla_scan.run_overdue_scan(). Once per trip, before the trip's SLA runs
    out; past the SLA the office gets the overdue alert instead.
    """
    # Deferred import: services.py imports this module.
    from .services import _office_name

    title = _document_title(document)
    sender = _office_name(document.current_office)
    subject = f"[PENDING RECEIPT REMINDER] Incoming Document Tracking No. {document.tracking_number}"
    body = (
        f"Good day, {staff_user.full_name}.\n\n"
        f"A friendly reminder: {sender} sent a document to your office, and it is still "
        f"waiting in your Incoming queue. Once the paper is with you, please receive it in "
        f"the system so its tracking stays accurate.\n\n"
        f"Document Type: {document.document_type.name}\n"
        + (f"Document Title / Purpose: {title}\n" if title else "")
        + f"Tracking Code: {document.tracking_number}\n"
        f"Sent by: {sender}\n"
        f"Sent to: {destination}\n"
        f"Sent on: {_format_local(sent_at)}\n"
        f"Waiting for: {_format_duration(waited_hours)}\n"
        f"Time limit (SLA) for this step: {format_hours_minutes(sla_hours)}\n\n"
        f"Open the document and click Receive Document here:\n{document_portal_link(document)}\n\n"
        f"This is an automated reminder from Sariaya DocTrack. You will get it only once "
        f"for this document's trip to your office.\n"
    )
    _send_and_log(
        document=document,
        recipient_user=staff_user,
        recipient_email=staff_user.email,
        notification_type=EmailNotificationLog.NotificationType.PENDING_RECEIPT,
        subject=subject,
        body=body,
    )


def send_due_soon_email(document, staff_user, sla_hours, dwell_hours, due_at):
    """
    A milder heads-up sent once a document is approaching (but hasn't yet
    blown) its current step's SLA — see sla_scan.run_overdue_scan(), the
    only caller. Gives staff a chance to act before it becomes an Overdue
    Warning instead of finding out only after the fact.
    """
    remaining_hours = sla_hours - dwell_hours
    subject = f"Document Approaching Due Date — {document.tracking_number}"
    body = (
        f"A document assigned to your office is approaching its due date.\n\n"
        f"Document: {document.document_type.name}\n"
        f"Reference No.: {document.tracking_number}\n"
        f"Citizen/Requester: {_requester_display_name(document)}\n"
        f"Date Submitted: {_format_local(document.created_at)}\n"
        f"Current Office: {document.current_office}\n"
        f"Received by Office: {_format_local(document.entered_current_office_at)}\n"
        f"Due Date: {_format_local(due_at)}\n"
        f"Applicable SLA: {format_hours_minutes(sla_hours)}\n"
        f"Time Remaining: {_format_duration(remaining_hours)}\n\n"
        f"Required Action: Please review and process this request before it becomes overdue:\n"
        f"{document_portal_link(document)}\n"
    )
    _send_and_log(
        document=document,
        recipient_user=staff_user,
        recipient_email=staff_user.email,
        notification_type=EmailNotificationLog.NotificationType.DUE_SOON,
        subject=subject,
        body=body,
    )


def send_ready_for_release_staff_email(document, staff_user):
    """
    Staff-facing counterpart of send_ready_for_release_email() below: tells
    the office now holding the finished document to expect the citizen — see
    services.py::_notify_office_ready(), the only caller.
    """
    subject = f"Document Ready for Release — {document.tracking_number}"
    if document.document_type.scope == 'internal':
        who, action, requester_label = 'its originating office', 'Release to Originating Office', 'Requested by'
    else:
        who, action, requester_label = 'the citizen', 'Release to Citizen', 'Citizen/Requester'
    body = (
        f"A document at your office has completed its route and is ready for pickup by {who}.\n\n"
        f"Document: {document.document_type.name}\n"
        f"Reference No.: {document.tracking_number}\n"
        f"{requester_label}: {_requester_display_name(document)}\n"
        f"Date Submitted: {_format_local(document.created_at)}\n"
        f"Current Office: {document.current_office}\n\n"
        f"Required Action: Please keep this document ready, and mark it \"{action}\" "
        f"in the system once it is handed over.\n"
    )
    return _send_and_log(
        document=document,
        recipient_user=staff_user,
        recipient_email=staff_user.email,
        notification_type=EmailNotificationLog.NotificationType.READY_FOR_RELEASE_STAFF,
        subject=subject,
        body=body,
    )


def send_ready_for_release_email(document):
    """
    Citizen-facing pickup notice, sent when the document arrives back at its
    final office (services.py::receive_document()), so the citizen has time
    to come in before staff hand it over. release_to_citizen() also tries
    again in case that attempt failed. Both go through
    services.py::_maybe_notify_citizen_ready(), which guards against sending
    this twice for the same ready-for-pickup round.

    Returns EmailNotificationLog.Status.SENT/.FAILED, or the string
    'skipped' if there's nowhere valid to send it (no send attempted, no
    log row written) — see _resolve_citizen_recipient() for the
    registered-account-or-guest-email resolution.
    """
    recipient = _resolve_citizen_recipient(document)
    if not recipient:
        return 'skipped'
    name, email = recipient

    # Deferred import: services.py imports send_ready_for_release_email from
    # this module, so importing resolve_office at module scope here would
    # create a circular import — importing it inside the function (only
    # needed once services.py has already finished loading) avoids that.
    from .services import resolve_office

    office = resolve_office(document.current_office)
    claim_where = document.current_office
    if office and office.floor:
        claim_where += f", {office.floor}"
    if office and office.location:
        claim_where += f" ({office.location})"
    office_hours = office.office_hours if office and office.office_hours else 'regular office hours'
    contact_line = (
        f"If you have any questions, please contact {office.contact_person} at {document.current_office}.\n"
        if office and office.contact_person
        else f"If you have any questions, please contact the {document.current_office} office.\n"
    )

    subject = "Your Requested Document is Ready for Pickup"
    body = (
        f"Dear {name},\n\n"
        f"Good day!\n\n"
        f"We would like to inform you that your requested {document.document_type.name} "
        f"is now ready for pickup/release.\n\n"
        f"Request Number: {document.tracking_number}\n"
        f"Document: {document.document_type.name}\n"
        f"Status: Ready for Pickup\n\n"
        f"You may claim your document at {claim_where} during {office_hours}.\n\n"
        f"Please bring a valid ID (and this reference number) when claiming your document.\n\n"
        f"You can check the status of your request here:\n"
        f"{settings.FRONTEND_BASE_URL.rstrip('/')}/track/{document.tracking_number}\n\n"
        f"{contact_line}\n"
        f"Thank you.\n\n"
        f"Sariaya Office of the Municipal Administrator\n"
    )
    return _send_and_log(
        document=document,
        recipient_user=document.requested_by,
        recipient_email=email,
        notification_type=EmailNotificationLog.NotificationType.READY_FOR_RELEASE,
        subject=subject,
        body=body,
    )
