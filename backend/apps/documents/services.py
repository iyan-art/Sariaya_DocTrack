from django.utils import timezone
from rest_framework.exceptions import ValidationError
from apps.accounts.models import User
from .models import Document, DocumentLog, EmailNotificationLog, Notification, Office, RequestStatusHistory
from .notifications import send_ready_for_release_email

# Mirrors sla_scan.py's DEFAULT_FALLBACK_SLA_HOURS (duplicated, not
# imported, to avoid a circular import — sla_scan.py already imports FROM
# this module). Same data-integrity edge case: only used if a document's
# route_position has somehow drifted out of range for its WorkflowStep rows.
DEFAULT_FALLBACK_SLA_HOURS = 48


def notify_office(office_label, title, message, notification_type, sender=None, related_document=None, exclude_user=None):
    """
    Creates an in-app Notification (the bell-icon inbox, NOT an
    EmailNotificationLog) for every active staff member assigned to
    `office_label` — case-insensitively, same seam as _same_office()/
    resolve_office() between the free-text User.office and the canonical
    Office.code. `exclude_user` skips the acting user themselves, so staff
    never get notified about their own action.
    """
    recipients = User.objects.filter(
        office__iexact=(office_label or '').strip(), role__in=[User.Role.EMPLOYEE, User.Role.ADMIN], is_active=True,
    )
    if exclude_user:
        recipients = recipients.exclude(id=exclude_user.id)
    Notification.objects.bulk_create([
        Notification(
            recipient=user, sender=sender, title=title, message=message,
            notification_type=notification_type, related_document=related_document,
        )
        for user in recipients
    ])


def notify_admins(title, message, notification_type, sender=None, related_document=None):
    """Same as notify_office(), but every active admin regardless of office."""
    recipients = User.objects.filter(role=User.Role.ADMIN, is_active=True)
    Notification.objects.bulk_create([
        Notification(
            recipient=user, sender=sender, title=title, message=message,
            notification_type=notification_type, related_document=related_document,
        )
        for user in recipients
    ])


def can_delete_document(document, user):
    """
    A document request can be deleted/cancelled by its citizen owner or by
    staff while it's still sitting untouched at its origin office — before
    any office transfer has actually happened (status IN_PROGRESS,
    route_position 0). An admin can override this and delete at any stage.
    """
    if user.role == 'admin':
        return True
    return document.status == Document.Status.IN_PROGRESS and document.route_position == 0


def _maybe_notify_citizen_ready(document):
    """
    Sends the citizen "ready for pickup" email (see
    notifications.py::send_ready_for_release_email()) at most once per
    document, ever — this is a one-time terminal notification, not a
    recurring SLA reminder, so unlike the overdue/due-soon emails there's no
    time window to re-arm. Called from release_to_citizen()'s explicit
    "Release to Citizen" button/scan action; this guard just means a
    document can never end up double-notified even if that's somehow
    triggered more than once for the same document.

    Returns 'sent', 'failed', 'skipped' (no valid recipient — see
    _resolve_citizen_recipient()), or 'already_sent' (a previous call
    already notified this citizen successfully).
    """
    already_sent = EmailNotificationLog.objects.filter(
        document=document,
        notification_type=EmailNotificationLog.NotificationType.READY_FOR_RELEASE,
        status=EmailNotificationLog.Status.SENT,
    ).exists()
    if already_sent:
        return 'already_sent'
    return send_ready_for_release_email(document)


def _same_office(label_a, label_b):
    """
    Case/whitespace-insensitive comparison between two office labels.
    Needed because Document.current_office/route store Office.code values
    (always uppercase, since sync_route_from_steps() reads office__code),
    while User.office is still a free-text string admins type in — this is
    the seam between the two until User.office also becomes an Office FK.
    """
    return (label_a or '').strip().casefold() == (label_b or '').strip().casefold()


def resolve_office(label):
    """
    Best-effort lookup of an Office row matching a free-text label (matches
    against code first, then name, both case-insensitively). Returns None
    rather than raising if nothing matches, so a mismatched/unset User.office
    never blocks a scan from completing — it just leaves DocumentLog.office
    null for that entry instead of hard-failing the whole transfer.
    """
    if not label:
        return None
    label = label.strip()
    return (
        Office.objects.filter(code__iexact=label).first()
        or Office.objects.filter(name__iexact=label).first()
    )


