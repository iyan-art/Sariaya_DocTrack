const STATUS_STYLES = {
  released: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30',
  completed: 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-300 dark:border-green-500/30',
  in_progress: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30',
  in_transit: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30',
  missing: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30',
};

export default function DocumentStatusBadge({ doc }) {
  // SAFETY CHECK: Kung walang 'doc', huwag magpakita ng anuman para hindi mag-error
  if (!doc) return null;

  const label = doc.status_label || doc.status;
  const style = STATUS_STYLES[doc.status] || 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border capitalize shadow-sm ${style}`}>
      {doc.status === 'in_progress' && <span className="w-1 h-1 bg-blue-600 rounded-full animate-pulse"></span>}
      {doc.status === 'in_transit' && <span className="w-1 h-1 bg-amber-600 rounded-full animate-pulse"></span>}
      {label}
    </span>
  );
}