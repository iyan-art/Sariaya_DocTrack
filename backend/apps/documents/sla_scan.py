"""
Core SLA-scan logic shared by three entry points that all need to run the
exact same rules: the check_overdue_documents / flag_overdue_documents
management commands (for an OS-level scheduler in production), the
in-process background scheduler in scheduler.py (so a plain `runserver` dev
box still sends emails automatically, with no OS-level cron required), and
the admin-triggered "Run Scan Now" action wired into the notification bell
(RunSlaScanView in views.py, for demoing/verifying the feature on demand).
Keeping the logic here once means all three can never drift out of sync
with each other.
"""
from datetime import timedelta

from django.conf import settings
from django.db.models import F, Q
from django.utils import timezone

from .durations import format_hours_minutes
from .business_hours import add_business_hours, business_hours_between
from .models import Document, DocumentLog, EmailNotificationLog, MissingDocumentAlert, Notification, ScheduledTaskRun
from .notifications import (
    send_due_soon_email, send_not_received_email, send_overdue_warning_email, send_pending_receipt_email,
)
from .services import (
    _office_name, in_transit_destination, in_transit_since, notify_admins, notify_citizen, office_employees,
    resolve_office, responsible_employees,
)

# Only used if a document's route_position has somehow drifted out of range
# for its DocumentType's WorkflowStep rows — a data-integrity edge case, not
# a competing SLA definition. Every properly-configured document is always
# judged against its own current step's WorkflowStep.max_hours_allowed.
DEFAULT_FALLBACK_SLA_HOURS = 48

# The flat Overdue-alert threshold at one office, independent of any
# document's own per-step SLA — see run_overdue_alert_scan()'s docstring.
DEFAULT_OVERDUE_ALERT_HOURS = 48

# A document counts as "approaching its due date" once its dwell time
# crosses this fraction of its own SLA, provided it hasn't already blown
# the SLA outright (that's an Overdue Warning instead — see
# run_overdue_scan()). 0.8 of a 4h SLA is 3.2h in, i.e. an 0.8h/48min
# window to react before it tips into Overdue.
DUE_SOON_THRESHOLD_RATIO = 0.8


def claim_scheduled_run(name, min_interval_seconds):
    """
    True for the one caller allowed to run job `name` now: it last ran at
    least `min_interval_seconds` ago (or never). The claim is a single
    conditional UPDATE, so two server processes asking at the same moment
    can't both win, and a job never runs twice in one interval.
    """
    now = timezone.now()
    run, created = ScheduledTaskRun.objects.get_or_create(name=name, defaults={'last_run_at': now})
    if created:
        return True
    return bool(
        ScheduledTaskRun.objects
        .filter(pk=run.pk, last_run_at__lte=now - timedelta(seconds=min_interval_seconds))
        .update(last_run_at=now)
    )


def run_server_overdue_scan():
    """
    run_overdue_scan() as the web server runs it (scheduler, cron endpoint,
    "Run Scan Now"). Skipped when OVERDUE_EMAILS_EXTERNAL is set: that host
    cannot send email, so a scan there would only record failed sends and
    use up the retries meant for the GitHub Actions job that can send them.
    """
    if settings.OVERDUE_EMAILS_EXTERNAL:
        return {'skipped': True, 'detail': 'Overdue emails are sent by the GitHub Actions job.'}
    return run_overdue_scan()


def run_scheduled_scans(min_interval_seconds):
    """
    The automatic run of both scans (background scheduler and cron endpoint).
    Returns None when another process already ran them within the interval.
    """
    if not claim_scheduled_run('sla_scan', min_interval_seconds):
        return None
    return {'overdue': run_server_overdue_scan(), 'overdue_alerts': run_overdue_alert_scan()}


# A send that failed (no internet, mail server down) is tried again on the
# next scans, up to this many attempts per person per stay at an office.
MAX_EMAIL_ATTEMPTS = 3


def _episode_emails(document, kind, since=None):
    """Emails of this kind about the document since `since` (default: its arrival at its current office)."""
    return EmailNotificationLog.objects.filter(
        document=document, notification_type=kind,
        sent_at__gte=since or document.entered_current_office_at,
    )


def _still_to_email(document, kind, staff=None, since=None):
    """
    The employees who should get this email now: by default the document's
    current office (`staff` overrides that), keeping those who want overdue
    alerts, have not received it since `since`, and have not already failed
    MAX_EMAIL_ATTEMPTS times. One email per person per stay; a failed send
    does not count as received, so it is retried.
    """
    logs = _episode_emails(document, kind, since)
    received = set(logs.filter(status=EmailNotificationLog.Status.SENT).values_list('recipient_id', flat=True))
    failures = {}
    for recipient_id in logs.filter(status=EmailNotificationLog.Status.FAILED).values_list('recipient_id', flat=True):
        failures[recipient_id] = failures.get(recipient_id, 0) + 1
    return [
        person for person in (responsible_employees(document) if staff is None else staff)
        if person.wants_notification('overdue_alerts')
        and person.id not in received
        and failures.get(person.id, 0) < MAX_EMAIL_ATTEMPTS
    ]


