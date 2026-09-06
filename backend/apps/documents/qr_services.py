import hashlib
import hmac
import io
from urllib.parse import parse_qs, urlparse

import qrcode
from django.conf import settings
from django.core.files.base import ContentFile
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Document, DocumentType

# Where a scanned QR actually navigates to — a plain https URL, not raw
# JSON, so any phone's stock camera app can open it directly (citizens
# never install a scanner). Staff scan the identical URL through the
# in-app camera (EmployeeQRScanner), which reads it as data instead of
# navigating.
FRONTEND_BASE_URL = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:5173')


def _sign(tracking_number, document_id):
    """
    HMAC-SHA256 over tracking_number+document_id, keyed with the Django
    SECRET_KEY, truncated to 16 hex chars. This lets a scan be rejected as
    tampered (edited tracking number or id in the URL) without a database
    round-trip proving anything first. It is not meant to withstand a
    targeted cryptographic attack — only to catch casual tampering of a
    printed/shared QR slip.
    """
    message = f"{tracking_number}:{document_id}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()[:16]


def build_qr_payload(document):
    """The literal string encoded into the QR image."""
    sig = _sign(document.tracking_number, document.id)
    return f"{FRONTEND_BASE_URL}/track/{document.tracking_number}?id={document.id}&sig={sig}"


def generate_qr_code(document):
    """Renders build_qr_payload() to a PNG and attaches it to document.qr_code."""
    qr_img = qrcode.make(build_qr_payload(document))
    buffer = io.BytesIO()
    qr_img.save(buffer, format='PNG')
    filename = f"{document.tracking_number}.png"
    document.qr_code.save(filename, ContentFile(buffer.getvalue()), save=True)


def parse_qr_payload(raw_payload):
    """
    Extracts {tracking_number, document_id, signature} from either a full
    QR URL (".../track/<tracking>?id=<id>&sig=<sig>") or a bare tracking
    number (manual fallback entry, which has no id/sig to check). Raises
    ValidationError only when nothing usable can be extracted at all.
    """
    raw = (raw_payload or '').strip()
    if not raw:
        raise ValidationError({"detail": "Empty QR payload."})

    parsed = urlparse(raw)
    tracking_number = (parsed.path or raw).rstrip('/').rsplit('/', 1)[-1]
    if not tracking_number:
        raise ValidationError({"detail": "Could not read a tracking number from that QR code."})

    query = parse_qs(parsed.query)
    raw_id = query.get('id', [None])[0]
    return {
        'tracking_number': tracking_number,
        'document_id': int(raw_id) if raw_id and raw_id.isdigit() else None,
        'signature': query.get('sig', [None])[0],
    }


def resolve_and_verify(raw_payload):
    """
    Full inbound pipeline for a scanned/typed payload: parse -> look up the
    Document -> verify the signature if the payload carried one. Raises
    ValidationError for an unparseable/nonexistent document, PermissionDenied
    for a signature that doesn't match its claimed tracking number/id.
    """
    parsed = parse_qr_payload(raw_payload)
    try:
        document = Document.objects.select_related('document_type').get(
            tracking_number=parsed['tracking_number']
        )
    except Document.DoesNotExist:
        raise ValidationError({"detail": "No document matches this QR code."})

    if parsed['signature'] and parsed['document_id'] is not None:
        expected = _sign(document.tracking_number, document.id)
        if parsed['document_id'] != document.id or not hmac.compare_digest(parsed['signature'], expected):
            raise PermissionDenied("This QR code failed signature verification and may be forged or corrupted.")

    return document


def enforce_scope_access(document, user):
    """
    INTERNAL documents are staff-only. Any citizen (or unauthenticated
    guest) attempting to view/scan one gets a fixed, generic refusal rather
    than any detail about the document. Shared by every access path that
    can reach an INTERNAL document: the public tracking page and the QR
    scan-resolve endpoint.
    """
    is_staff = bool(user and user.is_authenticated and getattr(user, 'role', None) in ('admin', 'employee'))
    if document.document_type.scope == DocumentType.Scope.INTERNAL and not is_staff:
        raise PermissionDenied("This is an internal municipal document. Access restricted to authorized personnel.")


def _format_duration(delta):
    total_seconds = int(delta.total_seconds())
    hours, remainder = divmod(total_seconds, 3600)
    minutes = remainder // 60
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def build_scan_context(document):
    """
    Everything EmployeeQRScanner needs to pre-fill the Receive/Return
    confirmation modal without a second request: the suggested next action,
    where the document is in its route, how long it has sat here (live
    dwell time), and how long it spent at the office before this one
    (recorded on the most recent log that carries a duration).
    """
    now = timezone.now()
    dwell = now - document.entered_current_office_at
    last_duration_log = (
        document.logs.exclude(duration_at_office__isnull=True).order_by('-timestamp').first()
    )

    route = document.document_type.route
    next_position = document.route_position + 1
    next_office = route[next_position] if next_position < len(route) else None

    suggested_action = {
        Document.Status.IN_PROGRESS: 'release',
        Document.Status.IN_TRANSIT: 'receive',
        Document.Status.COMPLETED: 'return',
    }.get(document.status)

    return {
        'suggested_action': suggested_action,
        'current_step_number': document.current_step_number,
        'total_steps': len(route),
        'current_office': document.current_office,
        'next_office': next_office,
        'dwell_seconds': int(dwell.total_seconds()),
        'dwell_display': _format_duration(dwell),
        'previous_office_duration_display': (
            _format_duration(last_duration_log.duration_at_office) if last_duration_log else None
        ),
    }
