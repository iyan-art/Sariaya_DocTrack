// Sariaya DocTrack service worker: offline app, background sync wake-up.
// Registered by src/serviceWorkerRegistration.js (production builds only).
//
// At build time, vite.config.js fills PRECACHE with every file of the build
// (the app's JS and CSS, index.html, icons) and BUILD_ID with a hash of
// them, so the whole app is stored on install and opens with no internet
// connection, and each deploy replaces the previous copy.

const PRECACHE = self.__PRECACHE__ || [];
const BUILD_ID = self.__BUILD_ID__ || 'dev';
const CACHE_NAME = `sariaya-doctrack-${BUILD_ID}`;
const APP_SHELL = ['/', '/manifest.json', '/favicon.ico'];
// Stored copies match by URL alone. Without this, a server's "Vary: Origin"
// makes the app's own module script (requested with an Origin header) miss
// the copy stored at install (requested without one), and the app would not
// open offline.
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll([...new Set([...APP_SHELL, ...PRECACHE])])).catch(() => {})
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    // API data always goes straight to the network and is never stored, so an
    // admin's change shows up everywhere and no citizen data stays on a shared PC.
    // (Scans made offline are queued by the app itself, in IndexedDB.)
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

    // Page navigations: network-first, so staff and citizens always get the
    // latest deployed build while online, falling back to the stored app
    // (any route is the same single-page app) when there's no connection.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.status === 200) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => caches.match(request, MATCH).then((cached) => cached || caches.match('/', MATCH)))
        );
        return;
    }

    // Everything else same-origin (built JS/CSS, icons, images): cache-first.
    event.respondWith(
        caches.match(request, MATCH).then((cached) => {
            if (cached) return cached;
            return fetch(request)
                .then((response) => {
                    if (response.status === 200) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);
        })
    );
});

// Background Sync: the browser fires this once the device is back online,
// even if the app's tab is in the background. Uploading needs the signed-in
// session, which only the open app has, so this tells the open app to
// upload its offline queue (context/OfflineSyncContext.jsx).
self.addEventListener('sync', (event) => {
    if (event.tag !== 'sync-offline-queue') return;
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clients) => {
            clients.forEach((client) => client.postMessage({ type: 'sync-offline-queue' }));
        })
    );
});
