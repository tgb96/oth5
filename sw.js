const APP_VERSION = '27';
const SHELL_CACHE = `open-tennis-v${APP_VERSION}-shell`;
const DATA_CACHE = `open-tennis-v${APP_VERSION}-data`;

const CORE_ASSETS = [
  './',
  './index.html',
  './partidos.html',
  './tablas.html',
  './resultados-2025.html',
  './reglas.html',
  './marcador.html',
  './404.html',
  './offline.html',
  './assets/css/styles.css',
  './assets/css/v3.css',
  './assets/css/v4.css',
  './assets/css/v5.css',
  './assets/css/p2.css',
  './assets/css/index.css',
  './assets/css/partidos.css',
  './assets/css/tablas.css',
  './assets/css/resultados-2025.css',
  './assets/css/marcador.css',
  './assets/js/partidos-page.js',
  './assets/js/index-page.js',
  './assets/js/index-experience.js',
  './assets/js/player-preference.js',
  './assets/js/tablas-page.js',
  './assets/js/resultados-2025-page.js',
  './assets/js/marcador-page.js',
  './assets/js/app.js',
  './assets/js/release-v27.js',
  './assets/js/config.js',
  './assets/js/data-client.js',
  './assets/js/pwa-install.js',
  './assets/js/marcador-rules.js',
  './data/fixture.csv',
  './data/rankings.csv',
  './data/resultados.csv',
  './data/resultados-2025.json',
  './assets/img/logo-open-tennis-256.svg',
  './assets/icons/favicon-32.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './manifest.webmanifest'
];

function canCache(response) {
  return response && response.ok && (response.type === 'basic' || response.type === 'cors');
}

async function putIfValid(cacheName, request, response) {
  if (!canCache(response)) return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl = null) {
  try {
    const response = await fetch(request);
    return putIfValid(cacheName, request, response);
  } catch (_error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) return caches.match(fallbackUrl);
    throw _error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const url = new URL(request.url);
  const bundledFallback = url.search
    ? await caches.match(`${url.origin}${url.pathname}`)
    : null;

  try {
    const response = await fetch(request);
    return putIfValid(SHELL_CACHE, request, response);
  } catch (error) {
    if (bundledFallback) return bundledFallback;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  const refresh = fetch(request)
    .then(response => putIfValid(SHELL_CACHE, request, response))
    .catch(() => null);

  return cached || refresh;
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', event => {
  const currentCaches = new Set([SHELL_CACHE, DATA_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => !currentCaches.has(key)).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (url.hostname === 'docs.google.com') {
      event.respondWith(networkFirst(request, DATA_CACHE));
    }
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE, './offline.html'));
    return;
  }

  const staticDestinations = new Set(['style', 'script', 'image', 'font']);
  if (staticDestinations.has(request.destination) || url.pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
