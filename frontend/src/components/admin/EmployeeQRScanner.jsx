import { useState } from 'react';
import { qrScanResolve } from '../../api/axios';
import useRearCameraScanner from '../../utils/useRearCameraScanner';
import { CameraIcon, ScanLineIcon } from '../Icons';

/**
 * Camera-only scanning engine for the Staff PWA Portal. Reads a physical QR
 * tag, resolves it through the role-aware /documents/qr/scan/ endpoint (so
 * signature verification and the INTERNAL-document scope check happen
 * server-side before any detail reaches this screen), then hands the
 * resolved document + scan_context up to the parent — which is expected to
 * open the Receive/Return confirmation modal. This component never performs
 * a transfer itself; it only identifies what was scanned.
 */
export default function EmployeeQRScanner({ onResolved, onError, onOffline }) {
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const handleDecoded = async (decodedText) => {
    // No connection: the scan is saved on the device instead (OfflineScanModal).
    if (onOffline && !navigator.onLine) {
      onOffline(decodedText);
      return;
    }
    setLoading(true);
    try {
      const res = await qrScanResolve(decodedText);
      onResolved(res.data, decodedText);
    } catch (err) {
      if (onOffline && !err.response) onOffline(decodedText); // the server could not be reached
      else onError(err.response?.data?.detail || 'Could not read that QR code.');
    } finally {
      setLoading(false);
    }
  };
  // Opens the phone's rear camera directly — no camera picker in between.
  const cameraError = useRearCameraScanner('employee-qr-reader', handleDecoded, attempt);

  return (
    <div className="p-6 sm:p-8 space-y-5">
      <div className="relative group">
        <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-blue-600 rounded-tl-xl z-10"></div>
        <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-blue-600 rounded-tr-xl z-10"></div>
        <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-blue-600 rounded-bl-xl z-10"></div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-blue-600 rounded-br-xl z-10"></div>
        <div id="employee-qr-reader" className="overflow-hidden rounded-2xl bg-slate-50 dark:bg-slate-800 min-h-[320px]"></div>
      </div>

      {cameraError && (
        <p role="alert" className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {cameraError}
        </p>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-blue-100 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-4 py-3 text-blue-600 dark:text-blue-400 font-semibold">
          <ScanLineIcon className="w-5 h-5 animate-pulse" /> Resolving document…
        </div>
      )}

      <button
        type="button"
        onClick={() => setAttempt((a) => a + 1)}
        className="w-full flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm font-medium py-2"
      >
        <CameraIcon className="w-4 h-4" /> Restart camera
      </button>
    </div>
  );
}