# A document sent to an office but not received there gets a reminder to
# that office after PENDING_RECEIPT_HOURS working hours, or after half the
# step's SLA if that comes first (a 1-hour step would be overdue by then).
PENDING_RECEIPT_HOURS = 1
PENDING_RECEIPT_SLA_RATIO = 0.5


def pending_receipt_threshold(sla_hours):
    return min(PENDING_RECEIPT_HOURS, sla_hours * PENDING_RECEIPT_SLA_RATIO)


def _scan_not_received(now):
    """
    In Transit documents (sent, not yet received), timed from when they were
    sent, for the staff of the office that has to receive them:
    - waiting past pending_receipt_threshold(): a Pending Receipt Reminder;
    - past the SLA of the step they are headed to: an overdue alert.
    Each once per trip. Returns (overdue documents, overdue emails,
    documents reminded, reminder emails).
    """
    documents = emails = reminded = reminders = 0
    overdue_kind = EmailNotificationLog.NotificationType.OVERDUE_WARNING
    reminder_kind = EmailNotificationLog.NotificationType.PENDING_RECEIPT
    in_transit = Document.objects.filter(status=Document.Status.IN_TRANSIT).select_related('document_type')
    for document in in_transit:
        position, destination = in_transit_destination(document)
        if destination is None:
            continue
        steps = list(document.document_type.steps.all())
        sla_hours = steps[position].max_hours_allowed if position < len(steps) else DEFAULT_FALLBACK_SLA_HOURS
        sent_at = in_transit_since(document)
        transit_hours = business_hours_between(sent_at, now)
        if transit_hours >= sla_hours:
            documents += 1
            due_at = add_business_hours(sent_at, sla_hours)
            for staff in _still_to_email(document, overdue_kind, staff=office_employees(destination), since=sent_at):
                send_not_received_email(document, staff, destination, sent_at, sla_hours, transit_hours, due_at)
                emails += 1
        elif transit_hours >= pending_receipt_threshold(sla_hours):
            reminded += 1
            for staff in _still_to_email(document, reminder_kind, staff=office_employees(destination), since=sent_at):
                send_pending_receipt_email(document, staff, destination, sent_at, transit_hours, sla_hours)
                reminders += 1
    return documents, emails, reminded, reminders


def run_overdue_scan():
    """
    Scans every Active (In Progress) document, compares its elapsed dwell
    time at its current office against that step's own configured SLA
    (WorkflowStep.max_hours_allowed — the document's "configured SLA
    hours"), and for each one either:

    - past its SLA: emails every responsible Employee (see
      services.py::responsible_employees()) an Overdue Warning, once per
      overdue episode; or
    - within DUE_SOON_THRESHOLD_RATIO of its SLA but not past it yet: sends
      a milder Approaching Due Date heads-up instead, also once per episode.

    In Transit documents (sent but not received) are checked too, against
    the SLA of the step they are headed to: see _scan_not_received().

    "Once per episode" means skipped if we've already sent that
    notification type since this document arrived at its current office.
    Because entered_current_office_at resets on every legitimate transfer
    (see services.py::receive_document()), this naturally re-arms after the
    document moves on — and since the query only looks at
    status=IN_PROGRESS, a document that has since been released, returned,
    completed, or transferred simply drops out of consideration, so it can
    never keep generating warnings after that.
    """
    now = timezone.now()
    active_documents = Document.objects.filter(
        status__in=Document.ACTIONABLE_STATUSES,
    ).select_related('document_type', 'current_handler')

    documents_overdue = 0
    overdue_emails_sent = 0
    documents_due_soon = 0
    due_soon_emails_sent = 0

    for document in active_documents:
        steps = list(document.document_type.steps.all())  # ordered by step_number (Meta.ordering)
        if document.route_position < len(steps):
            sla_hours = steps[document.route_position].max_hours_allowed
        else:
            sla_hours = DEFAULT_FALLBACK_SLA_HOURS

        dwell_hours = business_hours_between(document.entered_current_office_at, now)
        due_at = add_business_hours(document.entered_current_office_at, sla_hours)

        if dwell_hours >= sla_hours:  # reached or past its SLA = Overdue
            documents_overdue += 1
            kind = EmailNotificationLog.NotificationType.OVERDUE_WARNING
            first_time = not _episode_emails(document, kind).exists()
            for staff in _still_to_email(document, kind):
                send_overdue_warning_email(document, staff, sla_hours, dwell_hours, due_at)
                overdue_emails_sent += 1
            if not first_time:
                continue

            # Admin-facing in-app bottleneck alert — once per overdue
            # episode (re-arms once the document moves on), not every scan.
            notify_admins(
                title=f"Bottleneck: {document.tracking_number}",
                message=(
                    f"Document {document.tracking_number} ({document.document_type.name}) has "
                    f"exceeded its allowed processing time at {document.current_office} "
                    f"({format_hours_minutes(dwell_hours)} elapsed, SLA: {format_hours_minutes(sla_hours)})."
                ),
                notification_type=Notification.NotificationType.BOTTLENECK_ALERT,
                related_document=document,
            )
            notify_citizen(
                document,
                title="Taking longer than expected",
                message=(
                    f"Your {document.document_type.name} request ({document.tracking_number}) is taking longer "
                    f"than expected at {_office_name(document.current_office)}. The office has been reminded. You can also "
                    f"send a follow-up from your request history."
                ),
            )

        elif dwell_hours >= sla_hours * DUE_SOON_THRESHOLD_RATIO:
            documents_due_soon += 1
            for staff in _still_to_email(document, EmailNotificationLog.NotificationType.DUE_SOON):
                send_due_soon_email(document, staff, sla_hours, dwell_hours, due_at)
                due_soon_emails_sent += 1

    documents_not_received, not_received_emails_sent, documents_pending_receipt, reminders_sent = _scan_not_received(now)

    return {
        'documents_overdue': documents_overdue + documents_not_received,
        'emails_sent': overdue_emails_sent + not_received_emails_sent,
        'documents_not_received': documents_not_received,
        'documents_pending_receipt': documents_pending_receipt,
        'pending_receipt_reminders_sent': reminders_sent,
        'documents_due_soon': documents_due_soon,
        'due_soon_emails_sent': due_soon_emails_sent,
    }


