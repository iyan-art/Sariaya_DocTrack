// Short, factual blurb for a REAL stage_history entry — never used to
// invent an entry that doesn't exist, only to add a one-line description
// to one that's actually in the data (see buildTimelineEntries below).
const STAGE_DESCRIPTIONS = {
  submitted: 'Your document request was submitted.',
  under_review: 'Your request is under review by staff.',
  verification: 'Your information is being verified.',
  form_processing: 'Your document form is being processed.',
  for_approval: 'Your request is awaiting approval.',
  approved: 'Your request has been approved.',
  document_generated: 'Your document has been generated.',
  soft_copy_available: 'Your soft copy is available for viewing.',
  ready_for_release: 'Your document is ready for release.',
  completed: 'Your document has been completed and released.',
  rejected: 'Your request was rejected.',
};

function describeActivity(entry) {
  const where = entry.office_name
    ? `${entry.office_name}${entry.office_floor ? ` · ${entry.office_floor}` : ''}`
    : null;
  const who = `Handled by ${entry.staff_name || 'System'}`;
  return where ? `${where} — ${who}` : who;
}

/**
 * Merges Document.stage_history (RequestStatusHistory — the narrative
 * "what staff communicated" trail) and Document.activity_log (DocumentLog —
 * the physical hand-off trail) into ONE chronological list, newest first.
 * Both sources are already 100% data-driven (a row only exists if that
 * event actually happened — see RequestStatusHistory's and DocumentLog's
 * own docstrings) so nothing here invents an entry; it only normalizes two
 * real sources into one shape and interleaves them by actual timestamp.
 */
function buildTimelineEntries(stageHistory = [], activityLog = []) {
  const stageEntries = stageHistory.map((h, idx) => ({
    key: `stage-${idx}-${h.timestamp}`,
    label: h.stage_label,
    description: STAGE_DESCRIPTIONS[h.stage] || null,
    notes: null,
    timestamp: h.timestamp,
  }));
  const activityEntries = activityLog.map((a, idx) => ({
    key: `activity-${idx}-${a.timestamp}`,
    label: a.action_label,
    description: describeActivity(a),
    notes: a.notes || null,
    timestamp: a.timestamp,
  }));

  return [...stageEntries, ...activityEntries].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  );
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * One compact, accurate timeline for the public Track page — replaces the
 * old pairing of a fixed 8-step stepper (which always showed every
 * possible stage, done or not) plus a separately-listed "Document
 * Activity" section. Every row here is a real event; nothing is rendered
 * just because a workflow COULD reach that stage eventually.
 */
export default function DocumentTrackingTimeline({ stageHistory, activityLog }) {
  const entries = buildTimelineEntries(stageHistory, activityLog);

  if (entries.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">No activity recorded yet.</p>;
  }

  return (
    <div className="relative pl-1">
      <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-100 dark:bg-slate-800" />
      <div className="space-y-5">
        {entries.map((entry, idx) => (
          <div key={entry.key} className="relative pl-7">
            <div
              className={`absolute left-0 top-1 w-3.5 h-3.5 rounded-full border-2 ${
                idx === 0 ? 'bg-blue-600 border-blue-100 dark:border-blue-500/30' : 'bg-slate-300 dark:bg-slate-600 border-slate-100 dark:border-slate-800'
              }`}
            />
            <p className="font-bold text-slate-900 dark:text-slate-100 break-words">{entry.label}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{formatTimestamp(entry.timestamp)}</p>
            {entry.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 break-words">{entry.description}</p>
            )}
            {entry.notes && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic break-words">{entry.notes}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