def advance_processing_stage(document, stage, actor=None, note=''):
    """
    Advances the citizen-facing processing-stage narrative (Document.
    ProcessingStage) and logs a RequestStatusHistory row — the source of the
    Shopee-style tracking stepper on the public Track page. Purely additive:
    never touches Document.status or anything the physical release/receive/
    return engine below reads. Called automatically at the two physical
    milestones that unambiguously map onto a citizen-facing stage (document
    fully routed back to origin -> "Ready for Release"; handed to the
    citizen -> "Completed"), and separately by staff for the earlier
    narrative stages that have no physical-transfer equivalent at all
    (Under Review, Form Processing, For Approval, ...).

    Does NOT notify the citizen — every document's "ready for pickup" email
    fires from release_to_citizen() instead, at the moment staff actually
    confirms the hand-off, not the earlier moment it merely arrived back at
    the origin office and could still sit unconfirmed in a drawer for days.
    """
    previous_stage = document.processing_stage
    document.processing_stage = stage
    document.save(update_fields=['processing_stage'])
    RequestStatusHistory.objects.create(document=document, stage=stage, changed_by=actor, note=note)


def release_document(document, releasing_user, notes='', qr_verified=False):
    """
    Sending office scans OUT: marks the document In Transit toward the next
    office in its route. Nothing may be received until this has happened —
    receive_document() below enforces that.
    """
    if document.status != Document.Status.IN_PROGRESS:
        raise ValidationError(f"Cannot release a document that is '{document.status}'.")

    if not _same_office(releasing_user.office, document.current_office):
        raise ValidationError(
            f"Your current assigned office ('{releasing_user.office or 'none'}') does not match the "
            f"office required for this step ('{document.current_office}')."
        )

    route = document.document_type.route
    next_position = document.route_position + 1
    if next_position >= len(route):
        raise ValidationError("This document has already finished its route.")

    document.status = Document.Status.IN_TRANSIT
    document.save()

    DocumentLog.objects.create(
        document=document,
        action=DocumentLog.Action.RELEASED,
        office=resolve_office(document.current_office),
        sender=releasing_user,
        acted_by=releasing_user,
        qr_verified=qr_verified,
        notes=notes,
    )

    next_office = route[next_position]
    notify_office(
        next_office,
        title=f"Incoming Document: {document.tracking_number}",
        message=(
            f"Document {document.tracking_number} ({document.document_type.name}) has been "
            f"forwarded to your office from {document.current_office}."
        ),
        notification_type=Notification.NotificationType.DOCUMENT_FORWARDED,
        sender=releasing_user, related_document=document, exclude_user=releasing_user,
    )

    return document


def return_document(document, returning_user, notes=''):
    """
    Controlled Return: sends an IN_PROGRESS document backward to whichever
    office last forwarded it (route[route_position - 1]), with a mandatory
    reason. Mirrors release_document() exactly, just in the opposite
    direction — sets IN_TRANSIT and leaves route_position untouched, so the
    target office receives it through the ordinary receive_document() flow
    (see its is_returning branch below), the same "Mark as Received"
    button/QR scan they already use for forward hand-offs.
    """
    if document.status != Document.Status.IN_PROGRESS:
        raise ValidationError(f"Cannot return a document that is '{document.status}'.")

    if not _same_office(returning_user.office, document.current_office):
        raise ValidationError(
            f"Your current assigned office ('{returning_user.office or 'none'}') does not match the "
            f"office required for this step ('{document.current_office}')."
        )

    if document.route_position == 0:
        raise ValidationError("This document is at its origin office and has no previous office to return to.")

    if not notes or not notes.strip():
        raise ValidationError("Please provide a reason for returning this document.")

    route = document.document_type.route
    previous_office = route[document.route_position - 1]

    document.status = Document.Status.IN_TRANSIT
    document.is_returning = True
    document.save()

    DocumentLog.objects.create(
        document=document,
        action=DocumentLog.Action.RETURN_INITIATED,
        office=resolve_office(document.current_office),
        sender=returning_user,
        acted_by=returning_user,
        notes=notes,
    )

    notify_office(
        previous_office,
        title=f"Document Returned: {document.tracking_number}",
        message=(
            f"Document {document.tracking_number} ({document.document_type.name}) has been sent "
            f"back to your office by {document.current_office}. Reason: {notes}"
        ),
        notification_type=Notification.NotificationType.DOCUMENT_RETURNED,
        sender=returning_user, related_document=document, exclude_user=returning_user,
    )

    return document


