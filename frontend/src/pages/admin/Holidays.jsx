import { useCallback, useEffect, useState } from 'react';
import { createHoliday, deleteHoliday, fetchHolidays, updateHoliday } from '../../api/axios';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import { CalendarIcon } from '../../components/Icons';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';

const KINDS = [
  { value: 'regular', label: 'Regular Holiday' },
  { value: 'special', label: 'Special Non-Working Day' },
  { value: 'local', label: 'Local Holiday' },
  { value: 'suspension', label: 'Work Suspension' },
];

const KIND_STYLES = {
  regular: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30',
  special: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30',
  local: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30',
  suspension: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

const EMPTY = { date: '', name: '', kind: 'regular' };
const INPUT = 'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function formatDay(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Days the offices are closed. SLA time does not run on them (nor on
 * weekends, nights and the lunch hour), so a document is never marked
 * overdue for a day nobody was at work.
 */
export default function Holidays() {
  const { showToast } = useToast();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Loading is switched on where the year changes, not here, so the effect
  // below only sets state once the request answers.
  const load = useCallback(() => {
    fetchHolidays(year)
      .then((res) => setRows(res.data))
      .catch(() => showToast('Could not load the holidays.', 'error'))
      .finally(() => setLoading(false));
  }, [year, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await updateHoliday(editingId, form);
        showToast('Holiday updated.', 'success');
      } else {
        await createHoliday(form);
        showToast('Holiday added. SLA time will not run on that day.', 'success');
      }
      setForm(EMPTY);
      setEditingId(null);
      if (form.date && Number(form.date.slice(0, 4)) !== year) { setLoading(true); setYear(Number(form.date.slice(0, 4))); }
      else load();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Could not save the holiday.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({ date: row.date, name: row.name, kind: row.kind });
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
          <CalendarIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Holidays</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Days the offices are closed. SLA time counts only working hours (Mon–Fri, 8:00 AM–12:00 NN and 1:00–5:00 PM) and skips these days.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 grid gap-3 sm:grid-cols-[10rem_1fr_13rem_auto] items-end">
        <label className="block">
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Date</span>
          <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={INPUT} />
        </label>
        <label className="block">
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Name</span>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sariaya Town Fiesta" className={INPUT} />
        </label>
        <label className="block">
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Type</span>
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={INPUT}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold px-4 py-2">
            {saving ? 'Saving…' : editingId ? 'Save' : 'Add'}
          </button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }} className="rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm px-3 py-2">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="mt-6 flex items-center gap-2">
        <button type="button" onClick={() => { setLoading(true); setYear(year - 1); }} aria-label="Previous year" className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300">‹</button>
        <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">{year}</span>
        <button type="button" onClick={() => { setLoading(true); setYear(year + 1); }} aria-label="Next year" className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300">›</button>
        <span className="text-sm text-slate-500 dark:text-slate-400">{rows.length} day{rows.length === 1 ? '' : 's'}</span>
      </div>

      <div className="mt-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <p className="text-center text-slate-400 dark:text-slate-500 py-10">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-slate-400 dark:text-slate-500 py-10">No holidays for {year} yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-[12rem]">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{row.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatDay(row.date)}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${KIND_STYLES[row.kind]}`}>{row.kind_label}</span>
                <button type="button" onClick={() => startEdit(row)} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                <button type="button" onClick={() => setDeleteTarget(row)} className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDeleteModal
          title="Remove this holiday?"
          confirmText={deleteTarget.name}
          message={`${formatDay(deleteTarget.date)} will count as a working day again for SLA time.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async (confirmName) => {
            await deleteHoliday(deleteTarget.id, confirmName);
            setDeleteTarget(null);
            showToast('Holiday removed.', 'success');
            load();
          }}
        />
      )}
    </div>
  );
}
