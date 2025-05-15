// sw.js - Service Worker for Daily Supplement & Medication Checklist (Enhanced)

const CACHE_NAME = 'daily-checklist-cache-v1.7'; // Updated version
const PRECACHE_ASSETS = [
    '/', // Alias for index.html
    'index.html',
    'style.css',
    'app.js',
    'manifest.webmanifest',
    'icon-192.svg',
    'icon-512.svg',
    // External resources (ensure they are CORS-friendly or use no-cors with caution)
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    // Specific font files (these URLs can change, making them fragile to precache directly)
    // Consider a strategy to cache these more dynamically or rely on browser HTTP cache for these.
    // For simplicity in this example, we list a common woff2 file.
    'https://fonts.gstatic.com/s/inter/v13/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7W0Q5nw.woff2' 
];

// --- Event Listener: install ---
self.addEventListener('install', event => {
    console.log('[SW] Install event - v1.6');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Precaching offline assets:', PRECACHE_ASSETS.length, 'items.');
                const promises = PRECACHE_ASSETS.map(assetUrl => {
                    const request = new Request(assetUrl, { mode: assetUrl.startsWith('http') ? 'cors' : 'same-origin' });
                    return cache.add(request).catch(err => {
                        console.warn(`[SW] Failed to cache ${assetUrl} with mode '${request.mode}'. Error:`, err);
                        // Retry with 'no-cors' for cross-origin if 'cors' failed (results in opaque response)
                        if (request.mode === 'cors' && assetUrl.startsWith('http')) {
                            console.log(`[SW] Retrying ${assetUrl} with no-cors.`);
                            const noCorsRequest = new Request(assetUrl, { mode: 'no-cors' });
                            return cache.add(noCorsRequest).catch(noCorsErr => {
                                console.error(`[SW] Failed to cache ${assetUrl} even with no-cors. Error:`, noCorsErr);
                            });
                        }
                    });
                });
                return Promise.all(promises.filter(p => p)); // Filter out undefined from failed no-cors retries
            })
            .then(() => {
                console.log('[SW] All specified assets attempted for precache.');
                return self.skipWaiting(); // Activate the new service worker immediately
            })
            .catch(error => {
                console.error('[SW] Precaching failed:', error);
            })
    );
});

// --- Event Listener: activate ---
self.addEventListener('activate', event => {
    console.log('[SW] Activate event - v1.6');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Old caches cleaned up.');
            return self.clients.claim(); // Take control of all open clients
        })
    );
});

// --- Event Listener: fetch ---
self.addEventListener('fetch', event => {
    const { request } = event;

    // For navigation requests (HTML), try Network first, then Cache.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(networkResponse => {
                    if (networkResponse.ok) {
                        // Cache the successful response for future offline use.
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Network failed, try to serve from cache.
                    return caches.match(request)
                        .then(cachedResponse => cachedResponse || caches.match('index.html')); // Fallback to root index.
                })
        );
        return;
    }

    // For non-navigation requests (CSS, JS, images, fonts), use Cache-first, then Network.
    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse; // Serve from cache if found.
                }
                // Not in cache, fetch from network.
                return fetch(request).then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
                        // For assets we explicitly want to cache (e.g. from PRECACHE_ASSETS list or other criteria)
                        // and that are not opaque responses (which can't be inspected and can fill up storage).
                        const shouldCache = PRECACHE_ASSETS.some(assetUrl => request.url.endsWith(assetUrl.substring(assetUrl.lastIndexOf('/')))) || request.url.includes('cdn.tailwindcss.com') || request.url.includes('fonts.googleapis.com') || request.url.includes('fonts.gstatic.com');

                        if (shouldCache && networkResponse.type !== 'opaque') {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then(cache => cache.put(request, responseToCache));
                        }
                    }
                    return networkResponse;
                });
            })
            .catch(error => {
                console.error('[SW] Fetch failed for:', request.url, error);
                // Optionally return a generic offline fallback for specific types, e.g., an offline image.
                // if (request.destination === 'image') return caches.match('/placeholder-offline.png');
            })
    );
});


// --- Event Listener: notificationclick ---
self.addEventListener('notificationclick', event => {
    console.log('[SW] Notification click Received.', event.notification);
    const clickedNotification = event.notification;
    clickedNotification.close();

    const { taskId } = clickedNotification.data || {};

    // This function tries to focus an existing window or opens a new one.
    const promiseChain = clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    }).then(windowClients => {
        let matchingClient = null;
        for (let i = 0; i < windowClients.length; i++) {
            const client = windowClients[i];
            // You might want more sophisticated matching if your app has multiple entry points or states
            if (client.url.endsWith('/') || client.url.includes('index.html')) {
                matchingClient = client;
                break;
            }
        }

        if (matchingClient) {
            // If a client is found, focus it.
            // You could also send a message to the client: client.postMessage({ type: 'NOTIFICATION_CLICKED', taskId });
            return matchingClient.focus();
        } else {
            // If no client is found, open a new one.
            return clients.openWindow('/'); // Open the app's root page
        }
    });
    event.waitUntil(promiseChain);
});

// --- Event Listener: message (Optional - for communication from app to SW) ---
self.addEventListener('message', event => {
    console.log('[SW] Message received from client:', event.data);
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    // Example: if (event.data.action === 'clearCacheAndReinstall') { ... }
});

console.log('[SW] Service Worker script loaded and running - v1.6.');
