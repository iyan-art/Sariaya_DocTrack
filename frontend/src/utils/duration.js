// Decimal hours as people say them: 1.3 -> "1 hr 18 minutes",
// 0.5 -> "30 minutes", 3 -> "3 hrs".
export function formatHoursMinutes(hours) {
  if (hours == null || Number.isNaN(Number(hours))) return '—';
  const totalMinutes = Math.round(Number(hours) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const parts = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hr' : 'hrs'}`);
  if (m || !h) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
}
