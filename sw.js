// 인터넷이 없어도 앱이 열리도록 앱 파일만 저장 (사진은 기기 저장소에 따로 있음)
const V = 'travel-book-v8';
const FILES = ['./', 'index.html', 'style.css', 'book.css', 'story.css', 'shelf.css', 'db.js', 'zip.js', 'meta.js', 'pages.js', 'render.js', 'story.js', 'map.js', 'app.js', 'actions.js', 'folder.js', 'ai.js', 'export.js', 'publish.js', 'voice.js', 'shelf.js', 'motion.js', 'lib/exifr.js', 'data/cities.txt', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
