import { useState, useEffect } from 'react';
import { fetchDocumentDetail } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import DocumentStatusBadge from './DocumentStatusBadge';
import OfficialDocumentPanel from '../documents/OfficialDocumentPanel';
import DocumentGenerateModal from '../documents/DocumentGenerateModal';
import { PrinterIcon, CheckCircle2Icon } from '../Icons';

// Same "print just this one element" technique as the other printables.
const PRINT_STYLES = `
  @page { size: A4; margin: 15mm; }
  @media print {
    body * { visibility: hidden; }
    .doc-view-printable, .doc-view-printable * { visibility: visible; }
    .doc-view-printable { position: absolute; top: 0; left: 0; width: 100%; margin: 0; box-shadow: none; border: none; }
    .doc-view-no-print { display: none !important; }
  }
`;

const HIDDEN_FORM_KEYS = new Set(['date']);

function humanizeKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Read-only "official record" viewer — opened by clicking a row in the main
 * document table. Shows the letterhead/applicant details like
 * PrintableDocumentForm, but the routing section here is the REAL office
 * routing & handler history (DocumentLog entries: who actually acted, their
 * Unique User ID, time spent per office, notes) rather than a blank
 * checklist to fill out by hand. Staff can jump to the interactive
 * status-transition modal via onManage without leaving this view first.
 *
 * Also reused as-is for the citizen "My Documents" history page: pass
 * fetchDetail={fetchMyDocumentDetail} (own-documents-only endpoint) and omit
 * onManage, so citizens get the identical print/download record with no
 * edit access — editing stays staff-only via DocumentDetailModal.
 */
