import { useState, useEffect, useCallback } from 'react';
import {
  fetchAllDocumentTypes, createDocumentType, updateDocumentType, deleteDocumentType,
} from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import { ClipboardListIcon, PencilIcon, ArchiveIcon, RotateCcwIcon, TrashIcon } from '../../components/Icons';

const SCOPE_STYLES = {
  external: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30',
  internal: 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/30',
};

const BLANK_FORM = { name: '', description: '', scope: 'external', daily_limit: '' };

export default function AdminDocumentTypeManager() {
  const { showToast } = useToast();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = create mode
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);

  const loadTypes = useCallback(() => {
    setLoading(true);
    fetchAllDocumentTypes()
      .then((res) => setTypes(res.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  const filteredTypes = types.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreateModal = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setShowModal(true);
  };

  const openEditModal = (type) => {
    setEditingId(type.id);
    setForm({
      name: type.name,
      description: type.description,
      scope: type.scope,
      daily_limit: type.daily_limit ?? '',
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    // '' means "no limit" on the wire — send null rather than an empty string.
    const payload = { ...form, daily_limit: form.daily_limit === '' ? null : Number(form.daily_limit) };
    try {
      if (editingId) {
        await updateDocumentType(editingId, payload);
        showToast(`"${form.name}" updated.`, 'success');
      } else {
        await createDocumentType(payload);
        showToast(`"${form.name}" created — now available in workflow & request dropdowns.`, 'success');
      }
      setShowModal(false);
      loadTypes();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save document type.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (type) => {
    try {
      await updateDocumentType(type.id, { is_active: !type.is_active });
      showToast(type.is_active ? `"${type.name}" archived.` : `"${type.name}" restored.`, 'success');
      loadTypes();
    } catch (err) {
      showToast('Failed to update status.', 'error');
    }
  };

  const handleDelete = async (type) => {
    if (!window.confirm(`Permanently delete "${type.name}"? This cannot be undone.`)) return;
    try {
      await deleteDocumentType(type.id);
      showToast(`"${type.name}" deleted.`, 'success');
      loadTypes();
    } catch (err) {
      showToast(
        err.response?.data?.detail || 'Failed to delete — try archiving it instead.',
        'error'
      );
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
            <ClipboardListIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Document Type Manager</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Manage the catalog of document types citizens and staff can request.</p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-100 dark:shadow-none transition-all"
        >
          + Add Document Type
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search document types…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Description</th>
              <th className="text-left px-5 py-3">Scope</th>
              <th className="text-left px-5 py-3">Steps</th>
              <th className="text-left px-5 py-3">Daily Cap</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan="7" className="text-center py-8 text-slate-400 dark:text-slate-500">Loading…</td></tr>
            ) : filteredTypes.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-8 text-slate-400 dark:text-slate-500">No document types found.</td></tr>
            ) : (
              filteredTypes.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-200">{t.name}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400 max-w-xs truncate">{t.description || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full border capitalize ${SCOPE_STYLES[t.scope]}`}>
                      {t.scope_label || t.scope}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{t.steps.length || 0}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                    {t.daily_limit ? (
                      <span className={t.requests_today >= t.daily_limit ? 'text-red-600 dark:text-red-400 font-bold' : ''}>
                        {t.requests_today}/{t.daily_limit}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      t.is_active
                        ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}>
                      {t.is_active ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEditModal(t)} title="Edit" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10 p-1.5 rounded-lg transition-colors">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleArchive(t)} title={t.is_active ? 'Archive' : 'Restore'} className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 p-1.5 rounded-lg transition-colors">
                        {t.is_active ? <ArchiveIcon className="w-4 h-4" /> : <RotateCcwIcon className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDelete(t)} title="Delete" className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 p-1.5 rounded-lg transition-colors">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4 overlay-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md p-7 modal-pop-in">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {editingId ? 'Edit Document Type' : 'Add Document Type'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl">×</button>
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Document Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Occupancy Permit"
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Scope</label>
                <select
                  required
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="external">External — citizen-facing (permits, certificates)</option>
                  <option value="internal">Internal — staff-only (payroll, vouchers, requests)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Daily request limit</label>
                <input
                  type="number"
                  min="1"
                  value={form.daily_limit}
                  onChange={(e) => setForm({ ...form, daily_limit: e.target.value })}
                  placeholder="Leave blank for no limit"
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Max new requests accepted for this type per day, to manage office workload.
                </p>
              </div>

              <button type="submit" disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 mt-2 transition-colors">
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Document Type'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
