import { useState } from 'react';
import { transferDocument } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import DocumentStatusBadge from './DocumentStatusBadge';
import { ArrowRightLeftIcon, CheckCircle2Icon, HandshakeIcon, Clock4Icon } from '../Icons';

const ACTION_META = {
  release: { label: 'Forward to Next Office', verb: 'Released', icon: ArrowRightLeftIcon, color: 'bg-blue-600 hover:bg-blue-700' },
  receive: { label: 'Accept at My Office', verb: 'Received', icon: CheckCircle2Icon, color: 'bg-green-600 hover:bg-green-700' },
  return: { label: 'Release to Citizen', verb: 'Released to citizen', icon: HandshakeIcon, color: 'bg-indigo-600 hover:bg-indigo-700' },
};

/**
 * Opened immediately after EmployeeQRScanner resolves a physical QR tag.
 * Pre-filled from the scan — current step, dwell time, time spent at the
 * previous office — so the employee reviews before confirming rather than
 * the scan silently executing a transfer on its own. Confirming calls the
 * same /documents/transfer/ endpoint the manual scan flow already uses, so
 * the acting Unique User ID is stamped on the resulting DocumentLog exactly
 * the same way (via request.user server-side) with no extra plumbing here.
 */
export default function QRTransferConfirmModal({ document, scanContext, rawPayload, onClose, onConfirmed }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const action = scanContext?.suggested_action;
  const meta = action ? ACTION_META[action] : null;
  const Icon = meta?.icon;

  const handleConfirm = async () => {
    if (!action) return;
    setSubmitting(true);
    try {
      const res = await transferDocument({
        qr_payload: rawPayload,
        action,
        notes: notes || `${meta.verb} via QR scan by ${user.full_name} (${user.employee_id || user.office}).`,
      });
      showToast(res.data.detail, 'success');
      onConfirmed(res.data.document);
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to process transfer.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl dark:shadow-none w-full max-w-md p-7 modal-pop-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Confirm Transfer</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl">×</button>
        </div>

        <div className="mt-4">
          <p className="font-mono text-sm text-blue-600 dark:text-blue-400 font-bold">{document.tracking_number}</p>
          <p className="font-semibold text-slate-900 dark:text-slate-100 text-lg mt-1">{document.document_type_name}</p>
          <div className="mt-2"><DocumentStatusBadge doc={document} /></div>
        </div>

        <div className="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Step</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{scanContext.current_step_number} of {scanContext.total_steps}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Current office</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{scanContext.current_office}</span>
          </div>
          {scanContext.next_office && (
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Next office</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{scanContext.next_office}</span>
            </div>
          )}
          <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-700 pt-3">
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1"><Clock4Icon className="w-3.5 h-3.5" /> Dwell time here</span>
            <span className="font-bold text-amber-700 dark:text-amber-400">{scanContext.dwell_display}</span>
          </div>
          {scanContext.previous_office_duration_display && (
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Time spent at previous office</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">{scanContext.previous_office_duration_display}</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between text-xs bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 rounded-xl px-3 py-2.5">
          <span className="text-blue-700 dark:text-blue-400 font-medium">Acting as</span>
          <span className="font-mono font-bold text-blue-900 dark:text-blue-300">{user.full_name} · {user.employee_id || '—'}</span>
        </div>

        {meta ? (
          <>
            <textarea
              placeholder="Notes (optional)"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full mt-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className={`w-full flex items-center justify-center gap-2 mt-4 text-white font-bold py-3.5 rounded-2xl transition-all disabled:opacity-60 ${meta.color}`}
            >
              <Icon className="w-5 h-5" /> {submitting ? 'Processing…' : meta.label}
            </button>
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl p-4 text-center">
            This document's current status doesn't have a next scan action available.
          </p>
        )}
      </div>
    </div>
  );
}
