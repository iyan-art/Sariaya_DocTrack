import { useState, useEffect, useCallback } from 'react';
import { DownloadIcon, SmartphoneIcon, ShareIcon } from './Icons';

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

// True once the app is actually running as an installed PWA — Chrome/Edge/
// Android expose this via the 'display-mode' media query; iOS Safari has
// its own long-standing `navigator.standalone` flag instead.
function isRunningStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

const VARIANT_STYLES = {
  // For light backgrounds (the Login/Register card, citizen portal).
  solid: 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20',
  // For the dark, video Hero section — matches its existing "Track My
  // Document" frosted-glass button instead of clashing with the already-blue
  // "Log In / Sign In" CTA next to it.
  frosted: 'bg-white/10 hover:bg-white/20 border border-white/30 text-white backdrop-blur-sm',
  // Small inline affordance for tight spaces.
  compact: 'bg-blue-50 hover:bg-blue-100 text-blue-700',
};

/**
 * "Install Sariaya DocTrack" button (InstallPWAButton) — prompts the native
 * browser install flow on Chrome/Edge/Android via the captured
 * `beforeinstallprompt` event, or opens an "Add to Home Screen" instructions
 * modal on iOS Safari (which never fires that event at all).
 *
 * Renders nothing when there is no install path available: already running
 * as an installed app (standalone mode), already installed this session, or
 * a browser that supports neither route (e.g. desktop Firefox) — so this
 * never shows a button with nothing it can actually do.
 */
export default function InstallPWAButton({ variant = 'solid', showSubtext = true, className = '' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [standalone, setStandalone] = useState(true); // default true until checked, so nothing flashes
  const [ios, setIos] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);

  useEffect(() => {
    setStandalone(isRunningStandalone());
    setIos(isIosDevice());

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault(); // suppress the browser's own mini-infobar; we drive it ourselves
      setDeferredPrompt(event);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setDeferredPrompt(null); // a captured prompt can only be used once
      return;
    }
    if (ios) setShowIosModal(true);
  }, [deferredPrompt, ios]);

  if (standalone || installed) return null;
  if (!deferredPrompt && !ios) return null; // no install path this browser supports

  return (
    <>
      <div className={`flex flex-wrap items-center gap-3 ${className}`}>
        <button
          type="button"
          onClick={handleClick}
          className={`inline-flex items-center gap-2 font-bold transition-colors ${
            variant === 'compact' ? 'rounded-lg px-4 py-2 text-sm' : 'rounded-xl px-6 py-3.5'
          } ${VARIANT_STYLES[variant] || VARIANT_STYLES.solid}`}
        >
          <DownloadIcon className={variant === 'compact' ? 'w-4 h-4' : 'w-5 h-5'} />
          Install App
        </button>
        {showSubtext && (
          <p className={`text-sm ${variant === 'frosted' ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
            Install Sariaya DocTrack on your phone for faster access.
          </p>
        )}
      </div>

      {showIosModal && <IosInstallModal onClose={() => setShowIosModal(false)} />}
    </>
  );
}

function IosInstallModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overlay-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl dark:shadow-none w-full max-w-sm modal-pop-in overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <SmartphoneIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Install on iPhone/iPad
          </h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-xl">×</button>
        </div>

        <div className="p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
            Safari doesn't support one-tap install — add Sariaya DocTrack to your Home Screen in a few taps:
          </p>
          <ol className="space-y-4">
            <li className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
              <span className="flex items-center gap-1.5 flex-wrap">
                Tap the <ShareIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" /> <strong>Share</strong> button in Safari's toolbar.
              </span>
            </li>
            <li className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
              <span>Scroll down and tap <strong>"Add to Home Screen."</strong></span>
            </li>
            <li className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
              <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</span>
              <span>Tap <strong>"Add"</strong> in the top-right corner to confirm.</span>
            </li>
          </ol>

          <button
            onClick={onClose}
            className="mt-6 w-full bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white font-bold py-2.5 rounded-xl transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
