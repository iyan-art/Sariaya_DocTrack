import { useState } from 'react';
import { qrScanResolve } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import ScanTrackingModal from '../../components/ScanTrackingModal';
import PostScanSurveyModal from '../../components/citizen/PostScanSurveyModal';
import DocumentStatusBadge from '../../components/admin/DocumentStatusBadge';
import { ScanLineIcon, MapPinIcon, StarIcon, CheckCircle2Icon } from '../../components/Icons';

/**
 * Citizen QR scan screen (CitizenQRScanView). A logged-in citizen scans —
 * or types — their document's tracking number; the server resolves it to a
 * public status summary and, when it's one of THEIR OWN documents, tells us
 * whether the automated post-scan survey is still outstanding. If it is, we
 * surface it right here (and open it automatically the first time).
 */
export default function ScanDocument() {
  const { showToast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { document, post_scan_survey? }
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [surveyDone, setSurveyDone] = useState(false);

  const resolve = async (payload) => {
    const value = (payload || '').trim();
    if (!value) return;
    setLoading(true);
    setResult(null);
    setSurveyDone(false);
    try {
      const res = await qrScanResolve(value);
      setResult(res.data);
      const survey = res.data.post_scan_survey;
      if (survey && !survey.already_submitted) setSurveyOpen(true);
    } catch (err) {
      showToast(err.response?.data?.detail || 'That code did not match any document.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const doc = result?.document;
  const survey = result?.post_scan_survey;
  const surveyPending = survey && !survey.already_submitted && !surveyDone;

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
          <ScanLineIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Scan Your Document</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Check its status and answer a quick feedback survey.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm dark:shadow-none">
        <button
          onClick={() => setScanning(true)}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors"
        >
          <ScanLineIcon className="w-5 h-5" /> Scan QR Code
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">or type it</span>
          <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); resolve(manual); }}
          className="flex gap-2"
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Tracking number, e.g. QRT-AB12CD"
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 disabled:opacity-60 text-white font-bold px-4 rounded-lg text-sm transition-colors"
          >
            {loading ? '…' : 'Check'}
          </button>
        </form>
      </div>

      {doc && (
        <div className="mt-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm dark:shadow-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono font-bold text-blue-700 dark:text-blue-400">{doc.tracking_number}</p>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">{doc.document_type_name}</h2>
            </div>
            <DocumentStatusBadge doc={doc} />
          </div>

          {doc.current_location?.office_name && (
            <div className="flex items-center gap-2 mt-4 text-sm text-slate-600 dark:text-slate-400">
              <MapPinIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Currently at <span className="font-semibold text-slate-800 dark:text-slate-200">{doc.current_location.office_name}</span></span>
            </div>
          )}
          {doc.processing_stage_label && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{doc.processing_stage_label}</p>
          )}

          {survey && (
            <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
              {surveyPending ? (
                <>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <StarIcon className="w-4 h-4 text-amber-500" filled /> One quick survey is waiting
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">
                    Tell the Municipality of Sariaya about your experience with this request.
                  </p>
                  <button
                    onClick={() => setSurveyOpen(true)}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-xl transition-colors"
                  >
                    Answer the Survey
                  </button>
                </>
              ) : (
                <p className="text-sm text-green-700 dark:text-green-400 font-semibold flex items-center gap-2">
                  <CheckCircle2Icon className="w-4 h-4" /> You've already answered the survey for this document. Salamat!
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {scanning && (
        <ScanTrackingModal
          title="Scan Your Document"
          onClose={() => setScanning(false)}
          onScanned={(number) => {
            setScanning(false);
            setManual(number);
            resolve(number);
          }}
        />
      )}

      {surveyOpen && survey && (
        <PostScanSurveyModal
          documentId={survey.document_id}
          onClose={() => setSurveyOpen(false)}
          onSubmitted={() => setSurveyDone(true)}
        />
      )}
    </div>
  );
}
