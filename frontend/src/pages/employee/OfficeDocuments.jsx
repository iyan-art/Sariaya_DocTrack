import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchDocuments, deleteDocument } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import { canDeleteDocument } from '../../utils/documentPermissions';
import DocumentStatusBadge from "../../components/admin/DocumentStatusBadge";
import StepStatusPill from '../../components/admin/StepStatusPill';
import StatusLegend from '../../components/admin/StatusLegend';
import NearDueWarningBadge from '../../components/admin/NearDueWarningBadge';
import NewRequestModal from '../../components/employee/NewRequestModal';
import DocumentDetailModal from '../../components/admin/DocumentDetailModal';
import DocumentFormModal from '../../components/admin/DocumentFormModal';
import ConfirmModal from '../../components/ConfirmModal';
import { TrashIcon } from '../../components/Icons';
import api from '../../api/axios';

export default function OfficeDocuments() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allDocs, setAllDocs] = useState([]); // Master list mula sa API
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedId, setSelectedId] = useState(null); // read-only form viewer
  const [manageId, setManageId] = useState(null); // interactive status-transition modal
  const [confirmReleaseId, setConfirmReleaseId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Quick-redirect target from NotificationBell ("?doc=123").
  useEffect(() => {
    const docParam = searchParams.get('doc');
    if (docParam) {
      setSelectedId(Number(docParam));
      setSearchParams((params) => { params.delete('doc'); return params; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- NEW STATES FOR TABS & SEARCH ---
  const [activeTab, setActiveTab] = useState('my-requests');
  const [searchQuery, setSearchQuery] = useState('');

  const loadDocs = () => {
    setLoading(true);
    fetchDocuments('', 1)
      .then((res) => {
        setAllDocs(res.data.results || []);
      })
      .catch((err) => {
        showToast(err.response?.data?.detail || 'Failed to load documents.', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDocs(); }, []);

  // --- LOGIC: FILTER BY TAB + FILTER BY SEARCH ---
  const filteredDocuments = useMemo(() => {
    // Siguraduhin na may laman ang office at gawing uppercase para pantay ang comparison
    const myOffice = user.office?.toUpperCase();
    
    let tabFiltered = allDocs.filter(d => {
      const docOrigin = d.origin_office?.toUpperCase();
      // A Controlled Return (is_returning) is in_transit BACKWARD to the
      // previous office, not forward to the next one — otherwise a
      // returned document would surface under the wrong office's "To Scan"
      // tab (or none at all).
      const nextOffice = (d.is_returning ? d.route[d.route_position - 1] : d.route[d.route_position + 1])?.toUpperCase();

      if (activeTab === 'my-requests') {
        // Two cases belong here: documents THIS office originated (still
        // open, tracking them through to release), and documents that
        // arrived at THIS office and are sitting here awaiting action —
        // the case a mid-route office (not the origin) needs to see to
        // review/forward a document it just received. Without the second
        // clause, a non-origin office had no tab showing what's on its desk.
        const originatedByMe = docOrigin === myOffice || (!docOrigin && myOffice === 'BPLO');
        const onMyDeskNow = d.current_office?.toUpperCase() === myOffice && d.status === 'in_progress';
        return (originatedByMe || onMyDeskNow) && d.status !== 'released';
      }

      else if (activeTab === 'to-scan') {
        // Only documents actually scanned OUT by the sending office
        // (status === in_transit) are genuinely awaiting a receive scan
        // here — otherwise this tab showed documents before they'd even
        // been released for transfer.
        return d.status === 'in_transit' && nextOffice === myOffice;
      }
      
      else if (activeTab === 'released') {
        // Ipakita ang mga records na nare-release ko na (History)
        // Fallback: Kung walang origin_office (old data), ipakita sa BPLO tab kung status ay released
        return (docOrigin === myOffice || (!docOrigin && myOffice === 'BPLO')) && d.status === 'released';
      }
      return false;
    });

    if (!searchQuery) return tabFiltered;
    
    return tabFiltered.filter(d => 
      d.tracking_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.requested_by_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allDocs, activeTab, searchQuery, user.office]);

  const executeRelease = async () => {
    try {
      await api.patch(`/documents/${confirmReleaseId}/release/`);
      showToast("Document Released successfully!", "success");
      setConfirmReleaseId(null);
      loadDocs();
    } catch (err) {
      showToast("Error releasing document", "error");
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteDocument(deleteTarget.id);
      showToast(`${deleteTarget.tracking_number} deleted.`, 'success');
      setDeleteTarget(null);
      loadDocs();
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to delete document request.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-2">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{user.office} Portal</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Manage, scan, and release office documents.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-100 dark:shadow-none transition-all">
          + New Request
        </button>
      </div>

      {/* SEARCH AND TABS BAR */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-8">
        {/* TABS */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full md:w-fit">
          {['my-requests', 'to-scan', 'released'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === tab ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {tab.replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* SEARCH BAR */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="Search tracking # or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
          />
          <span className="absolute right-4 top-3 opacity-30 text-xs">🔍</span>
        </div>
      </div>

      <div className="mb-6">
        <StatusLegend />
      </div>

      {/* CONTENT */}
      {loading ? (
        <p className="text-center py-10 text-slate-400 dark:text-slate-500 animate-pulse font-bold">Loading document queue...</p>
      ) : filteredDocuments.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-\[2rem\] p-16 text-center">
          <p className="text-slate-400 dark:text-slate-500 font-bold">No documents found in this view.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDocuments.map((doc) => (
            <div key={doc.id} onClick={() => setSelectedId(doc.id)} className="cursor-pointer bg-white dark:bg-slate-900 rounded-\[1.5rem\] p-6 shadow-sm border border-slate-100 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-xl dark:hover:shadow-none transition-all group relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-lg uppercase tracking-widest">{doc.tracking_number}</span>
                <div className="flex items-center gap-2">
                  <DocumentStatusBadge doc={doc} />
                  {canDeleteDocument(doc, user) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(doc); }}
                      title="Delete document request"
                      className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 p-1 rounded-lg transition-colors"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <h3 className="font-black text-slate-900 dark:text-slate-100 text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-tight mb-1">{doc.document_type_name}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Requester: <span className="font-bold text-slate-700 dark:text-slate-300">{doc.requested_by_name}</span></p>

              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <StepStatusPill statuses={doc.step_statuses} />
                  <NearDueWarningBadge statuses={doc.step_statuses} />
                </div>
                {doc.current_handler?.employee_id && (
                  <span className="font-mono text-[10px] font-bold text-blue-600">{doc.current_handler.employee_id}</span>
                )}
              </div>

              <div className="border-t border-slate-50 dark:border-slate-800 pt-4 mt-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-widest">Current Desk</span>
                  <span className="text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-500/10 px-2 py-1 rounded-md">{doc.current_office}</span>
                </div>
                {doc.dwell_display && (
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-widest">Dwell Time</span>
                    <span className="text-xs font-black text-amber-700 dark:text-amber-400">{doc.dwell_display}</span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{new Date(doc.updated_at).toLocaleDateString()}</span>

                  {activeTab === 'my-requests' && doc.status === 'completed' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmReleaseId(doc.id); }}
                      className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-black px-4 py-2 rounded-xl shadow-lg shadow-green-100 dark:shadow-none transition-all uppercase"
                    >
                      Release to Citizen
                    </button>
                  )}
                  {activeTab === 'to-scan' && (
                    <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-wider animate-pulse">
                      <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                      Needs Scan
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODALS */}
      {selectedId && (
        <DocumentFormModal
          documentId={selectedId}
          onClose={() => setSelectedId(null)}
          onManage={() => { setManageId(selectedId); setSelectedId(null); }}
        />
      )}
      {manageId && (
        <DocumentDetailModal documentId={manageId} onClose={() => setManageId(null)} onUpdated={loadDocs} />
      )}
      {showModal && <NewRequestModal onClose={() => setShowModal(false)} onCreated={loadDocs} />}
      {confirmReleaseId && (
        <ConfirmModal
          title="Confirm Release"
          message="Is the physical document ready and the citizen present for collection?"
          confirmLabel="Yes, Release Now"
          confirmColor="bg-green-600 hover:bg-green-700"
          onCancel={() => setConfirmReleaseId(null)}
          onConfirm={executeRelease}
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