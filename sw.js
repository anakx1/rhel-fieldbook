/* RHEL Fieldbook — offline cache */
const CACHE = 'rhel-fieldbook-v9';
const CORE = [
  './',
  './index.html',
  './assets/css/style.css',
  './assets/js/data.js',
  './assets/js/lessons-orientation.js',
  './assets/js/lessons-operations.js',
  './assets/js/lessons-systems.js',
  './assets/js/lessons-practice.js',
  './assets/js/quiz-order.js',
  './assets/js/sandbox/vfs.js',
  './assets/js/sandbox/machine.js',
  './assets/js/sandbox/parser.js',
  './assets/js/sandbox/commands.js',
  './assets/js/sandbox/commands-text.js',
  './assets/js/sandbox/commands-fs.js',
  './assets/js/sandbox/commands-identity.js',
  './assets/js/sandbox/commands-system.js',
  './assets/js/sandbox/shell.js',
  './assets/js/sandbox/index.js',
  './assets/js/features.js',
  './assets/js/app.js',
  './assets/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
