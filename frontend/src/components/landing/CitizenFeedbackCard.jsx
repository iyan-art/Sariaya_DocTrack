import { useState } from 'react';
import { fetchPublicDocumentEvaluation, submitPublicDocumentEvaluation } from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { extractErrorMessage } from '../../utils/apiError';
import DocumentEvaluationModal from '../citizen/DocumentEvaluationModal';
import ScanTrackingModal from '../ScanTrackingModal';
import { extractTrackingNumber } from '../../utils/trackingNumber';
import { StarIcon, CameraIcon } from '../Icons';

/**
 * Citizen Feedback card — reuses the existing per-office evaluation
 * workflow (DocumentEvaluationModal, already shared with the public Track
 * page) rather than a new survey system. Accepts a tracking number either
 * typed manually or scanned via the same Html5QrcodeScanner-backed modal
 * used elsewhere on this page.
 */
export default function CitizenFeedbackCard() {
  const { showToast } = useToast();
  const [trackingNumber, setTrackingNumber] = useState('');
  const [evaluating, setEvaluating] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [checking, setChecking] = useState(false);

  // Typed, pasted (even the whole QR link) or scanned, the number is checked
  // first, so a wrong or not-yet-released one gets a clear message instead
  // of an empty form.
  const openEvaluation = async (raw) => {
    const number = extractTrackingNumber(raw);
    if (!number) {
      showToast('Could not read a tracking number from that code.', 'error');
      return;
    }
    setChecking(true);
    try {
      await fetchPublicDocumentEvaluation(number);
      setEvaluating(number);
    } catch (err) {
      showToast(extractErrorMessage(err, "We couldn't find a released document for that tracking number."), 'error');
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    openEvaluation(trackingNumber);
  };

  const handleScanned = (raw) => {
    setScanning(false);
    openEvaluation(raw);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-2 text-amber-600">
        <StarIcon className="w-5 h-5" filled />
        <span className="text-xs font-black uppercase tracking-widest">Citizen Feedback</span>
      </div>
      <h3 className="text-lg font-bold text-slate-900 mt-2">Help us improve our services</h3>
      <p className="text-sm text-slate-500 mt-1">
        Already received your document? Rate every office that handled it — no account needed.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          required
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="Tracking number"
          className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={checking}
          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold text-sm rounded-lg px-4 py-2.5 transition-colors whitespace-nowrap"
        >
          {checking ? 'Checking…' : 'Give Feedback'}
        </button>
      </form>

      <button
        onClick={() => setScanning(true)}
        disabled={checking}
        className="mt-2 flex items-center justify-center gap-2 w-full text-xs font-bold text-slate-500 hover:text-slate-700 disabled:opacity-60 py-2"
      >
        <CameraIcon className="w-3.5 h-3.5" /> {checking ? 'Checking…' : 'or scan the QR code on your document'}
      </button>

      {scanning && (
        <ScanTrackingModal
          title="Scan QR Code for Feedback"
          onScanned={handleScanned}
          onClose={() => setScanning(false)}
        />
      )}

      {evaluating && (
        <DocumentEvaluationModal
          subject={evaluating}
          fetchEvaluation={fetchPublicDocumentEvaluation}
          submitEvaluation={submitPublicDocumentEvaluation}
          onClose={() => setEvaluating(null)}
        />
      )}
    </div>
  );
}
