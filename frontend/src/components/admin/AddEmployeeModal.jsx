import { useState, useEffect } from 'react';
import { createEmployee, fetchOffices } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';

const BLANK_FORM = {
  first_name: '', last_name: '', email: '',
  role: 'employee', office: '', position: '',
};

export default function AddEmployeeModal({ onClose, onCreated }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(BLANK_FORM);
  const [offices, setOffices] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Set once, right after creation — this is the ONLY time the temporary
  // password is ever visible, so the modal switches to a dedicated
  // "copy this now" screen instead of closing immediately.
  const [created, setCreated] = useState(null); // { employee_id, temporary_password, email }

  // Sourced from the Office catalog — office here MUST match an Office.code
  // for scan/release permission checks and document-log attribution to
  // resolve correctly (see apps/documents/services.py::resolve_office).
  useEffect(() => { fetchOffices().then((res) => setOffices(res.data)); }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await createEmployee(form);
      setCreated({
        employee_id: res.data.user.employee_id,
        temporary_password: res.data.temporary_password,
        email: res.data.user.email,
      });
      onCreated(); // tell parent to refresh the table now; modal stays open to show the password
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to create account.'));
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(created.temporary_password);
    showToast('Temporary password copied.', 'success');
  };

  if (created) {
    return (
      <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4 overlay-fade-in">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7 modal-pop-in">
          <h2 className="text-xl font-bold text-slate-900">Account Created</h2>
          <p className="text-sm text-slate-500 mt-1">
            Share these credentials with <span className="font-semibold">{created.email}</span> securely —
            the password won't be shown again.
          </p>

          <div className="mt-5 space-y-3">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employee ID</p>
              <p className="font-mono font-bold text-slate-900 mt-1">{created.employee_id}</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Temporary Password</p>
              <div className="flex items-center justify-between gap-2 mt-1">
                <p className="font-mono font-bold text-slate-900">{created.temporary_password}</p>
                <button
                  onClick={copyPassword}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-slate-900 hover:bg-black text-white font-medium rounded-lg py-2.5 mt-6 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7 modal-pop-in">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Add Employee</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Create an employee or admin account. A secure temporary password is generated automatically.
        </p>

        {error && (
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">First name</label>
              <input name="first_name" required value={form.first_name} onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Last name</label>
              <input name="last_name" required value={form.last_name} onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input type="email" name="email" required value={form.email} onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Account type</label>
            <select name="role" value={form.role} onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Office</label>
            <select name="office" value={form.office} onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select office…</option>
              {offices.map((o) => (
                <option key={o.id} value={o.code}>{o.code} — {o.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Position</label>
            <input name="position" value={form.position} onChange={handleChange}
              placeholder="e.g. HR Officer"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 mt-2 transition-colors">
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
