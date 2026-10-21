import { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { qrScanResolve } from '../../api/axios';
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
export default function EmployeeQRScanner({ onResolved, onError }) {
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner('employee-qr-reader', {
      fps: 10,
      qrbox: { width: 250, height: 250 },
    });

    scanner.render(onScanSuccess, onScanError);

    async function onScanSuccess(decodedText) {
      await scanner.clear();
      setLoading(true);
      try {
        const res = await qrScanResolve(decodedText);
        onResolved(res.data, decodedText);
      } catch (err) {
        onError(err.response?.data?.detail || 'Could not read that QR code.');
      } finally {
        setLoading(false);
      }
    }

    function onScanError() {
      // Fires continuously while no code is in frame — ignore.
    }

    return () => {
      scanner.clear().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <div className="p-6 sm:p-8 space-y-5">
      <div className="relative group">
        <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-blue-600 rounded-tl-xl z-10"></div>
        <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-blue-600 rounded-tr-xl z-10"></div>
        <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-blue-600 rounded-bl-xl z-10"></div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-blue-600 rounded-br-xl z-10"></div>
        <div id="employee-qr-reader" className="overflow-hidden rounded-2xl bg-slate-50 dark:bg-slate-800 min-h-[320px]"></div>
      </div>

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
