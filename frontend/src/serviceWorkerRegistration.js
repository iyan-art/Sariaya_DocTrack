// Minimal, CRA-style service worker registration for offline app-shell
// caching (see public/sw.js). Only runs in production builds — during
// `vite dev` a live service worker makes HMR confusing to debug (stale
// cached chunks fighting the dev server's own module reloading), the same
// reason Create React App's equivalent file defaults to a no-op in
// development.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;

  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  };
  // This runs from a React effect, which is usually after the page's load
  // event has already fired; waiting for it then would never register.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

// Not called anywhere yet, but kept alongside register() — the standard
// escape hatch if a bad cached build ever needs to be cleared from a
// citizen's device without them knowing to clear site data manually.
export function unregisterServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}