def run_overdue_alert_scan(hours=DEFAULT_OVERDUE_ALERT_HOURS):
    """
    A flat, SLA-independent safety net: any document In Progress, Returned
    or In Transit for more than `hours` (default 48) at its current office
    is flagged Overdue — an entry in its history and an alert in the admin's
    feed — regardless of what its own per-step SLA says, so nothing sits
    unmonitored past 48h even if its configured SLA is longer.
    run_overdue_scan() above still sends the per-step SLA emails.

    Being late is not being lost: the status is left alone, so the office
    can still release the document. "Missing" is reserved for an office
    reporting that the physical copy never arrived (services.flag_missing()).
    An alert resolves itself once its document leaves that office.
    """
    now = timezone.now()
    cutoff = now - timedelta(hours=hours)
    overdue_alerts = MissingDocumentAlert.objects.filter(
        kind=MissingDocumentAlert.Kind.OVERDUE, status=MissingDocumentAlert.Status.ACTIVE,
    )
    alerts_resolved = overdue_alerts.filter(
        Q(raised_at__lt=F('document__entered_current_office_at'))
        | Q(document__status__in=[Document.Status.COMPLETED, Document.Status.RELEASED])
    ).update(status=MissingDocumentAlert.Status.RESOLVED, resolved_at=now)

    # `hours` counts working hours only (business_hours.py), so a weekend or
    # holiday never flags a document. Every working hour is also a calendar
    # hour, so the calendar cutoff only narrows down the candidates.
    stuck_documents = [
        document for document in Document.objects.filter(
            status__in=[*Document.ACTIONABLE_STATUSES, Document.Status.IN_TRANSIT],
            entered_current_office_at__lte=cutoff,
        )
        if business_hours_between(document.entered_current_office_at, now) >= hours
    ]
    total_stuck = len(stuck_documents)

    alerts_created = 0
    for document in stuck_documents:
        # Already flagged for this stay at this office — don't repeat every run.
        if overdue_alerts.filter(document=document).exists():
            continue

        MissingDocumentAlert.objects.create(
            document=document,
            kind=MissingDocumentAlert.Kind.OVERDUE,
            days_delayed=(now - document.entered_current_office_at).days,
            notes=f"At '{document.current_office}' for over {format_hours_minutes(hours)}.",
        )
        DocumentLog.objects.create(
            document=document,
            action=DocumentLog.Action.FLAGGED_OVERDUE,
            office=resolve_office(document.current_office),
            acted_by=None,  # the scheduled check, not a staff member
            notes=f"Flagged Overdue by the scheduled SLA check: over {format_hours_minutes(hours)} at '{document.current_office}'.",
        )
        alerts_created += 1

    return {'total_stuck': total_stuck, 'alerts_created': alerts_created, 'alerts_resolved': alerts_resolved}
