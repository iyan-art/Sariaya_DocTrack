import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { API_BASE_URL, fetchPublicDocumentEvaluation, submitPublicDocumentEvaluation } from '../api/axios';
import DocumentEvaluationModal from '../components/citizen/DocumentEvaluationModal';
import DocumentTrackingTimeline from '../components/DocumentTrackingTimeline';
import { MapPinIcon, PrinterIcon, StarIcon } from '../components/Icons';

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// Same "print just this one element" technique used by the admin printables
// (PrintableDocumentForm, DocumentFormModal) — lets the citizen print this
// page or use their browser's "Save as PDF" option to download it.
const PRINT_STYLES = `
  @page { size: A4; margin: 15mm; }
  @media print {
    body * { visibility: hidden; }
    .track-printable, .track-printable * { visibility: visible; }
    .track-printable {
      position: absolute; top: 0; left: 0; width: 100%; margin: 0;
      box-shadow: none; border: none; border-radius: 0;
      max-height: none !important; display: block !important;
    }
    /* On screen this scrolls independently inside a capped-height card;
       printing needs the FULL history, not just whatever's currently
       scrolled into view. */
    .track-scroll-body { overflow: visible !important; max-height: none !important; }
    .track-no-print { display: none !important; }
  }
`;

export default function PublicTrack() {
  const { trackingNumber } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    // We use the tracking number from the URL
    api.get(`/documents/track/${trackingNumber}/`)
      .then(res => {
        setDoc(res.data);
      })
      .catch(err => {
        console.error("Tracking Error:", err.response);
        setDoc(null);
        // 403 = a citizen/guest hit an INTERNAL document's tracking URL —
        // show the server's fixed refusal message instead of a generic
        // "not found", so it's clear the document exists but is restricted.
        setErrorMessage(err.response?.data?.detail || '');
      })
      .finally(() => setLoading(false));
  }, [trackingNumber]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (!doc) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          {errorMessage ? (
            <>
              <p className="text-4xl mb-3">🔒</p>
              <p className="font-semibold text-slate-800">{errorMessage}</p>
            </>
          ) : (
            <>
              <p className="text-4xl mb-3">⚠️</p>
              <p className="font-semibold text-slate-800">
                Your Document tracking number does not exist or Wrong Document Tracking, Please Try Again
              </p>
            </>
          )}
          <button
            onClick={() => navigate('/')}
            className="mt-6 bg-slate-900 hover:bg-black text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // The most recent real event across both history sources — used for
  // "Last Updated" under Current Status. Falls back to created_at for a
  // brand-new request with no stage/activity rows yet.
  const allTimestamps = [
    ...(doc.stage_history || []).map((h) => h.timestamp),
    ...(doc.activity_log || []).map((a) => a.timestamp),
  ];
  const lastUpdated = allTimestamps.length > 0
    ? allTimestamps.reduce((latest, t) => (new Date(t) > new Date(latest) ? t : latest))
    : doc.created_at;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8 flex items-start sm:items-center justify-center">
      <style>{PRINT_STYLES}</style>

      {/* max-h + flex-col caps the panel so it never forces the whole
          browser page to scroll for a long activity history — only the
          body scrolls, while the header (title + tracking number + close
          X) stays fixed in place above it, same pattern used for every
          modal/panel elsewhere in this app. */}
      <div className="max-w-xl w-full max-h-[92vh] bg-white rounded-3xl shadow-xl overflow-hidden track-printable flex flex-col">
        {/* Header — shrink-0 so it never scrolls away */}
        <div className="bg-blue-600 p-8 text-white shrink-0 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">Document Tracking</p>
            <h1 className="text-3xl font-extrabold break-words">{doc.document_type_name}</h1>
            <p className="font-mono text-sm mt-2 opacity-90 break-all">{doc.tracking_number}</p>
          </div>
          <button
            onClick={() => navigate('/')}
            aria-label="Close"
            className="track-no-print text-white/80 hover:text-white text-2xl leading-none shrink-0 -mt-1"
          >
            ×
          </button>
        </div>

        <div className="track-scroll-body flex-1 overflow-y-auto p-8 min-h-0">
           {/* Print / download this record */}
           <div className="track-no-print flex justify-end mb-6">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl transition-colors"
              >
                <PrinterIcon className="w-4 h-4" /> Print / Download
              </button>
           </div>

           {/* Current location — where the physical document actually is right
               now (Document.current_office/current_handler). Reflects the
               latest release/receive scan automatically, since it's
               re-fetched fresh on every page load. */}
           <div className="mb-6">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Current Location</h2>
              <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                 <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white shrink-0">
                   <MapPinIcon className="w-5 h-5" />
                 </div>
                 <div className="min-w-0">
                    <p className="font-bold text-blue-900 text-lg break-words">{doc.current_location?.office_name}</p>
                    {doc.current_location?.office_floor && (
                      <p className="text-sm text-blue-800/80">{doc.current_location.office_floor}</p>
                    )}
                    {doc.current_location?.handled_by && (
                      <p className="text-xs text-blue-700/70 mt-1 break-words">
                        Currently handled by <span className="font-semibold">{doc.current_location.handled_by}</span>
                      </p>
                    )}
                 </div>
              </div>
           </div>

           {/* Current status — one clear line derived from real data, not a
               position within a predefined list of every possible status. */}
           <div className="mb-8">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2">Current Status</h2>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                <p className="font-bold text-slate-900 text-lg break-words">{doc.processing_stage_label}</p>
              </div>
              <p className="text-xs text-slate-400 mt-1">Last updated: {formatDateTime(lastUpdated)}</p>
           </div>

           {/* Activity — one merged, chronological, data-driven timeline
               (see DocumentTrackingTimeline) combining the narrative
               processing-stage trail with the physical office hand-off
               trail. Only real events appear here; nothing is shown just
               because a workflow could eventually reach that stage. */}
           <div className="mb-2">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Activity</h2>
              <DocumentTrackingTimeline stageHistory={doc.stage_history} activityLog={doc.activity_log} />
           </div>

           {/* The REAL official document file — no login needed, only once Released */}
           {doc.processing_stage === 'completed' && doc.has_official_file && (
             <div className="track-no-print mt-10 pt-8 border-t border-slate-100">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Official Document</h2>
                <iframe
                  src={`${API_BASE_URL}/documents/track/${doc.tracking_number}/official-file/`}
                  title="Official Document"
                  className="w-full h-[70vh] rounded-xl border border-slate-200"
                />
                <a
                  href={`${API_BASE_URL}/documents/track/${doc.tracking_number}/official-file/`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-800"
                >
                  <PrinterIcon className="w-4 h-4" /> Open in new tab to print / save
                </a>
             </div>
           )}

           {/* Rate your experience — no account needed, works straight off the tracking number */}
           {doc.processing_stage === 'completed' && (
             <div className="track-no-print mt-10 pt-8 border-t border-slate-100 text-center">
                <StarIcon className="w-6 h-6 text-amber-400 mx-auto mb-2" filled />
                <p className="text-sm font-bold text-slate-800">This document has been released to you.</p>
                <p className="text-xs text-slate-500 mt-1 mb-4">
                  Rate each office that handled your request — no account needed.
                </p>
                <button
                  onClick={() => setEvaluating(true)}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-2xl transition-all"
                >
                  Rate Your Experience
                </button>
             </div>
           )}

           {/* Login Redirect */}
           <div className="track-no-print mt-8 pt-8 border-t border-slate-100 text-center">
              <p className="text-sm text-slate-500 mb-4 font-medium">Want to save this to your account and get alerts?</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-black transition-all"
              >
                Citizen Login / Sign-Up
              </button>
           </div>
        </div>
      </div>

      {evaluating && (
        <DocumentEvaluationModal
          subject={doc.tracking_number}
          fetchEvaluation={fetchPublicDocumentEvaluation}
          submitEvaluation={submitPublicDocumentEvaluation}
          onClose={() => setEvaluating(false)}
        />
      )}
    </div>
  );
}