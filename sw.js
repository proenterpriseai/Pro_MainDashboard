var CACHE_NAME = 'pro-ai-v15';
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
    }).then(function() {
      // 새 SW를 대기(waiting) 상태에 두지 않고 즉시 교체 (v=20260805c)
      // 없으면 해당 출처의 탭/PWA 창을 전부 닫을 때까지 구 SW가 계속 서비스됨 → 일부 사용자만 구버전
      return self.skipWaiting();
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
    }).then(function() {
      // 이미 열려 있는 탭까지 새 SW가 즉시 담당 (v=20260805c)
      return self.clients.claim();
    })
  );
});
