import { useState, useEffect } from 'react';
import { fetchDocumentDetail, transitionDocument, releaseToCitizen, flagDocumentMissing, mediaUrl } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import DocumentStatusBadge from './DocumentStatusBadge';
import PrintableQRSlip from './PrintableQRSlip';
import PrintableDocumentForm from './PrintableDocumentForm';
import { PrinterIcon } from '../Icons';

// Keyed by the document's actual Document.Status values. Mirrors the
// release -> receive -> (repeat) -> completed -> released chain enforced
// server-side in apps/documents/services.py.
// 'return_to_office' (Controlled Return — marks the document Returned and
// sends it back to the previous or the originating office) is deliberately a
// different action value from 'return' below (kept as the internal action
// value for backward compatibility — only the label changed), which calls
// release_to_citizen() and means "hand the completed document to the
// citizen." They never appear together since they live on different statuses.
const NEXT_ACTIONS = {
  in_progress: [
    { action: 'release', label: 'Release to Next Office' },
    { action: 'return_to_office', label: 'Returned (send back for revision)' },
    { action: 'flagged_missing', label: 'Flag as Missing' },
  ],
  // Back at this office for revision: once fixed, it moves forward again.
  returned: [
    { action: 'release', label: 'Corrected — Release to Next Office' },
    { action: 'return_to_office', label: 'Returned (send back for revision)' },
    { action: 'flagged_missing', label: 'Flag as Missing' },
  ],
  in_transit: [
    { action: 'receive', label: 'Mark as Received' },
    { action: 'flagged_missing', label: 'Flag as Missing' },
  ],
  completed: [{ action: 'return', label: 'Release to Citizen' }],
  released: [],
  missing: [],
};

// Maps DocumentReleaseView's `email_status` to the staff-facing toast —
// see services.py::release_to_citizen()/_maybe_notify_citizen_ready() for
// what each outcome means.
const EMAIL_STATUS_TOAST = {
  sent: { message: 'Document released and notification email sent successfully.', type: 'success' },
  already_sent: { message: 'Document released. The citizen was already notified by email earlier.', type: 'success' },
  skipped: { message: 'Document released, but no email is on file for this citizen — notification not sent.', type: 'error' },
  failed: { message: 'Document released, but the notification email failed to send. Please follow up with the citizen directly.', type: 'error' },
};

// Same idea for the receive that completes a document's route — the moment
// the citizen's "ready for pickup" email goes out (services.py::receive_document()).
const READY_EMAIL_STATUS_TOAST = {
  sent: { message: 'Document received. The citizen was emailed that it is ready for pickup.', type: 'success' },
  skipped: { message: 'Document received, but no email is on file for this citizen. Please contact them directly.', type: 'error' },
  failed: { message: 'Document received, but the ready-for-pickup email failed to send. Please follow up with the citizen directly.', type: 'error' },
};

// After a requester's return is fixed (services.py::mark_corrected()).
const CORRECTED_EMAIL_STATUS_TOAST = {
  sent: { message: 'Marked corrected. The citizen was emailed that it is ready for pickup again.', type: 'success' },
  already_sent: { message: 'Marked corrected. The citizen was already emailed.', type: 'success' },
  skipped: { message: 'Marked corrected, but no email is on file for this citizen. Please contact them directly.', type: 'error' },
  failed: { message: 'Marked corrected, but the email failed to send. Please follow up with the citizen directly.', type: 'error' },
};

