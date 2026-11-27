import { useState } from 'react';
import { extractErrorMessage } from '../utils/apiError';

/**
 * Every delete names the record in bold and asks for that exact name to be
 * typed (or copied and pasted) before Delete is enabled; the server checks
 * the name again. `onConfirm(name)` performs the delete with the confirmed
 * name and returns its promise; a refusal (a record still in use, say) is
 * shown here and the dialog stays open.
 */
export default function ConfirmDeleteModal({
  title, message, onConfirm, onCancel, confirmText, confirmLabel = 'Delete', busyLabel = 'Deleting…',
}) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const name = (confirmText || '').trim();
  const matches = Boolean(name) && typed.trim() === name;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!matches) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(typed.trim());
    } catch (err) {
      setError(extractErrorMessage(err, "This couldn't be deleted. Please try again."));
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
        <p className="text-sm text-slate-700 dark:text-slate-200 mt-2">
          Are you sure you want to delete <strong className="font-bold text-slate-900 dark:text-white break-words">{name}</strong>?
        </p>
        {message && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{message}</p>}
        <label htmlFor="confirm-delete-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mt-4">
          Type <strong className="font-bold select-all">{name}</strong> to confirm
        </label>
        <input
          id="confirm-delete-name"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-invalid={typed !== '' && !matches}
          className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
        {typed !== '' && !matches && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">The name doesn't match yet.</p>
        )}
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
            disabled={busy || !matches}
            className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium py-2.5 text-sm transition-colors"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