def receive_document(document, scanning_user, scanning_office, notes='', qr_verified=False):
    """
    Receiving office scans IN, completing the leg started by release_document()
    — or, if this document is being returned (is_returning), the leg started
    by return_document(), in which case this brings it BACK to the previous
    office instead of forward to the next one. Refuses to run unless the
    document was actually released/returned first — this is the "prevent
    receiving without proper release scan" control, in both directions.
    """
    if document.status != Document.Status.IN_TRANSIT:
        raise ValidationError(
            "This document has not been released for transfer yet. "
            "The sending office must scan it out before it can be received."
        )

    route = document.document_type.route

    if document.is_returning:
        target_position = document.route_position - 1
        expected_office = route[target_position]

        if not _same_office(scanning_office, expected_office):
            raise ValidationError(
                f"Your current assigned office ('{scanning_office or 'none'}') does not match the "
                f"office required for this step ('{expected_office}')."
            )

        now = timezone.now()
        time_spent = now - document.entered_current_office_at
        previous_handler = document.current_handler

        document.route_position = target_position
        document.current_handler = scanning_user
        document.entered_current_office_at = now
        document.status = Document.Status.IN_PROGRESS
        document.is_returning = False
        document.save()

        DocumentLog.objects.create(
            document=document,
            action=DocumentLog.Action.RETURN_RECEIVED,
            office=resolve_office(scanning_office),
            sender=previous_handler,
            acted_by=scanning_user,
            qr_verified=qr_verified,
            duration_at_office=time_spent,
            notes=notes,
        )
        return document

    next_position = document.route_position + 1

    # Guarded by release_document() already refusing to release a final-leg
    # document, but kept here too since receive_document() can be reached
    # independently (e.g. the manual admin override).
    if next_position >= len(route):
        raise ValidationError("This document has already finished its route.")

    expected_office = route[next_position]

    if not _same_office(scanning_office, expected_office):
        raise ValidationError(
            f"Your current assigned office ('{scanning_office or 'none'}') does not match the "
            f"office required for this step ('{expected_office}')."
        )

    now = timezone.now()
    time_spent = now - document.entered_current_office_at
    previous_handler = document.current_handler

    document.route_position = next_position
    document.current_handler = scanning_user
    document.entered_current_office_at = now

    # SCALABLE COMPLETION LOGIC:
    # If this scan reached the LAST index in the route array, the document is
    # back at its origin office — mark it Completed and log it as Returned.
    # This works for [A, B, A] or [A, B, C, D, A] or even [A, B, C].
    if next_position == len(route) - 1:
        document.status = Document.Status.COMPLETED
        action_type = DocumentLog.Action.RETURNED
    else:
        document.status = Document.Status.IN_PROGRESS
        action_type = DocumentLog.Action.RECEIVED

    document.save()

    DocumentLog.objects.create(
        document=document,
        action=action_type,
        office=resolve_office(scanning_office),
        sender=previous_handler,
        acted_by=scanning_user,
        qr_verified=qr_verified,
        duration_at_office=time_spent,
        notes=notes,
    )

    if action_type == DocumentLog.Action.RETURNED:
        advance_processing_stage(document, Document.ProcessingStage.READY_FOR_RELEASE, actor=scanning_user)

    return document


def release_to_citizen(document, releasing_user, notes='', qr_verified=False):
    """
    Called by the origin office (e.g. BPLO) once the document is Completed,
    marking it as physically handed back to the citizen — the "Release to
    Citizen" button in DocumentDetailModal and the equivalent QR "return"
    scan action both land here. Only reachable once Document.Status.
    COMPLETED, which itself is only reachable via a final receive_document()
    call — so a document can never be handed back without having actually
    completed its full receipt chain first.

    Also fires the citizen's "ready for pickup" email right here (via
    _maybe_notify_citizen_ready(), which no-ops if one was somehow already
    sent for this document). Returns (document, email_status) instead of a
    bare document so the caller can surface a truthful outcome to staff —
    'sent', 'failed', 'skipped', or 'already_sent' — rather than assuming
    the email always goes out.
    """
    if document.status != Document.Status.COMPLETED:
        raise ValidationError(
            f"Only a 'completed' document can be released to the citizen. "
            f"This document is currently '{document.status}'."
        )

    previous_handler = document.current_handler
    document.status = Document.Status.RELEASED
    document.current_handler = releasing_user
    document.save()

    DocumentLog.objects.create(
        document=document,
        action=DocumentLog.Action.RELEASED_TO_CITIZEN,
        office=resolve_office(document.current_office),
        sender=previous_handler,
        acted_by=releasing_user,
        qr_verified=qr_verified,
        notes=notes,
    )
    advance_processing_stage(document, Document.ProcessingStage.COMPLETED, actor=releasing_user)
    email_status = _maybe_notify_citizen_ready(document)
    return document, email_status


