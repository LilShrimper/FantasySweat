// Service worker for the website copy of Fantasy Sweat (the extension never registers it).
//
// It keeps the page itself — the HTML, the stylesheet, the script, the icon — so the Home Screen app
// opens on a bad connection instead of sitting on a white screen. It never touches the scores: every
// request to Sleeper or ESPN goes straight to the network, untouched.
//
// The page's own files are network-first: a fresh copy whenever one arrives within a couple of
// seconds, the saved copy otherwise. So a deploy shows up the next time the app opens, not the time
// after, and nobody is ever stuck on an old version while they're online.
const CACHE = 'fantasy-sweat-shell-v1';
const SHELL = ['./', 'popup.css', 'popup.js', 'manifest.json', 'app.webmanifest', 'web/icon-192.png'];
const WAIT_MS = 2500;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(freshOrSaved(e.request));
});

async function freshOrSaved(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request, { ignoreSearch: true });
  const fresh = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  if (!saved) return fresh;
  const late = new Promise((resolve) => setTimeout(resolve, WAIT_MS, null));
  return (await Promise.race([fresh.catch(() => null), late])) || saved;
}
