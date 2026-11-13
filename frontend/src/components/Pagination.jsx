const buttonClass = 'px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40';

/**
 * "Showing 1 to 10 of 42 entries" with Previous/Next, left-aligned under a
 * list. Hidden when the list is empty; the buttons only appear when there
 * is more than one page.
 */
export default function Pagination({ page, pageSize, count, onPageChange }) {
  if (!count) return null;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);

  return (
    <div className="flex flex-wrap items-center gap-3 mt-4 text-sm">
      <p className="text-slate-500 dark:text-slate-400" aria-live="polite">
        Showing {from} to {to} of {count} {count === 1 ? 'entry' : 'entries'}
      </p>
      {totalPages > 1 && (
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={buttonClass}>Previous</button>
          <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className={buttonClass}>Next</button>
        </div>
      )}
    </div>
  );
}
