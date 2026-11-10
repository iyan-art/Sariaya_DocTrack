import { useState } from 'react';
import { citizenReturnDocument } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import { MapPinIcon } from '../Icons';

/**
 * "Return for Correction": the citizen sends a RELEASED document of theirs
 * back to the office that released it (a typo, incorrect or missing
 * details), with required remarks. The server marks it Returned and alerts
 * that office's staff with the tracking number and these remarks. `document`
 * is the row object the caller already has loaded, so no extra fetch is
 * needed just to show which request is being returned.
 */
export default function ReturnDocumentModal({ document, onClose, onReturned }) {
  const { showToast } = useToast();
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!notes.trim()) {
      showToast('Please describe what needs to be corrected.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await citizenReturnDocument(document.id, notes);
      showToast(`Returned for correction. ${document.current_office || 'The releasing office'} has been notified.`, 'success');
      onReturned?.();
      onClose();
    } catch (err) {
      showToast(extractErrorMessage(err, "We couldn't submit your return. Please try again."), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl dark:shadow-none w-full max-w-md modal-pop-in overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MapPinIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Return for Correction
          </h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Returning</p>
            <p className="font-mono font-bold text-blue-700 dark:text-blue-400">{document.tracking_number}</p>
            <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{document.document_type_name}</p>
          </div>

          <div>
            <label htmlFor="return-remarks" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Remarks / Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              id="return-remarks"
              required
              rows={4}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Typo in applicant name, incorrect address details, missing information…"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              The office that released your document will be notified with these remarks and will contact you once it's corrected.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting || !notes.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 transition-colors"
          >
            {submitting ? 'Submitting…' : 'Return for Correction'}
          </button>
        </form>
      </div>
    </div>
  );
}
