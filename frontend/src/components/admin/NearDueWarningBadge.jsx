import { AlertTriangleIcon } from '../Icons';

/**
 * Small inline alert shown next to StepStatusPill once the document's
 * current step has crossed sla_scan.DUE_SOON_THRESHOLD_RATIO (80%) of its
 * own SLA without going over — the 'near_due' tier from
 * DocumentSerializer.get_step_statuses(). Disappears on its own once the
 * step either completes or tips into 'delayed'.
 */
export default function NearDueWarningBadge({ statuses }) {
  if (!statuses?.includes('near_due')) return null;

  return (
    <span
      title="This step has used over 80% of its allotted SLA time — nearing Overdue"
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30"
    >
      <AlertTriangleIcon className="w-3 h-3" />
      Nearing Overdue
    </span>
  );
}
