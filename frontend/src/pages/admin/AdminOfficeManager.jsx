import { useState, useEffect, useCallback } from 'react';
import { fetchAllOffices, createOffice, updateOffice, deleteOffice } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import { MapPinIcon } from '../../components/Icons';

const BLANK_FORM = { name: '', code: '', location: '', floor: '', contact_person: '', office_hours: '' };

export default function AdminOfficeManager() {
  const { showToast } = useToast();
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = create mode
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);

  const loadOffices = useCallback(() => {
    setLoading(true);
    fetchAllOffices()
      .then((res) => setOffices(res.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadOffices(); }, [loadOffices]);

  const filteredOffices = offices.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()) || o.code.toLowerCase().includes(search.toLowerCase())
  );

  const openCreateModal = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setShowModal(true);
  };

  const openEditModal = (office) => {
    setEditingId(office.id);
    setForm({
      name: office.name, code: office.code,
      location: office.location, floor: office.floor, contact_person: office.contact_person,
      office_hours: office.office_hours,
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, code: form.code.trim().toUpperCase() };
      if (editingId) {
        await updateOffice(editingId, payload);
        showToast(`"${form.name}" updated — reflected everywhere it's referenced.`, 'success');
      } else {
        await createOffice(payload);
        showToast(`"${form.name}" created — now available in the Workflow Builder's office dropdown.`, 'success');
      }
      setShowModal(false);
      loadOffices();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to save office.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (office) => {
    try {
      await updateOffice(office.id, { is_active: !office.is_active });
      showToast(office.is_active ? `"${office.name}" archived.` : `"${office.name}" restored.`, 'success');
      loadOffices();
    } catch (err) {
      showToast('Failed to update status.', 'error');
    }
  };

  const handleDelete = async (office) => {
    if (!window.confirm(`Permanently delete "${office.name}"? This cannot be undone.`)) return;
    try {
      await deleteOffice(office.id);
      showToast(`"${office.name}" deleted.`, 'success');
      loadOffices();
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
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100">
            <MapPinIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Office Manager</h1>
            <p className="text-slate-500 text-sm">Manage municipal offices — location, personnel, and availability for workflow routing.</p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-100 transition-all"
        >
          + Add Office
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search offices…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-80 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3">Code</th>
              <th className="text-left px-5 py-3">Office Name</th>
              <th className="text-left px-5 py-3">Location</th>
              <th className="text-left px-5 py-3">Floor</th>
              <th className="text-left px-5 py-3">Department Head</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-right px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="7" className="text-center py-8 text-slate-400">Loading…</td></tr>
            ) : filteredOffices.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-8 text-slate-400">No offices found.</td></tr>
            ) : (
              filteredOffices.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs font-bold text-blue-600">{o.code}</td>
                  <td className="px-5 py-3 font-semibold text-slate-800">{o.name}</td>
                  <td className="px-5 py-3 text-slate-500">{o.location || '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{o.floor || '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{o.contact_person || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      o.is_active
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {o.is_active ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2 text-xs font-bold">
                      <button onClick={() => openEditModal(o)} className="text-blue-600 hover:text-blue-800">
                        Edit
                      </button>
                      <button onClick={() => toggleArchive(o)} className="text-amber-600 hover:text-amber-800">
                        {o.is_active ? 'Archive' : 'Restore'}
                      </button>
                      <button onClick={() => handleDelete(o)} className="text-red-500 hover:text-red-700">
                        Delete
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7 modal-pop-in">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {editingId ? 'Edit Office' : 'Add Office'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Office Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Treasury Office"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Office Code</label>
                <input
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g. TREAS"
                  maxLength={20}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Must match the office code staff members are assigned to in Users, so scan/release permissions resolve correctly.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Building / Room</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Municipal Hall, Room 204"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Floor</label>
                <input
                  value={form.floor}
                  onChange={(e) => setForm({ ...form, floor: e.target.value })}
                  placeholder="e.g. 2nd Floor"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Shown to citizens on the public tracking page as this office's current location.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Department Head</label>
                <input
                  value={form.contact_person}
                  onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                  placeholder="e.g. Juan Dela Cruz"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Office Hours</label>
                <input
                  value={form.office_hours}
                  onChange={(e) => setForm({ ...form, office_hours: e.target.value })}
                  placeholder="e.g. Mon–Fri, 8:00 AM – 5:00 PM"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Shown to citizens in the "document ready for pickup" release email, when set.
                </p>
              </div>

              <button type="submit" disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 mt-2 transition-colors">
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Office'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
