"""
Core SLA-scan logic shared by three entry points that all need to run the
exact same rules: the check_overdue_documents / check_missing_documents
management commands (for an OS-level scheduler in production), the
in-process background scheduler in scheduler.py (so a plain `runserver` dev
box still sends emails automatically, with no OS-level cron required), and
the admin-triggered "Run Scan Now" action wired into the notification bell
(RunSlaScanView in views.py, for demoing/verifying the feature on demand).
Keeping the logic here once means all three can never drift out of sync
with each other.
"""
from datetime import timedelta

from django.utils import timezone

from apps.accounts.models import User
from .models import Document, EmailNotificationLog, MissingDocumentAlert
from .notifications import send_overdue_warning_email, send_due_soon_email
from .services import _same_office, flag_missing

# Only used if a document's route_position has somehow drifted out of range
# for its DocumentType's WorkflowStep rows — a data-integrity edge case, not
# a competing SLA definition. Every properly-configured document is always
# judged against its own current step's WorkflowStep.max_hours_allowed.
DEFAULT_FALLBACK_SLA_HOURS = 48

# The flat "presumed lost" monitoring threshold, independent of any
# document's own per-step SLA — see run_missing_scan()'s docstring.
DEFAULT_MISSING_SLA_HOURS = 48

# A document counts as "approaching its due date" once its dwell time
# crosses this fraction of its own SLA, provided it hasn't already blown
# the SLA outright (that's an Overdue Warning instead — see
# run_overdue_scan()). 0.8 of a 4h SLA is 3.2h in, i.e. an 0.8h/48min
# window to react before it tips into Overdue.
DUE_SOON_THRESHOLD_RATIO = 0.8


def _sla_recipients(document):
    """
    Who gets a staff-facing SLA email for one document: every active
    Employee at its current office (so the whole team stays aware even if
    the one who scanned it in is out that day), PLUS the employee actually
    holding it right now (document.current_handler) even if their
    User.office string happens to have drifted out of sync with the
    office's canonical code — the person who scanned it in should never be
    the one left out of "the employee responsible for this document".
    Deduplicated by user id so current_handler is never emailed twice.
    """
    recipients = {
        staff.id: staff
        for staff in User.objects.filter(role=User.Role.EMPLOYEE, is_active=True)
        if _same_office(staff.office, document.current_office)
    }
    handler = document.current_handler
    if handler and handler.role == User.Role.EMPLOYEE and handler.is_active:
        recipients[handler.id] = handler
    return list(recipients.values())


def run_overdue_scan():
    """
    Scans every Active (In Progress) document, compares its elapsed dwell
    time at its current office against that step's own configured SLA
    (WorkflowStep.max_hours_allowed — the document's "configured SLA
    hours"), and for each one either:

    - past its SLA: emails every responsible Employee (see
      _sla_recipients()) an Overdue Warning, once per overdue episode; or
    - within DUE_SOON_THRESHOLD_RATIO of its SLA but not past it yet: sends
      a milder Approaching Due Date heads-up instead, also once per episode.

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
        status=Document.Status.IN_PROGRESS,
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

        dwell_hours = (now - document.entered_current_office_at).total_seconds() / 3600
        due_at = document.entered_current_office_at + timedelta(hours=sla_hours)

        if dwell_hours > sla_hours:
            documents_overdue += 1
            already_warned = EmailNotificationLog.objects.filter(
                document=document,
                notification_type=EmailNotificationLog.NotificationType.OVERDUE_WARNING,
                sent_at__gte=document.entered_current_office_at,
            ).exists()
            if already_warned:
                continue
            for staff in _sla_recipients(document):
                send_overdue_warning_email(document, staff, sla_hours, dwell_hours, due_at)
                overdue_emails_sent += 1

        elif dwell_hours >= sla_hours * DUE_SOON_THRESHOLD_RATIO:
            documents_due_soon += 1
            already_notified = EmailNotificationLog.objects.filter(
                document=document,
                notification_type=EmailNotificationLog.NotificationType.DUE_SOON,
                sent_at__gte=document.entered_current_office_at,
            ).exists()
            if already_notified:
                continue
            for staff in _sla_recipients(document):
                send_due_soon_email(document, staff, sla_hours, dwell_hours, due_at)
                due_soon_emails_sent += 1

    return {
        'documents_overdue': documents_overdue,
        'emails_sent': overdue_emails_sent,
        'documents_due_soon': documents_due_soon,
        'due_soon_emails_sent': due_soon_emails_sent,
    }


def run_missing_scan(hours=DEFAULT_MISSING_SLA_HOURS):
    """
    A flat, SLA-independent safety net: any document In Progress or In
    Transit for more than `hours` (default 48) at its current office gets
    flagged Missing and raised as a MissingDocumentAlert, regardless of what
    its own per-step SLA says. This is what guarantees a document is never
    silently sitting unmonitored past 48h even if its configured SLA is
    longer (e.g. 72h) — run_overdue_scan() above still governs when a
    document counts as "Overdue" against its own SLA; this is the
    independent, more severe 48h ceiling underneath it.
    """
    cutoff = timezone.now() - timedelta(hours=hours)

    stuck_documents = Document.objects.filter(
        status__in=[Document.Status.IN_PROGRESS, Document.Status.IN_TRANSIT],
        entered_current_office_at__lte=cutoff,
    )
    total_stuck = stuck_documents.count()

    alerts_created = 0
    for document in stuck_documents:
        # Already flagged and unresolved — don't spam a new alert every run.
        if document.missing_alerts.filter(status=MissingDocumentAlert.Status.ACTIVE).exists():
            continue

        days_delayed = (timezone.now() - document.entered_current_office_at).days

        MissingDocumentAlert.objects.create(
            document=document,
            days_delayed=days_delayed,
            notes=f"Stuck at '{document.current_office}' for over {hours}h.",
        )
        # flagging_user=None: this is a system/scheduled action, not a staff member acting.
        flag_missing(
            document, flagging_user=None,
            notes=f"Auto-flagged by scheduled SLA check: exceeded {hours}h at '{document.current_office}'.",
        )
        alerts_created += 1

    return {'total_stuck': total_stuck, 'alerts_created': alerts_created}
