// Mirrors qr_services.py::parse_qr_payload — a scanned or pasted code is
// either a full "https://.../track/<tracking_number>?..." URL or a bare
// tracking number typed/printed directly; either way we just want the last
// path segment (or the raw string if it isn't a URL at all).
export function extractTrackingNumber(raw) {
  const trimmed = (raw || '').trim();
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split('/').filter(Boolean);
    return (segments[segments.length - 1] || trimmed).toUpperCase();
  } catch {
    return trimmed.toUpperCase();
  }
}
