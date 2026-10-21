import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchDocuments, deleteDocument } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import DocumentStatusBadge from '../../components/admin/DocumentStatusBadge';
import StepStatusPill from '../../components/admin/StepStatusPill';
import StatusLegend from '../../components/admin/StatusLegend';
import NearDueWarningBadge from '../../components/admin/NearDueWarningBadge';
import NewDocumentModal from '../../components/admin/NewDocumentModal';
import DocumentDetailModal from '../../components/admin/DocumentDetailModal';
import DocumentFormModal from '../../components/admin/DocumentFormModal';
import ConfirmModal from '../../components/ConfirmModal';
import { TrashIcon } from '../../components/Icons';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import { canDeleteDocument } from '../../utils/documentPermissions';

// Matches the real Document.Status choices — not DocumentLog actions.
const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'completed', label: 'Completed' },
  { value: 'released', label: 'Released' },
  { value: 'missing', label: 'Missing' },
];

export default function DocumentRequest() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusTab, setStatusTab] = useState('all');
  const [documents, setDocuments] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedId, setSelectedId] = useState(null); // read-only form viewer
  const [manageId, setManageId] = useState(null); // interactive status-transition modal
  const [deleteTarget, setDeleteTarget] = useState(null); // document pending delete confirmation
  const [deleting, setDeleting] = useState(false);
  const { showToast } = useToast();

  // Quick-redirect target from NotificationBell ("?doc=123") — open that
  // document's record straight away, then drop the param so a refresh or
  // the back button doesn't keep re-opening it.
  useEffect(() => {
    const docParam = searchParams.get('doc');
    if (docParam) {
      setSelectedId(Number(docParam));
      setSearchParams((params) => { params.delete('doc'); return params; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const loadDocuments = useCallback(() => {
    setLoading(true);
    fetchDocuments(statusTab === 'all' ? '' : statusTab, page)
      .then((res) => {
        setDocuments(res.data.results);
        setCount(res.data.count);
      })
      .catch((err) => {
        showToast(err.response?.data?.detail || 'Failed to load documents.', 'error');
      })
      .finally(() => setLoading(false));
  }, [statusTab, page, showToast]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteDocument(deleteTarget.id);
      showToast(`${deleteTarget.tracking_number} deleted.`, 'success');
      setDeleteTarget(null);
      loadDocuments();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to delete document request.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleTabChange = (tab) => {
    setStatusTab(tab);
    setPage(1);
  };

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Workflow Monitoring</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">View and audit all document movements across offices.</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-100 dark:shadow-none transition-all"
        >
          + New Document
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
        {STATUS_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleTabChange(value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              statusTab === value ? 'bg-white dark:bg-slate-700 shadow text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <StatusLegend />
      </div>

      <div className="mt-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3">Tracking #</th>
              <th className="text-left px-5 py-3">Doc Type</th>
              <th className="text-left px-5 py-3">Requester</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">Progress</th>
              <th className="text-left px-5 py-3">Dwell Time</th>
              <th className="text-left px-5 py-3">Handler</th>
              <th className="text-left px-5 py-3">Requested</th>
              <th className="text-left px-5 py-3">Released</th>
              <th className="text-left px-5 py-3">Releasing Office</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan="11" className="text-center py-8 text-slate-400 dark:text-slate-500">Loading…</td></tr>
            ) : documents.length === 0 ? (
              <tr><td colSpan="11" className="text-center py-8 text-slate-400 dark:text-slate-500">No documents found.</td></tr>
            ) : (
              documents.map((doc) => (
                <tr
                  key={doc.id}
                  onClick={() => setSelectedId(doc.id)}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="px-5 py-3 font-mono text-blue-600 dark:text-blue-400 text-xs">{doc.tracking_number}</td>
                  <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">{doc.document_type_name}</td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400">{doc.requested_by_name}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <DocumentStatusBadge doc={doc} />
                      {doc.was_returned && (
                        <span className="inline-flex text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/30">
                          Returned
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <StepStatusPill statuses={doc.step_statuses} />
                      <NearDueWarningBadge statuses={doc.step_statuses} />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400 text-xs">
                    {doc.dwell_display ? `${doc.dwell_display} @ ${doc.current_office}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                    {doc.current_handler ? (
                      <>
                        <p>{doc.current_handler.full_name}</p>
                        <p className="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400">
                          {doc.current_handler.employee_id || '—'}
                        </p>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-400 dark:text-slate-500 text-xs">
                    {new Date(doc.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400 text-xs">
                    {doc.released_at ? (
                      <>
                        <p>{new Date(doc.released_at).toLocaleString()}</p>
                        <p className="text-slate-400 dark:text-slate-500">{doc.released_by_name || '—'}</p>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400 text-xs">{doc.origin_office || '—'}</td>
                  <td className="px-5 py-3">
                    {canDeleteDocument(doc, user) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(doc); }}
                        title="Delete document request"
                        className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 p-1.5 rounded-lg transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-500 dark:text-slate-400">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {showNewModal && (
        <NewDocumentModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => { setPage(1); loadDocuments(); }}
        />
      )}

      {selectedId && (
        <DocumentFormModal
          documentId={selectedId}
          onClose={() => setSelectedId(null)}
          onManage={() => { setManageId(selectedId); setSelectedId(null); }}
        />
      )}

      {manageId && (
        <DocumentDetailModal
          documentId={manageId}
          onClose={() => setManageId(null)}
          onUpdated={loadDocuments}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete this document request?"
          message={`${deleteTarget.tracking_number} (${deleteTarget.document_type_name}) will be permanently deleted. This cannot be undone.`}
          confirmLabel={deleting ? 'Deleting…' : 'Delete'}
          confirmColor="bg-red-600 hover:bg-red-700"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}