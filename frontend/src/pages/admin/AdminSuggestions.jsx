import { useState, useEffect, useCallback } from 'react';
import { fetchAdminSuggestions, updateSuggestion } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { HandshakeIcon } from '../../components/Icons';

const CATEGORIES = [
  { value: '', label: 'All categories' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'document_processing', label: 'Document Processing' },
  { value: 'staff_courtesy', label: 'Staff Courtesy' },
  { value: 'public_health', label: 'Public Health' },
  { value: 'general', label: 'General LGU Services' },
];

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_STYLES = {
  new: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30',
  reviewed: 'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-500/30',
  in_progress: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30',
  archived: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};
const NEXT_ACTIONS = [
  { to: 'reviewed', label: 'Mark Reviewed' },
  { to: 'in_progress', label: 'Mark In Progress' },
  { to: 'archived', label: 'Archive' },
];

/**
 * Admin review dashboard for the Municipal Suggestion Box. Filter by status
 * and category, move each suggestion through its lifecycle
 * (New -> Reviewed -> In Progress -> Archived), and leave a note the citizen
 * sees back on their own Suggestion Box page.
 */
export default function AdminSuggestions() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [notesDraft, setNotesDraft] = useState({}); // id -> string

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (categoryFilter) params.category = categoryFilter;
    fetchAdminSuggestions(params)
      .then((res) => setRows(res.data.results || res.data))
      .finally(() => setLoading(false));
  }, [statusFilter, categoryFilter]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (row, to) => {
    try {
      await updateSuggestion(row.id, { status: to });
      showToast(`Marked "${row.subject}" as ${to.replace('_', ' ')}.`, 'success');
      load();
    } catch {
      showToast('Failed to update status.', 'error');
    }
  };

  const saveNotes = async (row) => {
    const value = notesDraft[row.id] ?? row.admin_notes ?? '';
    try {
      await updateSuggestion(row.id, { admin_notes: value });
      showToast('Response saved.', 'success');
      setNotesDraft((d) => { const n = { ...d }; delete n[row.id]; return n; });
      load();
    } catch {
      showToast('Failed to save response.', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
          <HandshakeIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Suggestion Box Review</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Citizen suggestions addressed to the Municipality of Sariaya.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUSES.map((s) => <option key={s.value} value={s.value}>Status: {s.label}</option>)}
        </select>
        <select
          value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-center py-10 text-slate-400 dark:text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-16 text-center">
          <p className="text-slate-400 dark:text-slate-500 font-bold">No suggestions match these filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 leading-tight">{row.subject}</h3>
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                    {row.category_display} · {row.respondent_name}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-full border ${STATUS_STYLES[row.status] || STATUS_STYLES.new}`}>
                  {row.status_display}
                </span>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-400 mt-3 whitespace-pre-wrap">{row.message}</p>

              <div className="mt-4">
                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                  Response to citizen (optional)
                </label>
                <textarea
                  rows={2}
                  value={notesDraft[row.id] ?? row.admin_notes ?? ''}
                  onChange={(e) => setNotesDraft((d) => ({ ...d, [row.id]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => saveNotes(row)}
                  className="mt-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                  Save response
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-50 dark:border-slate-800 text-xs font-bold">
                {NEXT_ACTIONS.filter((a) => a.to !== row.status).map((a) => (
                  <button
                    key={a.to}
                    onClick={() => changeStatus(row, a.to)}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3">
                Sent {new Date(row.created_at).toLocaleString()}
                {row.reviewed_by_name && row.reviewed_at
                  ? ` · last updated by ${row.reviewed_by_name} on ${new Date(row.reviewed_at).toLocaleString()}`
                  : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
