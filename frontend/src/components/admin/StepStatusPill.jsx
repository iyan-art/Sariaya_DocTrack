const COLORS = {
  completed: 'bg-green-500',
  active: 'bg-green-500',
  near_due: 'bg-amber-400',
  delayed: 'bg-red-500',
  pending: 'bg-slate-200 dark:bg-slate-700',
};

const LABELS = {
  completed: 'Completed',
  active: 'On track',
  near_due: 'Warning — nearing Overdue',
  delayed: 'Overdue — past SLA',
  pending: 'Pending',
};

/**
 * Multi-step progress pill for the main document tables: one segment per
 * WorkflowStep, colored per the app-wide status legend — green (completed
 * / on track), yellow (near_due — warning), red (delayed/overdue), gray
 * (pending). See StatusLegend.jsx for the shared legend UI. Driven entirely
 * by Document.step_statuses from the backend — no client-side SLA math.
 */
export default function StepStatusPill({ statuses }) {
  if (!statuses || statuses.length === 0) {
    return <span className="text-xs text-slate-300">—</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {statuses.map((s, i) => (
        <span
          key={i}
          title={LABELS[s] || s}
          className={`w-5 h-2 rounded-full ${COLORS[s] || 'bg-slate-200'}`}
        />
      ))}
    </div>
  );
}
