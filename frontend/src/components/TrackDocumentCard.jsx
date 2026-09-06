import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { lookupDocumentByTracking } from '../api/axios';
import ScanTrackingModal from './ScanTrackingModal';
import TrackingNotFoundModal from './TrackingNotFoundModal';
import { CameraIcon, MapPinIcon } from './Icons';

/**
 * Landing page "Track Your Document" card — the no-account entry point.
 * Both methods (scan or manual entry) resolve to a tracking number and go
 * through the same goTrack() pre-flight lookup: if it resolves, navigate to
 * the tracking page; if it doesn't, show an explicit not-found warning
 * right here instead of silently navigating to a broken page.
 */
export default function TrackDocumentCard() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [scanning, setScanning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const goTrack = async (number) => {
    const trimmed = number.trim();
    if (!trimmed) return;

    setChecking(true);
    try {
      await lookupDocumentByTracking(trimmed);
      navigate(`/track/${trimmed}`);
    } catch {
      setNotFound(true);
    } finally {
      setChecking(false);
    }
  };

  const handleTryAgain = () => {
    setNotFound(false);
    setTrackingNumber('');
    inputRef.current?.focus();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-2 text-blue-600">
        <MapPinIcon className="w-5 h-5" />
        <span className="text-xs font-black uppercase tracking-widest">Track Your Document</span>
      </div>
      <h3 className="text-xl font-bold text-slate-900 mt-2">Where's my request?</h3>
      <p className="text-sm text-slate-500 mt-1">
        Scan or enter your tracking number — no account needed to check your request's status.
      </p>

      <button
        onClick={() => setScanning(true)}
        disabled={checking}
        className="w-full mt-6 flex items-center justify-center gap-2 bg-slate-900 hover:bg-black disabled:opacity-60 text-white font-bold rounded-xl py-3.5 transition-colors"
      >
        <CameraIcon className="w-4 h-4" /> Scan Tracking Number
      </button>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-slate-100" />
        <span className="text-xs font-bold text-slate-400 uppercase">or</span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); goTrack(trackingNumber); }} className="flex flex-col sm:flex-row gap-3">
        <input
          ref={inputRef}
          type="text"
          required
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="e.g. DOC-2026-SRY-0001"
          className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={checking}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl px-6 py-3 transition-colors"
        >
          {checking ? 'Checking…' : 'Track'}
        </button>
      </form>

      {scanning && (
        <ScanTrackingModal
          onScanned={(number) => { setScanning(false); goTrack(number); }}
          onClose={() => setScanning(false)}
        />
      )}

      {notFound && (
        <TrackingNotFoundModal
          onCancel={() => setNotFound(false)}
          onRetry={handleTryAgain}
        />
      )}
    </div>
  );
}
