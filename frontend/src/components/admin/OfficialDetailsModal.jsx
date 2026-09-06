import { useState } from 'react';
import { updateUser } from '../../api/axios';
import { useToast } from '../../context/ToastContext';

export default function OfficialDetailsModal({ official, onClose, onUpdated }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    first_name: official.first_name,
    last_name: official.last_name,
    office: official.office || '',
    position: official.position || '',
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateUser(official.id, form);
      showToast('Official details updated.', 'success');
      onUpdated();
    } catch {
      showToast('Failed to update details. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const initials = `${official.first_name?.[0] || ''}${official.last_name?.[0] || ''}`.toUpperCase();

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7 modal-pop-in">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">
            {editing ? 'Edit Official' : 'Official Details'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        <div className="flex items-center gap-4 mt-5">
          <div className="h-14 w-14 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg shrink-0">
            {initials}
          </div>
          {!editing && (
            <div>
              <p className="font-semibold text-slate-900">{official.full_name}</p>
              <p className="text-sm text-blue-600">{official.position}</p>
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">First name</label>
                <input name="first_name" value={form.first_name} onChange={handleChange}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Last name</label>
                <input name="last_name" value={form.last_name} onChange={handleChange}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Office</label>
              <input name="office" value={form.office} onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Position</label>
              <input name="position" value={form.position} onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditing(false)} className="flex-1 rounded-lg border border-slate-200 text-slate-600 font-medium py-2.5 text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={loading} className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-2.5 text-sm transition-colors">
                {loading ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Email</span>
              <span className="text-slate-800">{official.email}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Office</span>
              <span className="text-slate-800">{official.office || '—'}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Position</span>
              <span className="text-slate-800">{official.position || '—'}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Role</span>
              <span className="text-slate-800 capitalize">{official.role}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Status</span>
              <span className={`font-medium ${official.is_active ? 'text-green-600' : 'text-slate-400'}`}>
                ● {official.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <button
              onClick={() => setEditing(true)}
              className="w-full mt-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 text-sm transition-colors"
            >
              Edit details
            </button>
          </div>
        )}
      </div>
    </div>
  );
}