def citizen_return_document(document, citizen_user, notes=''):
    """
    A citizen sending a RELEASED document back to the office that released
    it, because of a problem. Unlike return_document() above (staff,
    mid-route, moving between two different offices), a RELEASED document's
    route_position is always already sitting at the origin office — the
    same office that released it — so this just reopens it there instead
    of moving anything. Ownership (only the requesting citizen may do this)
    is checked by the view, not here, so it can return a clean 403.
    """
    if document.status != Document.Status.RELEASED:
        raise ValidationError(f"Cannot return a document that is '{document.status}'.")

    if not notes or not notes.strip():
        raise ValidationError("Please provide a reason for returning this document.")

    previous_handler = document.current_handler
    document.status = Document.Status.IN_PROGRESS
    document.save()

    DocumentLog.objects.create(
        document=document,
        action=DocumentLog.Action.CITIZEN_RETURN_INITIATED,
        office=resolve_office(document.current_office),
        sender=previous_handler,
        acted_by=citizen_user,
        notes=notes,
    )
    # Reflects the reopening on the citizen's own narrative tracking
    # timeline too — otherwise it would still say "Completed" even though
    # the document is physically back in the workflow.
    advance_processing_stage(document, Document.ProcessingStage.UNDER_REVIEW, actor=citizen_user, note=notes)
    return document


def expedite_document(document, citizen_user):
    """
    A citizen flagging their own delayed document for staff attention —
    "Follow-Up / Expedite Request". Purely informational: never touches
    status/route_position, just raises a Notification at whichever office
    currently holds it. Ownership (only the requesting citizen may do this)
    is checked by the view, not here, same convention as
    citizen_return_document() above. Only allowed once the document is
    actually running past its current step's own SLA — otherwise there's
    nothing to expedite yet.
    """
    if document.status not in (Document.Status.IN_PROGRESS, Document.Status.IN_TRANSIT):
        raise ValidationError(f"Cannot request a follow-up on a document that is '{document.status}'.")

    steps = list(document.document_type.steps.all())  # Meta.ordering = ['step_number']
    if document.route_position < len(steps):
        sla_hours = steps[document.route_position].max_hours_allowed
    else:
        sla_hours = DEFAULT_FALLBACK_SLA_HOURS
    dwell_hours = (timezone.now() - document.entered_current_office_at).total_seconds() / 3600

    if dwell_hours <= sla_hours:
        raise ValidationError(
            "This document is still within its expected processing time — "
            "a follow-up can only be requested once it's running late."
        )

    DocumentLog.objects.create(
        document=document,
        action=DocumentLog.Action.EXPEDITE_REQUESTED,
        office=resolve_office(document.current_office),
        acted_by=citizen_user,
        notes=f"Citizen requested a follow-up — document has been at {document.current_office} for {round(dwell_hours, 1)}h (SLA: {sla_hours}h).",
    )
    notify_office(
        document.current_office,
        title=f"Follow-Up Requested: {document.tracking_number}",
        message=(
            f"The citizen who requested {document.tracking_number} ({document.document_type.name}) "
            f"has flagged it as delayed — it's been at your office for {round(dwell_hours, 1)}h "
            f"(expected: {sla_hours}h). Please review."
        ),
        notification_type=Notification.NotificationType.EXPEDITE_REQUEST,
        sender=citizen_user, related_document=document,
    )
    return document


def flag_missing(document, flagging_user, notes=''):
    """Marks a document as missing — can happen at any non-terminal state."""
    if document.status in (Document.Status.COMPLETED, Document.Status.RELEASED):
        raise ValidationError(f"Cannot flag a '{document.status}' document as missing.")

    document.status = Document.Status.MISSING
    document.save()

    DocumentLog.objects.create(
        document=document,
        action=DocumentLog.Action.FLAGGED_MISSING,
        office=resolve_office(document.current_office),
        acted_by=flagging_user,
        notes=notes,
    )
    return document
