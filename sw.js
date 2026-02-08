// Service Worker for offline support and caching
const CACHE_VERSION = 'littlesteps-v1';
const ASSETS_CACHE = 'littlesteps-assets-v1';

const STATIC_ASSETS = [
  './',
  './index.html'
];

const BASE_URL = self.location.pathname.replace(/\/sw\.js$/, '') || './';
const FULL_STATIC_ASSETS = STATIC_ASSETS.map(url => {
  if (url === './') return BASE_URL;
  if (url.startsWith('./')) return BASE_URL + url.slice(2);
  return url;
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(FULL_STATIC_ASSETS).catch(() => {
        console.warn('Failed to cache some assets');
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_VERSION && cacheName !== ASSETS_CACHE) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      )
    })
  )
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API calls - network first
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(request, response.clone());
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || new Response('Offline', { status: 503 });
          });
        })
    );
    return;
  }

  // Assets - cache first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(ASSETS_CACHE).then((cache) => {
              cache.put(request, response.clone());
            });
          }
          return response;
        })
        .catch(() => {
          return new Response('Offline', { status: 503 });
        });
    })
  );
});

// Background sync for progress
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-progress') {
    event.waitUntil(syncProgress());
  }
});

async function syncProgress() {
  try {
    const cache = await caches.open(CACHE_VERSION);
    const requests = await cache.keys();
    
    // Send any pending progress updates
    for (const request of requests) {
      if (request.url.includes('/api/progress')) {
        try {
          await fetch(request.clone());
          await cache.delete(request);
        } catch (e) {
          console.error('Failed to sync progress:', e);
        }
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}
