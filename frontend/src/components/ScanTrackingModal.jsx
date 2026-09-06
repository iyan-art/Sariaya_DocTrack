import { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { CameraIcon, ScanLineIcon } from './Icons';

// Mirrors qr_services.py::parse_qr_payload — a scanned code is either a
// full "https://.../track/<tracking_number>?..." URL or a bare tracking
// number typed/printed directly; either way we just want the last path
// segment (or the raw string if it isn't a URL at all).
function extractTrackingNumber(raw) {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Guest-facing QR scan modal — same Html5QrcodeScanner engine as
 * EmployeeQRScanner, but simpler: no auth-gated qrScanResolve() call, since
 * a guest doesn't need staff scan context. Just decodes the tracking number
 * client-side and hands it back to the parent via onScanned(), which
 * decides what to do with it. Shared by two entry points on the Landing
 * page: "Track Your Document" (navigates straight to /track/<number>) and
 * "Citizen Feedback" (opens the evaluation form for that tracking number) —
 * `title` lets each caller relabel the header appropriately.
 */
export default function ScanTrackingModal({ onScanned, onClose, title = 'Scan Tracking Number' }) {
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner('landing-qr-reader', {
      fps: 10,
      qrbox: { width: 250, height: 250 },
    });

    scanner.render(onScanSuccess, onScanError);

    async function onScanSuccess(decodedText) {
      await scanner.clear();
      onScanned(extractTrackingNumber(decodedText));
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md modal-pop-in overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ScanLineIcon className="w-5 h-5 text-blue-600" /> {title}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-500 text-center -mb-1">
            Position the QR code inside the frame.<br />
            <span className="text-slate-400">Ilagay ang QR code sa loob ng frame.</span>
          </p>
          <div id="landing-qr-reader" className="overflow-hidden rounded-2xl bg-slate-50 min-h-[280px]"></div>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 text-sm font-medium py-2"
          >
            <CameraIcon className="w-4 h-4" /> Restart camera
          </button>
        </div>
      </div>
    </div>
  );
}
