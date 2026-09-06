import { useState, useEffect, useCallback } from 'react';
import { fetchDocuments } from '../../api/axios';
import DocumentStatusBadge from '../../components/admin/DocumentStatusBadge';
import StepStatusPill from '../../components/admin/StepStatusPill';
import NewDocumentModal from '../../components/admin/NewDocumentModal';
import DocumentDetailModal from '../../components/admin/DocumentDetailModal';
import DocumentFormModal from '../../components/admin/DocumentFormModal';
import { useToast } from '../../context/ToastContext';

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
  const [statusTab, setStatusTab] = useState('all');
  const [documents, setDocuments] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedId, setSelectedId] = useState(null); // read-only form viewer
  const [manageId, setManageId] = useState(null); // interactive status-transition modal
  const { showToast } = useToast();

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

  const handleTabChange = (tab) => {
    setStatusTab(tab);
    setPage(1);
  };

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workflow Monitoring</h1>
          <p className="text-slate-500 mt-1">View and audit all document movements across offices.</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-100 transition-all"
        >
          + New Document
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {STATUS_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleTabChange(value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              statusTab === value ? 'bg-white shadow text-blue-700' : 'text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 bg-white rounded-xl border border-slate-100 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan="10" className="text-center py-8 text-slate-400">Loading…</td></tr>
            ) : documents.length === 0 ? (
              <tr><td colSpan="10" className="text-center py-8 text-slate-400">No documents found.</td></tr>
            ) : (
              documents.map((doc) => (
                <tr
                  key={doc.id}
                  onClick={() => setSelectedId(doc.id)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-5 py-3 font-mono text-blue-600 text-xs">{doc.tracking_number}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{doc.document_type_name}</td>
                  <td className="px-5 py-3 text-slate-600">{doc.requested_by_name}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <DocumentStatusBadge doc={doc} />
                      {doc.was_returned && (
                        <span className="inline-flex text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                          Returned
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3"><StepStatusPill statuses={doc.step_statuses} /></td>
                  <td className="px-5 py-3 text-slate-600 text-xs">
                    {doc.dwell_display ? `${doc.dwell_display} @ ${doc.current_office}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {doc.current_handler ? (
                      <>
                        <p>{doc.current_handler.full_name}</p>
                        <p className="font-mono text-[10px] font-bold text-blue-600">
                          {doc.current_handler.employee_id || '—'}
                        </p>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs">
                    {new Date(doc.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-slate-600 text-xs">
                    {doc.released_at ? (
                      <>
                        <p>{new Date(doc.released_at).toLocaleString()}</p>
                        <p className="text-slate-400">{doc.released_by_name || '—'}</p>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-600 text-xs">{doc.origin_office || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-500">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
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
    </div>
  );
}