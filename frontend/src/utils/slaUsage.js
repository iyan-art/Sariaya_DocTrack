// How much of the time limit (SLA) an office uses on average, worded so a
// figure past the limit reads as over it: 75 -> "75% of SLA",
// 125 -> "Over SLA (125%)" with "+25% over". The number itself is never
// capped, so how far over an office runs still shows (and still ranks it).
export function slaUsage(pct) {
  if (pct == null) return null;
  const over = pct > 100;
  return {
    over,
    label: over ? `Over SLA (${pct}%)` : `${pct}% of SLA`,
    overBy: over ? `+${pct - 100}% over` : null,
  };
}
