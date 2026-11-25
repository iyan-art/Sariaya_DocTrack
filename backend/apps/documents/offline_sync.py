"""
Applies scans a staff device recorded while offline (POST
/api/documents/offline-sync/, OfflineSyncView).

Each scan goes through the same services and checks as an online scan
(release_document, receive_document, return_document), so being offline
never skips a rule: a scan the document's current state no longer allows is
rejected with the reason, and the device shows it to the staff member.

Time: a scan is recorded at the time it was made on the device, so offline
time is not charged to the wrong office. The device clock is used only when
it is plausible: not in the future, not older than MAX_OFFLINE_AGE, and not
before the document's latest recorded event (events stay in order).
Otherwise the server's time is used, and the log says so.

Duplicates: every scan carries a client_id. A device that lost the answer
resends the scan; the stored outcome is returned instead of applying it again.
"""
from datetime import timedelta, timezone as dt_timezone

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from .models import DocumentLog, OfflineSyncAction
from .notifications import _format_local
from .qr_services import parse_qr_payload, resolve_and_verify
from .services import receive_document, recorded_at, release_document, return_document

OFFLINE_ACTIONS = ('receive', 'release', 'return_to_office')
MAX_OFFLINE_AGE = timedelta(days=7)
CLOCK_TOLERANCE = timedelta(minutes=2)
MAX_BATCH = 50


def _error_text(exc):
    detail = getattr(exc, 'detail', None)
    if isinstance(detail, list) and detail:
        return str(detail[0])
    if isinstance(detail, dict) and detail:
        first = next(iter(detail.values()))
        return str(first[0] if isinstance(first, list) else first)
    return str(detail or exc)


def choose_recorded_time(document, scanned_at, now):
    """(time to record, reason the device time was not used or None)."""
    if scanned_at is None:
        return now, "the device did not send a valid scan time"
    if scanned_at > now + CLOCK_TOLERANCE:
        return now, "the device clock was ahead of the server"
    if scanned_at < now - MAX_OFFLINE_AGE:
        return now, "the scan was more than 7 days old"
    latest = document.logs.order_by('-timestamp').values_list('timestamp', flat=True).first()
    earliest_allowed = max(filter(None, [latest, document.entered_current_office_at]))
    if scanned_at < earliest_allowed:
        return now, "the document had a later update than the scan time"
    return min(scanned_at, now), None


def _apply(user, item, now):
    """Runs one scan; returns (outcome, detail, document or None, recorded time)."""
    action = item.get('action')
    raw_payload = (item.get('qr_payload') or '').strip()
    notes = (item.get('notes') or '').strip()
    scanned_at = _parse_scan_time(item)

    if action not in OFFLINE_ACTIONS:
        return OfflineSyncAction.Outcome.REJECTED, "This action cannot be done offline.", None, now
    if not user.office:
        return OfflineSyncAction.Outcome.REJECTED, "Your account has no office assigned.", None, now

    try:
        document = resolve_and_verify(raw_payload)
        qr_verified = bool(parse_qr_payload(raw_payload).get('signature'))
    except (ValidationError, PermissionDenied) as exc:
        return OfflineSyncAction.Outcome.REJECTED, _error_text(exc), None, now

    when, clock_note = choose_recorded_time(document, scanned_at, now)
    offline_note = (
        f"Scanned offline on {_format_local(scanned_at)}, synced {_format_local(now)}."
        if clock_note is None else
        f"Scanned offline; recorded at sync time ({_format_local(now)}) because {clock_note}."
    )
    full_notes = f"{notes} {offline_note}".strip() if action != 'return_to_office' else notes

    try:
        with transaction.atomic(), recorded_at(when):
            last_log_id = document.logs.order_by('-id').values_list('id', flat=True).first() or 0
            if action == 'receive':
                receive_document(document, scanning_user=user, scanning_office=user.office,
                                 notes=full_notes, qr_verified=qr_verified)
            elif action == 'release':
                release_document(document, releasing_user=user, notes=full_notes, qr_verified=qr_verified)
            else:
                return_document(document, returning_user=user, notes=notes)
            new_logs = DocumentLog.objects.filter(document=document, id__gt=last_log_id)
            new_logs.update(timestamp=when)
            if action == 'return_to_office':
                # The reason stays the reason; the offline note goes alongside it.
                log = new_logs.filter(action=DocumentLog.Action.RETURN_INITIATED).first()
                if log:
                    DocumentLog.objects.filter(pk=log.pk).update(notes=f"{log.notes} ({offline_note})")
    except (ValidationError, PermissionDenied) as exc:
        return OfflineSyncAction.Outcome.REJECTED, _error_text(exc), document, when

    document.refresh_from_db()
    return OfflineSyncAction.Outcome.APPLIED, f"{document.tracking_number}: done. {offline_note}", document, when


def _parse_scan_time(item):
    scanned_at = parse_datetime(str(item.get('scanned_at') or ''))
    if scanned_at is not None and timezone.is_naive(scanned_at):
        scanned_at = timezone.make_aware(scanned_at, dt_timezone.utc)
    return scanned_at


def _stored_result(record, user):
    if record.user_id != user.id:
        return {'client_id': record.client_id, 'outcome': 'rejected', 'detail': 'This scan belongs to another account.'}
    return {'client_id': record.client_id, 'outcome': record.outcome, 'detail': record.detail,
            'tracking_number': record.tracking_number, 'duplicate': True}


def sync_offline_actions(user, items):
    """Applies a batch in scan order; returns one result per item."""
    now = timezone.now()
    ordered = sorted(items, key=lambda item: str(item.get('scanned_at') or ''))
    results = []
    for item in ordered:
        client_id = str(item.get('client_id') or '').strip()[:64]
        if not client_id:
            results.append({'client_id': client_id, 'outcome': 'rejected', 'detail': 'Missing client_id.'})
            continue
        existing = OfflineSyncAction.objects.filter(client_id=client_id).first()
        if existing:
            results.append(_stored_result(existing, user))
            continue

        with transaction.atomic():
            # Claim the client_id first: a copy of this scan arriving at the
            # same moment fails here instead of being applied a second time.
            try:
                with transaction.atomic():
                    record = OfflineSyncAction.objects.create(
                        client_id=client_id, user=user, action=str(item.get('action') or '')[:20],
                        scanned_at=_parse_scan_time(item) or now, recorded_at=now,
                        outcome=OfflineSyncAction.Outcome.REJECTED, detail='Processing',
                    )
            except IntegrityError:
                results.append(_stored_result(OfflineSyncAction.objects.get(client_id=client_id), user))
                continue
            try:
                outcome, detail, document, when = _apply(user, item, now)
            except APIException as exc:
                outcome, detail, document, when = OfflineSyncAction.Outcome.REJECTED, _error_text(exc), None, now
            record.outcome, record.detail, record.document, record.recorded_at = outcome, detail, document, when
            record.tracking_number = document.tracking_number if document else ''
            record.save()
        results.append({'client_id': client_id, 'outcome': outcome, 'detail': detail,
                        'tracking_number': record.tracking_number})
    return results
