import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SCAN_CONFIG = { fps: 10, qrbox: { width: 250, height: 250 } };

function cameraErrorMessage(err) {
  const name = err?.name || '';
  const text = String(err?.message || err || '');
  if (name === 'NotAllowedError' || /permission|denied/i.test(text)) {
    return 'Camera access is blocked. Allow the camera for this site in your browser settings, then tap Restart camera.';
  }
  if (name === 'NotFoundError' || /not found|no camera|requested device/i.test(text)) {
    return 'No camera was found on this device.';
  }
  return 'The camera could not be started. Close other apps using it, then tap Restart camera.';
}

/**
 * Starts the camera inside the element with `elementId` and reads one QR
 * code. Opens the rear camera straight away on phones (facingMode
 * "environment"; a laptop falls back to its only camera) — no camera list or
 * "request permission" button in between. The browser itself still asks for
 * camera permission the first time. Stops the camera after a successful
 * read, and restarts whenever `restartKey` changes. Returns an error message
 * when the camera can't be used, else ''.
 */
export default function useRearCameraScanner(elementId, onDecoded, restartKey) {
  const [error, setError] = useState('');
  const handler = useRef(onDecoded);
  useEffect(() => { handler.current = onDecoded; });

  useEffect(() => {
    let scanner = null;
    let running = false;
    let done = false;

    const stop = () => (running ? scanner.stop().catch(() => {}) : Promise.resolve()).then(() => {
      running = false;
      try { scanner?.clear(); } catch { /* already cleared */ }
    });

    // Started a tick later, so a mount that is undone at once (React's
    // development double-mount, or leaving the page straight away) never
    // opens the camera only to pull the video out from under it.
    const timer = setTimeout(() => {
      scanner = new Html5Qrcode(elementId, { verbose: false });
      scanner
        .start({ facingMode: 'environment' }, SCAN_CONFIG, (decodedText) => {
          if (done) return;
          done = true;
          stop().then(() => handler.current(decodedText));
        }, () => { /* fires continuously while no code is in frame */ })
        .then(() => {
          running = true;
          setError('');
          if (done) stop();
        })
        .catch((err) => { if (!done) setError(cameraErrorMessage(err)); });
    }, 50);

    return () => {
      done = true;
      clearTimeout(timer);
      if (scanner) stop();
    };
  }, [elementId, restartKey]);

  return error;
}
