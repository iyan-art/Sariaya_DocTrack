import { useState, useEffect } from 'react';
import { fetchDocumentDetail, transitionDocument, releaseToCitizen, flagDocumentMissing } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import DocumentStatusBadge from './DocumentStatusBadge';
import PrintableQRSlip from './PrintableQRSlip';
import PrintableDocumentForm from './PrintableDocumentForm';
import { PrinterIcon } from '../Icons';

// Keyed by the document's actual Document.Status values. Mirrors the
// release -> receive -> (repeat) -> completed -> released chain enforced
// server-side in apps/documents/services.py.
// 'return_to_office' (Controlled Return — sends an in-progress document
// backward to whichever office last forwarded it) is deliberately a
// different action value from 'return' below (kept as the internal action
// value for backward compatibility — only the label changed), which calls
// release_to_citizen() and means "hand the completed document to the
// citizen, and notify them by email." They never appear together since
// they live on different statuses.
const NEXT_ACTIONS = {
  in_progress: [
    { action: 'release', label: 'Release to Next Office' },
    { action: 'return_to_office', label: 'Return' },
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

export default function DocumentDetailModal({ documentId, onClose, onUpdated }) {
  const { showToast } = useToast();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionForm, setActionForm] = useState({ action: '', office: '', notes: '' });
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
  const availableActions = doc
    ? (NEXT_ACTIONS[doc.status] || [])
        .filter((a) => a.action !== 'return_to_office' || doc.route_position > 0)
        .map((a) => (a.action === 'receive' && doc.is_returning) ? { ...a, label: 'Confirm Return Received' } : a)
    : [];

  const handleTransition = async (e) => {
    e.preventDefault();
    const { action, office, notes } = actionForm;

    if (action === 'return_to_office' && !notes.trim()) {
      showToast('Please provide a reason for returning this document.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (action === 'return') {
        const res = await releaseToCitizen(documentId, { notes });
        const outcome = EMAIL_STATUS_TOAST[res.data.email_status];
        showToast(outcome?.message || 'Document released to citizen.', outcome?.type || 'success');
      } else if (action === 'flagged_missing') {
        await flagDocumentMissing(documentId, { notes });
        showToast('Document status updated.', 'success');
      } else {
        // 'release', 'receive', or 'return_to_office' — office is only
        // meaningful for 'receive' (defaults to the current staff member's
        // own office if left blank); return_to_office's destination is
        // computed automatically server-side, not chosen here.
        await transitionDocument(documentId, { action, office, notes });
        showToast(
          action === 'return_to_office' ? 'Document returned to the previous office.' : 'Document status updated.',
          'success',
        );
      }
      setActionForm({ action: '', office: '', notes: '' });
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg modal-pop-in max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-7 pt-7 shrink-0">
          <h2 className="text-xl font-bold text-slate-900">Document Details</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        {loading || !doc ? (
          <p className="text-slate-400 text-center py-10">Loading…</p>
        ) : (
          <div className="flex-1 overflow-y-auto px-7 pb-7 min-h-0">
            <div className="mt-4">
              <p className="font-mono text-sm text-blue-600">{doc.tracking_number}</p>
              <p className="font-semibold text-slate-900 text-lg mt-1">{doc.document_type_name}</p>
              {doc.description && <p className="text-sm text-slate-500 mt-1">{doc.description}</p>}
              <div className="mt-2"><DocumentStatusBadge doc={doc} /></div>
            </div>

            <div className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Requested by</span>
                <span className="text-slate-800">{doc.requested_by_name}</span>
              </div>
              {!doc.requested_by && (
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Contact email</span>
                  <span className="text-slate-800">
                    {doc.guest_email || <span className="text-slate-400 italic">Not provided</span>}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Current office</span>
                <span className="text-slate-800">{doc.current_office}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Current handler</span>
                <span className="text-slate-800">
                  {doc.current_handler ? `${doc.current_handler.full_name} (${doc.current_handler.position || doc.current_handler.role})` : '—'}
                </span>
              </div>
            </div>

            {/* Action form — only shown if there are valid next actions */}
            {availableActions.length > 0 && (
              <form onSubmit={handleTransition} className="mt-5 bg-slate-50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Update status</p>
                <select
                  required
                  value={actionForm.action}
                  onChange={(e) => setActionForm({ ...actionForm, action: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                )}
                <div>
                  {actionForm.action === 'return_to_office' && (
                    <label className="block text-xs font-bold text-slate-500 mb-1">
                      Reason for returning <span className="text-red-500">*</span>
                    </label>
                  )}
                  <textarea
                    required={actionForm.action === 'return_to_office'}
                    placeholder={
                      actionForm.action === 'return_to_office'
                        ? 'Explain what needs to be corrected before this document can move forward again…'
                        : 'Notes (optional)'
                    }
                    rows={2}
                    value={actionForm.notes}
                    onChange={(e) => setActionForm({ ...actionForm, notes: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button type="submit" disabled={submitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-lg py-2.5 text-sm transition-colors">
                  {submitting ? 'Updating…' : 'Apply update'}
                </button>
              </form>
            )}
            <div className="mt-6 flex flex-col items-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-6">
                {doc.qr_code ? (
                    <img 
                        /* If the backend gave a full URL, use it. If not, add the domain. */
                        src={doc.qr_code.startsWith('http') ? doc.qr_code : `http://127.0.0.1:8000${doc.qr_code}`} 
                        alt="QR Code" 
                        className="w-44 h-44 shadow-md rounded-lg mb-3 bg-white p-2"
                        onError={(e) => {
                            console.error("Path error on image:", e.target.src);
                            e.target.src = "https://via.placeholder.com/150?text=Check+Console";
                        }}
                    />
                ) : (
                    <p className="text-xs text-slate-400">No QR Code Generated</p>
                )}
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Official Tracking QR</p>
                <p className="text-xs text-slate-400 mt-1">Scan to advance or track status</p>
                {doc.qr_code && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                      onClick={() => setShowSlip(true)}
                      className="flex items-center gap-2 bg-slate-900 hover:bg-black text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors"
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
              <p className="text-sm font-semibold text-slate-700 mb-2">History</p>
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {doc.logs.map((log) => (
                  <div key={log.id} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-slate-800 break-words">
                        <span className="font-medium capitalize">{log.action.replace(/_/g, ' ')}</span> at {log.office?.name || '—'}
                      </p>
                      <p className="text-slate-400 text-xs break-words">
                        {log.acted_by
                          ? `${log.acted_by.full_name} (${log.acted_by.position || log.acted_by.role})${log.acted_by.employee_id ? ` · ${log.acted_by.employee_id}` : ''}`
                          : 'Unknown'}
                        {' · '}
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                      {log.notes && <p className="text-slate-500 text-xs mt-0.5 break-words">{log.notes}</p>}
                      {log.duration_display && (
                        <p className="text-blue-600 text-[10px] font-bold mt-1">
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