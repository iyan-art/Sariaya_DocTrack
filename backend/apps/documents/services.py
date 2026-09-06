from django.utils import timezone
from rest_framework.exceptions import ValidationError
from .models import Document, DocumentLog, EmailNotificationLog, Office, RequestStatusHistory
from .notifications import send_ready_for_release_email


def _maybe_notify_citizen_ready(document):
    """
    Sends the citizen "ready for pickup" email (see
    notifications.py::send_ready_for_release_email()) at most once per
    document, ever — this is a one-time terminal notification, not a
    recurring SLA reminder, so unlike the overdue/due-soon emails there's no
    time window to re-arm. Both call sites below (advance_processing_stage's
    automatic soft-copy trigger, and release_to_citizen's explicit "Release
    to Citizen" button trigger for hard copies) go through this one guard,
    so a document can never end up double-notified no matter which path (or
    both, in some edge case) reaches it.

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
    (Under Review, Form Processing, For Approval, ...) — including a manual
    PATCH straight to "Ready for Release" for soft-copy documents, which
    never pass through receive_document()'s final leg.

    On a genuine transition into READY_FOR_RELEASE, emails the citizen right
    here — but only for a SOFT copy document, since that's its only
    notification point (there's no later physical hand-off/button for it).
    A HARD copy document's citizen email is deliberately deferred to
    release_to_citizen() instead — the actual "Release to Citizen" button
    click, i.e. the moment staff confirms the document is ready, not the
    earlier moment it merely arrived back at the origin office and could
    still sit unconfirmed in a drawer for days.
    """
    previous_stage = document.processing_stage
    document.processing_stage = stage
    document.save(update_fields=['processing_stage'])
    RequestStatusHistory.objects.create(document=document, stage=stage, changed_by=actor, note=note)

    if (
        stage == Document.ProcessingStage.READY_FOR_RELEASE
        and previous_stage != Document.ProcessingStage.READY_FOR_RELEASE
        and document.copy_preference != Document.CopyPreference.HARD
    ):
        _maybe_notify_citizen_ready(document)


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
            f"Only staff at '{document.current_office}' can release this document, "
            f"not '{releasing_user.office}'."
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
            f"Only staff at '{document.current_office}' can return this document, "
            f"not '{returning_user.office}'."
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
                f"This document is being returned to '{expected_office}', not '{scanning_office}'."
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
            f"This document is headed to '{expected_office}', not '{scanning_office}'."
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
    _maybe_notify_citizen_ready(), which no-ops if one was already sent —
    e.g. for a soft-copy document that already got notified automatically
    when it first reached READY_FOR_RELEASE). Returns (document,
    email_status) instead of a bare document so the caller can surface a
    truthful outcome to staff — 'sent', 'failed', 'skipped', or
    'already_sent' — rather than assuming the email always goes out.
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
