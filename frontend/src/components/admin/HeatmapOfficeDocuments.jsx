import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchHeatmapOfficeDocuments } from '../../api/axios';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The documents behind one Heatmap tile: each time the office held a
 * document, how long it kept it against that step's time limit (SLA),
 * worst first. A row opens the document's details.
 */
export default function HeatmapOfficeDocuments({ office, onClose }) {
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchHeatmapOfficeDocuments(office.office)
      .then((res) => setResult(res.data))
      .catch(() => setFailed(true));
  }, [office.office]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = result?.documents || [];

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4 overlay-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="heatmap-docs-title"
        onClick={(event) => event.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden modal-pop-in"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 id="heatmap-docs-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {office.office_name || office.office}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {office.count} document{office.count === 1 ? '' : 's'} processed
              {office.over_sla > 0 && ` · ${office.over_sla} over SLA`}. Longest over the time limit first.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl">×</button>
        </div>

        <div className="overflow-y-auto">
          {failed ? (
            <p className="text-center text-sm text-red-600 dark:text-red-400 py-10">Could not load the documents.</p>
          ) : !result ? (
            <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-10">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-10">No documents yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, i) => (
                <li key={`${row.document_id}-${i}`}>
                  <Link
                    to={`/admin/document-request?doc=${row.document_id}`}
                    className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400 truncate">{row.tracking_number}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {row.document_type_name} · {formatDate(row.ended_at)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {row.duration_display} <span className="font-normal text-slate-400 dark:text-slate-500">/ {row.sla_display} SLA</span>
                      </p>
                      <p className={`text-xs font-bold ${row.over_sla ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {row.over_sla ? `Over SLA (${row.sla_pct}%)` : `${row.sla_pct}% of SLA`}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
