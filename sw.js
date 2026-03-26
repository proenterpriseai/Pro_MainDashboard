var CACHE_NAME = 'pro-ai-v6';
var urlsToCache = [
  '/',
  '/index.html',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/preview-analysis.webp',
  '/preview-calculator.webp',
  '/preview-coach.webp',
  '/preview-dispute.webp',
  '/preview-sales.webp',
  '/preview-insurance.webp'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', function(event) {
  // Firebase SDK와 Auth 요청은 캐시하지 않음
  if (event.request.url.indexOf('firebasejs') !== -1 ||
      event.request.url.indexOf('firebaseapp') !== -1 ||
      event.request.url.indexOf('googleapis.com') !== -1) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    fetch(event.request).then(function(response) {
      return caches.open(CACHE_NAME).then(function(cache) {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch(function() {
      return caches.match(event.request);
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
});
