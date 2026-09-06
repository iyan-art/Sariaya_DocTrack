import { useState } from 'react';
import { resetUserPassword } from '../../api/axios';
import { useToast } from '../../context/ToastContext';

/**
 * Two-step admin flow: confirm (the user's current password stops working
 * immediately), then reveal the newly generated temp password exactly once
 * — same "copy it now" pattern as AddEmployeeModal's post-creation screen.
 * There is no way to view an EXISTING password; resetting is the only way
 * to re-issue credentials, and it's always a brand-new one-time value.
 */
export default function ResetPasswordModal({ user, onClose }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { temporary_password }

  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await resetUserPassword(user.id);
      setResult({ temporary_password: res.data.temporary_password });
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to reset password.', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = () => {
    navigator.clipboard.writeText(result.temporary_password);
    showToast('Temporary password copied.', 'success');
  };

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7 modal-pop-in">
          <h2 className="text-xl font-bold text-slate-900">Password Reset</h2>
          <p className="text-sm text-slate-500 mt-1">
            Share this securely with <span className="font-semibold">{user.full_name}</span> —
            it won't be shown again.
          </p>

          <div className="mt-5 bg-slate-50 border border-slate-100 rounded-xl p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New Temporary Password</p>
            <div className="flex items-center justify-between gap-2 mt-1">
              <p className="font-mono font-bold text-slate-900">{result.temporary_password}</p>
              <button onClick={copyPassword} className="text-xs font-bold text-blue-600 hover:text-blue-700 shrink-0">
                Copy
              </button>
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7 modal-pop-in">
        <h2 className="text-xl font-bold text-slate-900">Reset password?</h2>
        <p className="text-sm text-slate-500 mt-2">
          <span className="font-semibold">{user.full_name}</span>'s current password will stop working
          immediately. A new secure temporary password will be generated for them.
        </p>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReset}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold rounded-lg py-2.5 transition-colors"
          >
            {loading ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
