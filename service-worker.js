/* MerchantPay PWA 서비스워커 — 오프라인 캐시 + 빠른 로딩 */
const CACHE = 'merchantpay-m-v1';
const CORE = [
  './', 'index.html', 'styles.css', 'app.js',
  'qronix-logo.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'pay.html', 'testqr.html', 'devca.crt'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // 동일 출처: 네트워크 우선 → 오프라인 시 캐시 (항상 최신 유지 + 오프라인 동작)
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
    );
  } else {
    // 외부 CDN(스캐너/QR 라이브러리): 캐시 우선 (오프라인에서도 동작)
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached))
    );
  }
});
