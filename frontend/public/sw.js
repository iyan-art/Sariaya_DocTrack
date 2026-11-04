// Sariaya DocTrack service worker – basic offline app-shell caching.
// Registered by src/serviceWorkerRegistration.js (production builds only).

const CACHE_NAME = 'sariaya-doctrack-v3';
const APP_SHELL = ['/', '/manifest.json', '/favicon.ico'];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
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
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

    // Page navigations: network-first, so a citizen always gets the latest
    // deployed build while online – falling back to whatever app shell is
    // cached (and finally "/") when there's no connection at all.
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
                .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
        );
        return;
    }

    // Everything else same-origin (built JS/CSS, icons, images): cache-first,
    // populating the cache the first time each asset is fetched, so the app
    // shell keeps working after one visit even with no connection.
    event.respondWith(
        caches.match(request).then((cached) => {
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