export default function DocumentFormModal({ documentId, onClose, onManage, fetchDetail = fetchDocumentDetail }) {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'employee';
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [officialFileVersion, setOfficialFileVersion] = useState(0);

  const load = () => {
    setLoading(true);
    fetchDetail(documentId)
      .then((res) => setDoc(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [documentId, fetchDetail]);

  const qrSrc = doc?.qr_code
    ? (doc.qr_code.startsWith('http') ? doc.qr_code : `http://127.0.0.1:8000${doc.qr_code}`)
    : null;

  const scopeLabel = doc?.document_type_scope === 'internal' ? 'INTERNAL' : 'EXTERNAL';
  const formEntries = Object.entries(doc?.form_data || {}).filter(
    ([key, value]) => !HIDDEN_FORM_KEYS.has(key) && value
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <style>{PRINT_STYLES}</style>

      {/* max-h + flex-col caps the modal's total height and puts scrolling
          on the body only — the header stays put, and staff never has to
          zoom the browser out to reach the header/actions on a normal
          laptop screen no matter how long the routing history or how tall
          the embedded PDF preview gets. */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] modal-pop-in flex flex-col overflow-hidden">
        <div className="doc-view-no-print flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Official Document Record</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl">×</button>
        </div>

        {loading || !doc ? (
          <p className="text-slate-400 dark:text-slate-500 text-center py-16">Loading…</p>
        ) : (
          <>
            {/* bg-white here is deliberate and NOT theme-dependent: this
                region (doc-view-printable) renders the official letterhead
                record exactly as it will print, and should always look like
                a sheet of paper regardless of the app's dark/light mode. */}
            <div className="doc-view-printable bg-white flex-1 overflow-y-auto min-h-0 p-6 sm:p-8">
              {/* Letterhead */}
              <div className="text-center border-b-2 border-slate-800 pb-4">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Republic of the Philippines</p>
                <p className="text-xs text-slate-600">Province of Quezon</p>
                <p className="text-sm font-bold text-slate-900 mt-1">MUNICIPALITY OF SARIAYA</p>
                <p className="text-sm font-bold text-slate-900">Office of the Municipal Administrator</p>
              </div>

              <div className="flex items-start justify-between mt-6 gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-black text-slate-900 uppercase tracking-wide break-words">
                    Official Document Request Form
                  </h1>
                  <p className="font-mono font-bold text-blue-700 mt-1 break-all">{doc.tracking_number}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="inline-block text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-slate-800 text-white">
                      {scopeLabel}
                    </span>
                    <DocumentStatusBadge doc={doc} />
                  </div>
                </div>
                {qrSrc && (
                  <img src={qrSrc} alt="QR Code" className="w-24 h-24 bg-white p-1 border border-slate-200 rounded-lg shrink-0" />
                )}
              </div>

              {/* Two-column on desktop: the full record on the left, a
                  quick-glance summary on the right — collapses to one
                  column (summary flows after the record) on narrower
                  screens. The summary is screen-only (doc-view-no-print) —
                  everything it restates is already in the printable record
                  to its left, so print output is unaffected. */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 min-w-0">
                <div className="lg:col-span-2 space-y-6 min-w-0">
                  {/* Applicant / request details */}
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 sm:p-5 min-w-0">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                      Request Details
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="border-b border-slate-200/70">
                            <td className="py-1.5 pr-4 text-slate-500 w-1/3 align-top">Document Type</td>
                            <td className="py-1.5 font-semibold text-slate-900 break-words">{doc.document_type_name}</td>
                          </tr>
                          <tr className="border-b border-slate-200/70">
                            <td className="py-1.5 pr-4 text-slate-500 align-top">Date Submitted</td>
                            <td className="py-1.5 font-semibold text-slate-900">
                              {new Date(doc.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-200/70">
                            <td className="py-1.5 pr-4 text-slate-500 align-top">Requested By</td>
                            <td className="py-1.5 font-semibold text-slate-900 break-words">{doc.requested_by_name}</td>
                          </tr>
                          {!doc.requested_by && doc.guest_email && (
                            <tr className="border-b border-slate-200/70">
                              <td className="py-1.5 pr-4 text-slate-500 align-top">Contact Email</td>
                              <td className="py-1.5 font-semibold text-slate-900 break-all">{doc.guest_email}</td>
                            </tr>
                          )}
                          {formEntries.map(([key, value]) => (
                            <tr key={key} className="border-b border-slate-200/70">
                              <td className="py-1.5 pr-4 text-slate-500 align-top">{humanizeKey(key)}</td>
                              <td className="py-1.5 font-semibold text-slate-900 break-words">{String(value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Complete office routing & handler history — the real audit trail.
                      Internally scrollable once it's long, rather than pushing
                      everything below it further down the page. */}
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 sm:p-5 min-w-0">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                      Office Routing &amp; Handler History
                    </p>
                    {doc.logs.length === 0 ? (
                      <p className="text-sm text-slate-400">No activity recorded yet.</p>
                    ) : (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="max-h-72 overflow-y-auto overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-100 sticky top-0">
                              <tr>
                                <th className="text-left px-3 py-2 text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">Action</th>
                                <th className="text-left px-3 py-2 text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">Office</th>
                                <th className="text-left px-3 py-2 text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">Handled By</th>
                                <th className="text-left px-3 py-2 text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">Duration</th>
                                <th className="text-left px-3 py-2 text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">Timestamp</th>
                                <th className="text-left px-3 py-2 text-[10px] font-black text-slate-400 uppercase">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {doc.logs.map((log) => (
                                <tr key={log.id} className="border-t border-slate-100 align-top bg-white">
                                  <td className="px-3 py-2 font-bold text-slate-700 capitalize whitespace-nowrap">{log.action.replace(/_/g, ' ')}</td>
                                  <td className="px-3 py-2 text-slate-800 break-words">{log.office?.name || '—'}</td>
                                  <td className="px-3 py-2">
                                    {log.acted_by ? (
                                      <div>
                                        <p className="font-semibold text-slate-800 break-words">{log.acted_by.full_name}</p>
                                        <p className="font-mono text-[10px] font-bold text-blue-600">
                                          {log.acted_by.employee_id || '—'}
                                        </p>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">System</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{log.duration_display || '—'}</td>
                                  <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                                  <td className="px-3 py-2 text-slate-600 text-xs break-words max-w-[16rem]">
                                    {log.notes || '—'}
                                    {log.qr_verified && (
                                      <span className="ml-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase text-green-700 whitespace-nowrap">
                                        <CheckCircle2Icon className="w-3 h-3" /> QR Verified
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* The REAL official document file. Only once Released
                      for citizens/guests; staff can preview/fill it anytime. */}
                  {(isStaff || doc.status === 'released') && doc.has_official_file && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 sm:p-5 min-w-0">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                          Official Document
                        </p>
                        {isStaff && (
                          <button
                            onClick={() => setShowGenerate(true)}
                            className="doc-view-no-print text-xs font-bold text-blue-600 hover:text-blue-800"
                          >
                            Fill / Generate Document
                          </button>
                        )}
                      </div>
                      <OfficialDocumentPanel key={officialFileVersion} documentId={doc.id} />
                      {isStaff && doc.status !== 'released' && (
                        <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest mt-2">
                          Preview only — not visible to the citizen until this document is Released.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Quick-glance summary — screen only, everything here is
                    already in the printable record to the left. */}
                <div className="doc-view-no-print space-y-4 min-w-0">
                  <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                      At a Glance
                    </p>
                    <dl className="space-y-2.5 text-sm">
                      <div>
                        <dt className="text-[10px] font-bold text-slate-400 uppercase">Tracking Number</dt>
                        <dd className="font-mono font-bold text-blue-700 break-all">{doc.tracking_number}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold text-slate-400 uppercase">Document Type</dt>
                        <dd className="font-semibold text-slate-900 break-words">{doc.document_type_name}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold text-slate-400 uppercase">Status</dt>
                        <dd><DocumentStatusBadge doc={doc} /></dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold text-slate-400 uppercase">Requested By</dt>
                        <dd className="font-semibold text-slate-900 break-words">{doc.requested_by_name}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold text-slate-400 uppercase">Current Office</dt>
                        <dd className="font-semibold text-slate-900 break-words">{doc.current_office}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 mt-8 text-center">
                Generated by the Sariaya Document Tracking System. Track this request anytime at /track/{doc.tracking_number}
              </p>
            </div>

            <div className="doc-view-no-print flex flex-wrap gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              {onManage && (
                <button
                  onClick={onManage}
                  className="flex-1 min-w-[10rem] bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white font-bold py-2.5 rounded-xl transition-colors"
                >
                  Manage / Update Status
                </button>
              )}
              <button
                onClick={() => window.print()}
                className="flex-1 min-w-[10rem] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition-colors"
              >
                <PrinterIcon className="w-4 h-4" /> Print / Download for Client
              </button>
              <button
                onClick={onClose}
                className="flex-1 min-w-[10rem] py-2.5 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>

      {showGenerate && doc && (
        <DocumentGenerateModal
          documentId={doc.id}
          documentTypeId={doc.document_type}
          onClose={() => setShowGenerate(false)}
          onGenerated={() => setOfficialFileVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}