export default function DocumentDetailModal({ documentId, onClose, onUpdated }) {
  const { showToast } = useToast();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionForm, setActionForm] = useState({ action: '', office: '', notes: '', destination: 'previous' });
  const [submitting, setSubmitting] = useState(false);
  const [showSlip, setShowSlip] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setLoading(true);
    fetchDocumentDetail(documentId)
      .then((res) => setDoc(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [documentId]);

  // Only 'return_to_office' has a required Notes field — the reason a
  // returning office attaches so the receiving office understands what
  // needs correcting. Every other action's Notes stays optional, unchanged.
  const isInternal = doc?.document_type_scope === 'internal';
  // Where a return can go. Two choices only when the previous office isn't
  // already the originating office.
  const route = doc?.route || [];
  const previousOffice = doc ? route[doc.route_position - 1] : null;
  const originOffice = route[0];
  const canReturnToOrigin = Boolean(doc) && doc.route_position >= 2 && originOffice !== previousOffice;
  // Who sent it back and why (another office, or the requester after
  // release), shown while the document waits here to be fixed.
  const lastReturn = doc?.status === 'returned'
    ? [...(doc.logs || [])].reverse().find((l) => ['return_initiated', 'citizen_return_initiated'].includes(l.action))
    : null;
  const returnedByRequester = lastReturn?.action === 'citizen_return_initiated';
  // Returned to its final office (the requester sent it back): once fixed it
  // is ready for pickup again rather than forwarded anywhere.
  const atFinalStep = Boolean(doc) && doc.route_position === route.length - 1;
  const availableActions = doc
    ? (NEXT_ACTIONS[doc.status] || [])
        .filter((a) => a.action !== 'return_to_office' || doc.route_position > 0)
        .map((a) => (a.action === 'receive' && doc.is_returning) ? { ...a, label: 'Confirm Return Received' } : a)
        // Internal documents never go to a citizen — they finish back at the office that started them.
        .map((a) => (a.action === 'return' && isInternal) ? { ...a, label: 'Release to Originating Office' } : a)
        .map((a) => (doc.status === 'returned' && atFinalStep && a.action === 'release')
          ? { action: 'mark_corrected', label: 'Corrected — Ready for Pickup Again' } : a)
    : [];

  const handleTransition = async (e) => {
    e.preventDefault();
    const { action, office, notes, destination } = actionForm;

    if (action === 'return_to_office' && !notes.trim()) {
      showToast('Please provide the remarks / reason for returning this document.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (action === 'return') {
        const res = await releaseToCitizen(documentId, { notes });
        if (res.data.released_to === 'origin_office') {
          showToast('Document released to its originating office.', 'success');
        } else {
          const outcome = EMAIL_STATUS_TOAST[res.data.email_status];
          showToast(outcome?.message || 'Document released to citizen.', outcome?.type || 'success');
        }
      } else if (action === 'flagged_missing') {
        await flagDocumentMissing(documentId, { notes });
        showToast('Document status updated.', 'success');
      } else {
        // 'release', 'receive', or 'return_to_office' — office is only
        // meaningful for 'receive' (defaults to the current staff member's
        // own office if left blank); destination only for 'return_to_office'.
        const returnTo = canReturnToOrigin ? destination : 'previous';
        const res = await transitionDocument(documentId, {
          action, office, notes, ...(action === 'return_to_office' && { destination: returnTo }),
        });
        const readyOutcome = action === 'mark_corrected'
          ? CORRECTED_EMAIL_STATUS_TOAST[res.data.email_status]
          : READY_EMAIL_STATUS_TOAST[res.data.email_status];
        const returnedTo = returnTo === 'origin' ? originOffice : previousOffice;
        showToast(
          readyOutcome?.message || (action === 'return_to_office' ? `Document marked Returned and sent back to ${returnedTo}.` : 'Document status updated.'),
          readyOutcome?.type || 'success',
        );
      }
      setActionForm({ action: '', office: '', notes: '', destination: 'previous' });
      load();
      onUpdated();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to update status.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4 overlay-fade-in">
      {/* flex-col + shrink-0 header/max-h keep the header and status always
          visible — only the body (which can grow with a long history log)
          scrolls, so staff never has to zoom out to find them again. */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg modal-pop-in max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-7 pt-7 shrink-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Document Details</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl">×</button>
        </div>

        {loading || !doc ? (
          <p className="text-slate-400 dark:text-slate-500 text-center py-10">Loading…</p>
        ) : (
          <div className="flex-1 overflow-y-auto px-7 pb-7 min-h-0">
            <div className="mt-4">
              <p className="font-mono text-sm text-blue-600 dark:text-blue-400">{doc.tracking_number}</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100 text-lg mt-1">{doc.document_type_name}</p>
              {doc.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{doc.description}</p>}
              <div className="mt-2"><DocumentStatusBadge doc={doc} /></div>
              {lastReturn && (
                <div role="note" className="mt-3 rounded-xl border border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 p-3 text-sm">
                  <p className="font-bold text-orange-800 dark:text-orange-300">
                    {returnedByRequester ? 'Returned by the requester for correction' : 'Returned for revision'}
                  </p>
                  <p className="text-orange-900 dark:text-orange-200 mt-0.5 break-words">{lastReturn.notes}</p>
                  <p className="text-xs text-orange-700 dark:text-orange-400 mt-1">
                    By {lastReturn.acted_by?.full_name || 'staff'}{lastReturn.acted_by?.employee_id ? ` (${lastReturn.acted_by.employee_id})` : ''}
                    {lastReturn.office?.code ? ` · ${lastReturn.office.code}` : ''}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-slate-500 dark:text-slate-400">Requested by</span>
                <span className="text-slate-800 dark:text-slate-200">{doc.requested_by_name}</span>
              </div>
              {!doc.requested_by && (
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="text-slate-500 dark:text-slate-400">Contact email</span>
                  <span className="text-slate-800 dark:text-slate-200">
                    {doc.guest_email || <span className="text-slate-400 dark:text-slate-500 italic">Not provided</span>}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-slate-500 dark:text-slate-400">Current office</span>
                <span className="text-slate-800 dark:text-slate-200">{doc.current_office}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-slate-500 dark:text-slate-400">Current handler</span>
                <span className="text-slate-800 dark:text-slate-200">
                  {doc.current_handler ? `${doc.current_handler.full_name} (${doc.current_handler.position || doc.current_handler.role})` : '—'}
                </span>
              </div>
            </div>

            {/* Action form — only shown if there are valid next actions */}
            {availableActions.length > 0 && (
              <form onSubmit={handleTransition} className="mt-5 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Update status</p>
                <select
                  required
                  value={actionForm.action}
                  onChange={(e) => setActionForm({ ...actionForm, action: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select action…</option>
                  {availableActions.map((a) => (
                    <option key={a.action} value={a.action}>{a.label}</option>
                  ))}
                </select>
                {actionForm.action === 'receive' && (
                <input
                  placeholder="Receiving office (optional — defaults to your own office)"
                  value={actionForm.office}
                  onChange={(e) => setActionForm({ ...actionForm, office: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                )}
                {actionForm.action === 'return_to_office' && (
                  <div>
                    <label htmlFor="return-destination" className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Send back to</label>
                    {canReturnToOrigin ? (
                      <select
                        id="return-destination"
                        value={actionForm.destination}
                        onChange={(e) => setActionForm({ ...actionForm, destination: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="previous">Previous office ({previousOffice})</option>
                        <option value="origin">Originating office ({originOffice})</option>
                      </select>
                    ) : (
                      <p id="return-destination" className="text-sm text-slate-700 dark:text-slate-300">
                        {previousOffice}{previousOffice === originOffice ? ' (originating office)' : ' (previous office)'}
                      </p>
                    )}
                  </div>
                )}
                <div>
                  {actionForm.action === 'return_to_office' && (
                    <label htmlFor="action-notes" className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                      Remarks / Reason <span className="text-red-500">*</span>
                    </label>
                  )}
                  <textarea
                    id="action-notes"
                    required={actionForm.action === 'return_to_office'}
                    placeholder={
                      actionForm.action === 'return_to_office'
                        ? "e.g. Missing Mayor's signature, incomplete attachment, incorrect details…"
                        : 'Notes (optional)'
                    }
                    rows={2}
                    value={actionForm.notes}
                    onChange={(e) => setActionForm({ ...actionForm, notes: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button type="submit" disabled={submitting || (actionForm.action === 'return_to_office' && !actionForm.notes.trim())}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 text-sm transition-colors">
                  {submitting ? 'Updating…' : 'Apply update'}
                </button>
              </form>
            )}
            <div className="mt-6 flex flex-col items-center bg-slate-50 dark:bg-slate-800/60 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-6">
                {doc.qr_code ? (
                    <img
                        src={mediaUrl(doc.qr_code)}
                        alt="QR Code"
                        className="w-44 h-44 shadow-md rounded-lg mb-3 bg-white p-2"
                        onError={(e) => {
                            console.error("Path error on image:", e.target.src);
                            e.target.src = "https://via.placeholder.com/150?text=Check+Console";
                        }}
                    />
                ) : (
                    <p className="text-xs text-slate-400 dark:text-slate-500">No QR Code Generated</p>
                )}
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Official Tracking QR</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Scan to advance or track status</p>
                {doc.qr_code && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                      onClick={() => setShowSlip(true)}
                      className="flex items-center gap-2 bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors"
                    >
                      <PrinterIcon className="w-4 h-4" /> Print QR Slip
                    </button>
                    <button
                      onClick={() => setShowForm(true)}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors"
                    >
                      <PrinterIcon className="w-4 h-4" /> Print Official Form
                    </button>
                  </div>
                )}
            </div>


            {/* History log — internally scrollable once it's long, rather
                than pushing the modal's own height (and the footer/close
                button) further down. */}
            <div className="mt-6">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">History</p>
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {doc.logs.map((log) => (
                  <div key={log.id} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-slate-800 dark:text-slate-200 break-words">
                        <span className="font-medium capitalize">{log.action.replace(/_/g, ' ')}</span> at {log.office?.name || '—'}
                      </p>
                      <p className="text-slate-400 dark:text-slate-500 text-xs break-words">
                        {log.acted_by
                          ? `${log.acted_by.full_name} (${log.acted_by.position || log.acted_by.role})${log.acted_by.employee_id ? ` · ${log.acted_by.employee_id}` : ''}`
                          : 'Unknown'}
                        {' · '}
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                      {log.notes && <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 break-words">{log.notes}</p>}
                      {log.duration_display && (
                        <p className="text-blue-600 dark:text-blue-400 text-[10px] font-bold mt-1">
                            Time taken: {log.duration_display}
                        </p>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      {showSlip && <PrintableQRSlip document={doc} onClose={() => setShowSlip(false)} />}
      {showForm && <PrintableDocumentForm document={doc} onClose={() => setShowForm(false)} />}
    </div>
  );
}