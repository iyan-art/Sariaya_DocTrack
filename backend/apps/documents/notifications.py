from django.conf import settings
from django.core.mail import send_mail

from .models import EmailNotificationLog


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
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [recipient_email], fail_silently=False)
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
    if hours >= 24:
        return f"{hours / 24:.1f} day(s) ({hours:.1f} hour(s))"
    return f"{hours:.1f} hour(s)"


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


def send_overdue_warning_email(document, staff_user, sla_hours, dwell_hours, due_at):
    """
    Staff-facing SLA breach warning for one document sitting past its
    current step's configured SLA — see sla_scan.run_overdue_scan(), the
    only caller (shared by the check_overdue_documents management command,
    the background scheduler, and the admin 'Run Scan Now' action).
    """
    overdue_by_hours = dwell_hours - sla_hours
    subject = f"Overdue Document Warning — {document.tracking_number}"
    body = (
        f"You have a document/request that requires your attention.\n\n"
        f"Document: {document.document_type.name}\n"
        f"Reference No.: {document.tracking_number}\n"
        f"Citizen/Requester: {_requester_display_name(document)}\n"
        f"Date Submitted: {document.created_at:%Y-%m-%d %H:%M}\n"
        f"Current Office: {document.current_office}\n"
        f"Received by Office: {document.entered_current_office_at:%Y-%m-%d %H:%M}\n"
        f"Due Date: {due_at:%Y-%m-%d %H:%M}\n"
        f"Applicable SLA: {sla_hours} hour(s)\n"
        f"Elapsed Processing Time: {_format_duration(dwell_hours)}\n"
        f"Status: Overdue by {_format_duration(overdue_by_hours)}\n\n"
        f"Required Action: Please log in to the system to review and process this request.\n"
    )
    _send_and_log(
        document=document,
        recipient_user=staff_user,
        recipient_email=staff_user.email,
        notification_type=EmailNotificationLog.NotificationType.OVERDUE_WARNING,
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
        f"Date Submitted: {document.created_at:%Y-%m-%d %H:%M}\n"
        f"Current Office: {document.current_office}\n"
        f"Received by Office: {document.entered_current_office_at:%Y-%m-%d %H:%M}\n"
        f"Due Date: {due_at:%Y-%m-%d %H:%M}\n"
        f"Applicable SLA: {sla_hours} hour(s)\n"
        f"Time Remaining: {_format_duration(remaining_hours)}\n\n"
        f"Required Action: Please log in to the system to review and process this request "
        f"before it becomes overdue.\n"
    )
    _send_and_log(
        document=document,
        recipient_user=staff_user,
        recipient_email=staff_user.email,
        notification_type=EmailNotificationLog.NotificationType.DUE_SOON,
        subject=subject,
        body=body,
    )


def send_ready_for_release_email(document):
    """
    Citizen-facing pickup notice. Two call sites (see services.py):
    advance_processing_stage() fires this automatically for soft-copy
    documents the moment they reach ProcessingStage.READY_FOR_RELEASE
    (their only notification point, since there's no later physical
    hand-off); release_to_citizen() fires it for hard-copy documents at the
    actual "Release to Citizen" button click — the moment staff confirms
    the document is ready, rather than the earlier moment it merely arrived
    back at the origin office. Both routes go through
    services.py::_maybe_notify_citizen_ready(), which guards against ever
    sending this more than once for the same document.

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
