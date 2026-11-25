import { useState } from 'react';
import EmployeeQRScanner from '../../components/admin/EmployeeQRScanner';
import QRTransferConfirmModal from '../../components/admin/QRTransferConfirmModal';
import OfflineScanModal from '../../components/admin/OfflineScanModal';
import { useOfflineSync } from '../../context/OfflineSyncContext';
import { trackingNumberFromPayload } from '../../utils/offlineStore';
import DocumentStatusBadge from '../../components/admin/DocumentStatusBadge';
import { CameraIcon, CheckCircle2Icon, ScanLineIcon } from '../../components/Icons';

/**
 * Staff PWA Portal QR scanning screen. Scan-first: the camera resolves a
 * physical tag straight to the document's current state, then
 * QRTransferConfirmModal opens pre-filled with the suggested next action —
 * no action has to be picked before scanning, unlike the old flow.
 */
export default function QRScan() {
  const [scan, setScan] = useState(null); // { document, scanContext, rawPayload }
  const [outcome, setOutcome] = useState(null); // { ok: bool, message, document? }
  const [attempt, setAttempt] = useState(0);
  const [offlineScan, setOfflineScan] = useState(null); // { rawPayload, trackingNumber }
  const [typedCode, setTypedCode] = useState('');
  const offline = useOfflineSync();
  const isOffline = offline && !offline.online;

  const handleOffline = (rawPayload) => {
    const trackingNumber = trackingNumberFromPayload(rawPayload);
    if (!trackingNumber) {
      setOutcome({ ok: false, message: 'Could not read a tracking number from that QR code.' });
      return;
    }
    setOfflineScan({ rawPayload: rawPayload.trim(), trackingNumber });
  };

  const handleTypedCode = (event) => {
    event.preventDefault();
    const trackingNumber = trackingNumberFromPayload(typedCode);
    if (trackingNumber) setOfflineScan({ rawPayload: trackingNumber, trackingNumber });
  };

  const handleOfflineSaved = ({ trackingNumber, actionLabel }) => {
    setOfflineScan(null);
    setTypedCode('');
    setOutcome({ ok: true, queued: true, trackingNumber, actionLabel });
  };

  const handleResolved = (data, rawPayload) => {
    if (data.role !== 'staff') {
      setOutcome({ ok: false, message: 'This scanner is for staff use only.' });
      return;
    }
    setScan({ document: data.document, scanContext: data.scan_context, rawPayload });
  };

  const handleError = (message) => {
    setOutcome({ ok: false, message });
  };

  const handleConfirmed = (updatedDocument) => {
    setScan(null);
    setOutcome({ ok: true, document: updatedDocument });
  };

  const scanAgain = () => {
    setOutcome(null);
    setScan(null);
    setAttempt((a) => a + 1);
  };

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 dark:shadow-none">
            <ScanLineIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">QR Scanner</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Scan a document tag to review and confirm its next step.</p>
          </div>
        </div>
        {!outcome && !scan && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-[10px] font-bold uppercase tracking-widest animate-pulse">
            <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
            Live Camera
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-\[2rem\] shadow-2xl shadow-blue-900/5 dark:shadow-none border border-slate-100 dark:border-slate-800 overflow-hidden">
        {!outcome ? (
          <EmployeeQRScanner key={attempt} onResolved={handleResolved} onError={handleError} onOffline={handleOffline} />
        ) : outcome.queued ? (
          <div className="text-center p-8 sm:p-10 modal-pop-in">
            <div className="w-20 h-20 bg-orange-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-orange-200 dark:shadow-none">
              <CheckCircle2Icon className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">Saved Offline</h2>
            <p className="text-blue-600 dark:text-blue-400 font-mono font-bold mt-1 tracking-wider bg-blue-50 dark:bg-blue-500/10 inline-block px-3 py-1 rounded-lg">
              {outcome.trackingNumber}
            </p>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              {outcome.actionLabel}. It will be applied automatically when this device is back online.
              The connection badge at the top shows what is still waiting.
            </p>
            <button
              onClick={scanAgain}
              className="mt-10 w-full bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-slate-200 dark:shadow-none flex items-center justify-center gap-2"
            >
              <CameraIcon className="w-5 h-5" /> Scan Another
            </button>
          </div>
        ) : outcome.ok ? (
          <div className="text-center p-8 sm:p-10 modal-pop-in">
            <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-200 dark:shadow-none">
              <CheckCircle2Icon className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">Transfer Confirmed</h2>
            <p className="text-blue-600 dark:text-blue-400 font-mono font-bold mt-1 tracking-wider bg-blue-50 dark:bg-blue-500/10 inline-block px-3 py-1 rounded-lg">
              {outcome.document.tracking_number}
            </p>

            <div className="mt-8 p-6 bg-slate-50 dark:bg-slate-800/60 rounded-3xl text-left border border-slate-100 dark:border-slate-800">
              <div className="space-y-4">
                <div className="flex justify-between border-b border-slate-200/50 dark:border-slate-700/50 pb-2">
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-black tracking-widest">Document</span>
                  <span className="text-slate-900 dark:text-slate-100 font-bold text-sm">{outcome.document.document_type_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-black tracking-widest">Status</span>
                  <DocumentStatusBadge doc={outcome.document} />
                </div>
              </div>
            </div>

            <button
              onClick={scanAgain}
              className="mt-10 w-full bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-slate-200 dark:shadow-none flex items-center justify-center gap-2"
            >
              <CameraIcon className="w-5 h-5" /> Scan Another
            </button>
          </div>
        ) : (
          <div className="text-center p-8 sm:p-10 modal-pop-in">
            <div className="w-20 h-20 bg-red-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-200 dark:shadow-none">
              <span className="text-3xl font-black">!</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">Scan Failed</h2>
            <p className="text-red-600 dark:text-red-400 font-semibold mt-3 px-4">{outcome.message}</p>

            <button
              onClick={scanAgain}
              className="mt-10 w-full bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-slate-200 dark:shadow-none flex items-center justify-center gap-2"
            >
              <CameraIcon className="w-5 h-5" /> Try Again
            </button>
          </div>
        )}
      </div>

      {isOffline && !outcome && (
        <form onSubmit={handleTypedCode} className="mt-4 rounded-2xl border border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 p-4">
          <label htmlFor="offline-tracking" className="block text-sm font-semibold text-orange-800 dark:text-orange-300">
            Offline: QR tag won't scan? Type the tracking number.
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="offline-tracking"
              value={typedCode}
              onChange={(e) => setTypedCode(e.target.value)}
              placeholder="DOC-2026-SRY-0001-XXXX"
              autoComplete="off"
              className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" disabled={!typedCode.trim()} className="shrink-0 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-bold px-4">
              Continue
            </button>
          </div>
        </form>
      )}

      {offlineScan && (
        <OfflineScanModal
          rawPayload={offlineScan.rawPayload}
          trackingNumber={offlineScan.trackingNumber}
          onClose={() => { setOfflineScan(null); setAttempt((a) => a + 1); }}
          onSaved={handleOfflineSaved}
        />
      )}

      {scan && (
        <QRTransferConfirmModal
          document={scan.document}
          scanContext={scan.scanContext}
          rawPayload={scan.rawPayload}
          onClose={() => setScan(null)}
          onConfirmed={handleConfirmed}
        />
      )}
    </div>
  );
}
