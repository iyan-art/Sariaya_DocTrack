import { useState } from 'react';
import EmployeeQRScanner from '../../components/admin/EmployeeQRScanner';
import QRTransferConfirmModal from '../../components/admin/QRTransferConfirmModal';
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
          <EmployeeQRScanner key={attempt} onResolved={handleResolved} onError={handleError} />
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
