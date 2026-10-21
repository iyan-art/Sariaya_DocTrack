import { useState, useEffect } from 'react';
import { fetchMyDocuments, fetchMyDocumentDetail, deleteMyDocument, expediteDocument } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import { canDeleteDocument } from '../../utils/documentPermissions';
import DocumentStatusBadge from '../../components/admin/DocumentStatusBadge';
import StepStatusPill from '../../components/admin/StepStatusPill';
import StatusLegend from '../../components/admin/StatusLegend';
import NearDueWarningBadge from '../../components/admin/NearDueWarningBadge';
import DocumentFormModal from '../../components/admin/DocumentFormModal';
import ReturnDocumentModal from '../../components/citizen/ReturnDocumentModal';
import ConfirmModal from '../../components/ConfirmModal';
import { EyeIcon, FileTextIcon, ArrowRightLeftIcon, TrashIcon, BellIcon } from '../../components/Icons';

// Citizen-facing request history — view/print/download only. No onManage
// prop is passed to DocumentFormModal here, so the "Manage / Update Status"
// action never appears; editing a document's status stays staff-only.
// Rating a released document now happens from the public tracking page
// (/track/<number>) instead of here — see ReturnDocumentModal for why this
// slot became "Return" instead.
export default function History() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [returningDoc, setReturningDoc] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [expeditingId, setExpeditingId] = useState(null);

  const loadDocs = () => {
    fetchMyDocuments()
      .then((res) => setDocs(res.data.results || []))
      .catch((err) => {
        showToast(err.response?.data?.detail || 'Failed to load your document requests.', 'error');
      })
      .finally(() => setLoading(false));
  };

  const handleConfirmCancel = async () => {
    setCancelling(true);
    try {
      await deleteMyDocument(cancelTarget.id);
      showToast(`${cancelTarget.tracking_number} cancelled.`, 'success');
      setCancelTarget(null);
      loadDocs();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to cancel this request.'), 'error');
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => { loadDocs(); }, []);

  const handleExpedite = async (e, doc) => {
    e.stopPropagation();
    setExpeditingId(doc.id);
    try {
      const res = await expediteDocument(doc.id);
      showToast(res.data.detail || 'Follow-up request sent.', 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to send follow-up request.'), 'error');
    } finally {
      setExpeditingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">My Document Requests</h1>
      <p className="text-slate-500 dark:text-slate-400 mt-1">View, print, or download the official record of any document you've requested.</p>

      <div className="mt-4">
        <StatusLegend />
      </div>

      <div className="mt-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <p className="text-slate-400 dark:text-slate-500 text-center py-16">Loading…</p>
        ) : docs.length === 0 ? (
          <div className="text-center py-16 px-6">
            <FileTextIcon className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 dark:text-slate-500 font-medium">You haven't requested any documents yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tracking #</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Document Type</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Progress</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Date Requested</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr
                    key={doc.id}
                    onClick={() => setSelectedId(doc.id)}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 font-mono font-bold text-blue-700 dark:text-blue-400">{doc.tracking_number}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-200">{doc.document_type_name}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <StepStatusPill statuses={doc.step_statuses} />
                        <NearDueWarningBadge statuses={doc.step_statuses} />
                      </div>
                    </td>
                    <td className="px-5 py-3"><DocumentStatusBadge doc={doc} /></td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400 text-xs">{new Date(doc.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {doc.status === 'released' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setReturningDoc(doc); }}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <ArrowRightLeftIcon className="w-3.5 h-3.5" /> Return
                          </button>
                        )}
                        {doc.step_statuses?.[doc.route_position] === 'delayed' && (
                          <button
                            onClick={(e) => handleExpedite(e, doc)}
                            disabled={expeditingId === doc.id}
                            title="This document is running late — request a follow-up"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <BellIcon className="w-3.5 h-3.5" /> {expeditingId === doc.id ? 'Sending…' : 'Follow Up'}
                          </button>
                        )}
                        {canDeleteDocument(doc, user) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setCancelTarget(doc); }}
                            title="Cancel this request"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <TrashIcon className="w-3.5 h-3.5" /> Cancel
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedId(doc.id); }}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <EyeIcon className="w-3.5 h-3.5" /> View / Print
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId && (
        <DocumentFormModal
          documentId={selectedId}
          fetchDetail={fetchMyDocumentDetail}
          onClose={() => setSelectedId(null)}
        />
      )}
      {returningDoc && (
        <ReturnDocumentModal
          document={returningDoc}
          onClose={() => setReturningDoc(null)}
          onReturned={loadDocs}
        />
      )}
      {cancelTarget && (
        <ConfirmModal
          title="Cancel this request?"
          message={`${cancelTarget.tracking_number} (${cancelTarget.document_type_name}) will be permanently cancelled. This cannot be undone.`}
          confirmLabel={cancelling ? 'Cancelling…' : 'Cancel Request'}
          confirmColor="bg-red-600 hover:bg-red-700"
          onCancel={() => setCancelTarget(null)}
          onConfirm={handleConfirmCancel}
        />
      )}
    </div>
  );
}
