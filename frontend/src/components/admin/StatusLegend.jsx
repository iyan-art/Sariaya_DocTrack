const ITEMS = [
  { color: 'bg-green-500', label: 'On Track / Completed' },
  { color: 'bg-amber-400', label: 'Warning / Near Due' },
  { color: 'bg-red-500', label: 'Overdue' },
  { color: 'bg-slate-200 dark:bg-slate-700', label: 'Pending' },
];

/**
 * Shared color-key for StepStatusPill, dropped above any table that renders
 * it (DocumentRequest, OfficeDocuments, History) so the colors are always
 * explained once, consistently, instead of relying on each pill's title
 * tooltip alone.
 */
export default function StatusLegend() {
  return (
    <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
      {ITEMS.map(({ color, label }) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
