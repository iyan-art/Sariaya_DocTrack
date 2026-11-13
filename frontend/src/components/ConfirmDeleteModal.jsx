import { useState } from 'react';
import PasswordInput from './PasswordInput';
import { extractErrorMessage } from '../utils/apiError';

/**
 * Deleting an important record asks for the admin's password again (the
 * server checks it and logs the attempt). `onConfirm(password)` performs
 * the delete and returns its promise; any refusal — a wrong password, or a
 * record still in use — is shown here and the dialog stays open.
 */
export default function ConfirmDeleteModal({ title, message, onConfirm, onCancel }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(password);
    } catch (err) {
      setError(extractErrorMessage(err, "This couldn't be deleted. Please try again."));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm p-6 modal-pop-in"
      >
        <h3 id="confirm-delete-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{message}</p>
        <label htmlFor="confirm-delete-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mt-4">
          Enter your password to confirm
        </label>
        <PasswordInput
          id="confirm-delete-password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1.5">{error}</p>}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !password}
            className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 text-sm transition-colors"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </form>
    </div>
  );
}
