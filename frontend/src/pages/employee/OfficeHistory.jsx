import { useEffect, useState } from 'react';
import { fetchOfficeHistory } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import DocumentFormModal from '../../components/admin/DocumentFormModal';
import { CheckCircle2Icon, Clock3Icon } from '../../components/Icons';

const PAGE_SIZE = 15; // matches OfficeHistoryPagination on the backend
const SCOPES = [
  ['all', 'All'],
  ['here', 'In my office'],
  ['passed', 'Passed on'],
];

function formatWhen(iso) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function formatHours(hours) {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

/**
 * Documents that have been in this office's custody — including offices that
 * never start a request and only receive, process, and pass it on.
 */
export default function OfficeHistory() {
  const { showToast } = useToast();
  const [scope, setScope] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // Search waits for a pause in typing instead of firing on every key.
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    fetchOfficeHistory(page, scope, query)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((err) => {
        if (!cancelled) setData({ count: 0, results: [], error: err.response?.data?.detail });
        showToast(err.response?.data?.detail || "Couldn't load your office history.", 'error');
      });
    return () => { cancelled = true; };
  }, [page, scope, query, showToast]);

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Office History</h1>
      <p className="text-slate-500 dark:text-slate-400 mt-1">
        Every document that has passed through {data?.office ? data.office.name : 'your office'}: when it arrived, who received it, and when it moved on.
      </p>

      <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit" role="group" aria-label="Filter">
          {SCOPES.map(([value, label]) => (
            <button
              key={value} aria-pressed={scope === value}
              onClick={() => { setScope(value); setPage(1); }}
              className={`px-4 py-2.5 sm:py-1.5 rounded-md text-sm font-medium transition-colors ${scope === value ? 'bg-white dark:bg-slate-700 shadow text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tracking #, document, or requester…" aria-label="Search office history"
          className="w-full sm:w-80 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="mt-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-x-auto">
        <table className="responsive-table w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3">Tracking #</th>
              <th className="text-left px-5 py-3">Document</th>
              <th className="text-left px-5 py-3">Arrived</th>
              <th className="text-left px-5 py-3">Left</th>
              <th className="text-left px-5 py-3">Time here</th>
              <th className="text-left px-5 py-3">Now</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {!data ? (
              <tr><td colSpan="6" className="text-center py-8 text-slate-400 dark:text-slate-500">Loading…</td></tr>
            ) : data.results.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-8 text-slate-400 dark:text-slate-500">{data.error || 'No documents found.'}</td></tr>
            ) : (
              data.results.map((doc) => {
                const latest = doc.visits[doc.visits.length - 1] || {};
                return (
                  <tr key={doc.id} onClick={() => setSelectedId(doc.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td data-label="Tracking #" className="px-5 py-3 font-mono text-xs text-blue-600 dark:text-blue-400">{doc.tracking_number}</td>
                    <td data-label="Document" className="px-5 py-3">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{doc.document_type_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{doc.requested_by_name}</p>
                    </td>
                    <td data-label="Arrived" className="px-5 py-3 text-xs text-slate-600 dark:text-slate-400">
                      <p>{formatWhen(latest.arrived_at)}</p>
                      <p className="text-slate-400 dark:text-slate-500">
                        {latest.arrival}{latest.received_by ? ` · ${latest.received_by}` : ''}
                        {latest.qr_verified && <span className="ml-1 font-bold text-green-700 dark:text-green-400">· QR</span>}
                      </p>
                      {doc.visits.length > 1 && (
                        <p className="text-amber-700 dark:text-amber-400 font-semibold">In this office {doc.visits.length} times</p>
                      )}
                    </td>
                    <td data-label="Left" className="px-5 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {latest.left_at ? (
                        <>
                          <p>{formatWhen(latest.left_at)}</p>
                          <p className="text-slate-400 dark:text-slate-500">{latest.departure}{latest.left_by ? ` · ${latest.left_by}` : ''}</p>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-400"><Clock3Icon className="w-3.5 h-3.5" /> Still here</span>
                      )}
                    </td>
                    <td data-label="Time here" className="px-5 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {formatHours(doc.visits.reduce((sum, v) => sum + (v.hours_in_office || 0), 0))}
                    </td>
                    <td data-label="Now" className="px-5 py-3 text-xs">
                      {doc.in_custody ? (
                        <span className="font-semibold text-blue-700 dark:text-blue-400">In your office · {doc.status_label}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                          {doc.status === 'released' && <CheckCircle2Icon className="w-3.5 h-3.5 text-green-600" />}
                          {doc.status_label}{doc.status !== 'released' ? ` · ${doc.current_office}` : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-500 dark:text-slate-400">Page {page} of {totalPages} · {data.count} documents</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {selectedId && <DocumentFormModal documentId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
