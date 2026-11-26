import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import { useToast } from '../../context/ToastContext';
import { ArrowRightLeftIcon, CheckCircle2Icon } from '../Icons';

const ACTIONS = [
  { value: 'receive', label: 'Receive at my office', verb: 'Received' },
  { value: 'release', label: 'Send to next office', verb: 'Sent' },
  { value: 'return_to_office', label: 'Return to previous office', verb: 'Returned' },
];

/**
 * The scan confirmation used with no internet connection. The document's
 * current state can't be looked up offline, so the staff member picks the
 * action; it is saved on this device and applied when the connection is
 * back, after the server checks it exactly like an online scan. Release to
 * the citizen is not offered: it is the final hand-over and is done online.
 */
export default function OfflineScanModal({ rawPayload, trackingNumber, onClose, onSaved }) {
  const { user } = useAuth();
  const { addToQueue } = useOfflineSync();
  const { showToast } = useToast();
  const [action, setAction] = useState('receive');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const isReturn = action === 'return_to_office';
  const meta = ACTIONS.find((a) => a.value === action);

  const handleSave = async () => {
    if (isReturn && !notes.trim()) {
      showToast('Please give the reason for returning this document.', 'error');
      return;
    }
    setSaving(true);
    try {
      await addToQueue({
        qrPayload: rawPayload,
        trackingNumber,
        action,
        notes: notes.trim() || `${meta.verb} via QR scan by ${user.full_name} (${user.employee_id || user.office}).`,
      });
      onSaved({ trackingNumber, actionLabel: meta.label });
    } catch {
      showToast('Could not save the scan on this device.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl dark:shadow-none w-full max-w-md p-7 modal-pop-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Offline Scan</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl">×</button>
        </div>

        <p className="mt-4 font-mono text-sm text-blue-600 dark:text-blue-400 font-bold break-all">{trackingNumber}</p>

        <p className="mt-3 text-xs rounded-xl border border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 text-orange-800 dark:text-orange-300 px-3 py-2.5">
          You are offline. This scan is saved on this device with the time it was made, and is applied
          when you are back online. The system checks it then, the same as an online scan.
        </p>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Action</legend>
          {ACTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm cursor-pointer ${
                action === option.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-200'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              <input
                type="radio"
                name="offline-action"
                value={option.value}
                checked={action === option.value}
                onChange={() => setAction(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <div className="mt-4 flex items-center justify-between text-xs bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 rounded-xl px-3 py-2.5">
          <span className="text-blue-700 dark:text-blue-400 font-medium">Acting as</span>
          <span className="font-mono font-bold text-blue-900 dark:text-blue-300">{user.full_name} · {user.employee_id || '—'}</span>
        </div>

        <label className="block mt-4 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
          {isReturn ? <>Reason for returning <span className="text-red-500">*</span></> : 'Notes (optional)'}
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={isReturn ? 'e.g. Missing signature' : ''}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 mt-4 text-white font-bold py-3.5 rounded-2xl transition-all disabled:opacity-60 bg-orange-600 hover:bg-orange-700"
        >
          {action === 'receive' ? <CheckCircle2Icon className="w-5 h-5" /> : <ArrowRightLeftIcon className="w-5 h-5" />}
          {saving ? 'Saving…' : 'Save Offline Scan'}
        </button>
      </div>
    </div>
  );
}
