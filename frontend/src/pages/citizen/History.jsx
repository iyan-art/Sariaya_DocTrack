import { useState, useEffect } from 'react';
import { fetchMyDocuments, fetchMyDocumentDetail } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import DocumentStatusBadge from '../../components/admin/DocumentStatusBadge';
import StepStatusPill from '../../components/admin/StepStatusPill';
import DocumentFormModal from '../../components/admin/DocumentFormModal';
import ReturnDocumentModal from '../../components/citizen/ReturnDocumentModal';
import { EyeIcon, FileTextIcon, ArrowRightLeftIcon } from '../../components/Icons';

// Citizen-facing request history — view/print/download only. No onManage
// prop is passed to DocumentFormModal here, so the "Manage / Update Status"
// action never appears; editing a document's status stays staff-only.
// Rating a released document now happens from the public tracking page
// (/track/<number>) instead of here — see ReturnDocumentModal for why this
// slot became "Return" instead.
export default function History() {
  const { showToast } = useToast();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [returningDoc, setReturningDoc] = useState(null);

  const loadDocs = () => {
    fetchMyDocuments()
      .then((res) => setDocs(res.data.results || []))
      .catch((err) => {
        showToast(err.response?.data?.detail || 'Failed to load your document requests.', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDocs(); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">My Document Requests</h1>
      <p className="text-slate-500 mt-1">View, print, or download the official record of any document you've requested.</p>

      <div className="mt-6 bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {loading ? (
          <p className="text-slate-400 text-center py-16">Loading…</p>
        ) : docs.length === 0 ? (
          <div className="text-center py-16 px-6">
            <FileTextIcon className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">You haven't requested any documents yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tracking #</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Document Type</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Progress</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date Requested</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr
                    key={doc.id}
                    onClick={() => setSelectedId(doc.id)}
                    className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 font-mono font-bold text-blue-700">{doc.tracking_number}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800">{doc.document_type_name}</td>
                    <td className="px-5 py-3"><StepStatusPill statuses={doc.step_statuses} /></td>
                    <td className="px-5 py-3"><DocumentStatusBadge doc={doc} /></td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{new Date(doc.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {doc.status === 'released' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setReturningDoc(doc); }}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <ArrowRightLeftIcon className="w-3.5 h-3.5" /> Return
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedId(doc.id); }}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
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
    </div>
  );
}
