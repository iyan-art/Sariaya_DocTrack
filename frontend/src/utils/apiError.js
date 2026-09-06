// Safely turns an axios error into a short, readable message.
//
// DRF error bodies are normally a plain JSON object — {"detail": "..."} or
// {"field": ["msg"]} — and every catch block in this codebase has
// historically done `Object.values(err.response.data)[0]` to grab the first
// one. That breaks the moment the backend returns something that ISN'T a
// JSON object (an unhandled 500 with DEBUG=True renders a full HTML page as
// a plain string): `Object.values()` on a string returns its individual
// CHARACTERS, so `[0]` is just the first character of the HTML — a stray
// `<` or a newline — which is truthy enough to skip the fallback text and
// render as an empty-looking error box. This helper only ever reads
// `Object.values()` when the payload is actually a plain object; anything
// else (string, array, undefined) falls straight back to `fallback`.
export function extractErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const data = err?.response?.data;
  const isPlainObject = typeof data === 'object' && data !== null && !Array.isArray(data);
  if (!isPlainObject) return fallback;

  const firstValue = Object.values(data)[0];
  const message = Array.isArray(firstValue) ? firstValue[0] : firstValue;
  return typeof message === 'string' && message.trim() ? message : fallback;
}
