// ═══════════════════════════════════════════════════════════
//  MedLibrary SERVICE WORKER
//  Auto-discovers articles from manifest.js for precaching.
//  CACHE_VERSION is auto-replaced by GitHub Actions on deploy.
// ═══════════════════════════════════════════════════════════

const CACHE_VERSION = '{{CACHE_VERSION}}';

// App shell — core files that make the site functional offline
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './manifest.js',
  './lib/article-style.css',
  './lib/article-script.js',
  './tools/ai-article-maker.html',
  './tools/manual-article-maker.html',
  './icon-192.png',
  './icon-512.png',
  './ARTICLESPEC.md'
];

// External resources to cache (Google Fonts)
const FONT_CACHE = 'medlib-fonts-' + CACHE_VERSION;
const FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Playfair+Display:wght@600;700;800&display=swap'
];


/* ═══ INSTALL — Precache shell + discover articles ══════════ */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    console.log('[SW] Installing, cache version:', CACHE_VERSION);

    // 1. Precache the app shell
    const shellCache = await caches.open('medlib-shell-' + CACHE_VERSION);
    try {
      await shellCache.addAll(SHELL);
      console.log('[SW] Shell precached (' + SHELL.length + ' files)');
    } catch (err) {
      console.warn('[SW] Some shell files failed to precache:', err);
      // Try one-by-one for resilience
      for (const url of SHELL) {
        try { await shellCache.add(url); } catch (e) { /* skip */ }
      }
    }

    // 2. Fetch manifest.js and discover article files to precache
    try {
      const manifestResp = await fetch('./manifest.js');
      const manifestText = await manifestResp.text();
      // Extract the JSON array from the JS file
      const match = manifestText.match(/\[[\s\S]*\]/);
      if (match) {
        const articles = JSON.parse(match[0]);
        const articleUrls = articles.map(a => './' + a.file);
        const articleCache = await caches.open('medlib-articles-' + CACHE_VERSION);

        const cached = [];
        const failed = [];
        for (const url of articleUrls) {
          try {
            await articleCache.add(url);
            cached.push(url);
          } catch (e) {
            failed.push(url);
          }
        }
        console.log('[SW] Articles precached:', cached.length, '/ skipped:', failed.length);
        if (failed.length) console.warn('[SW] Failed articles:', failed);
      }
    } catch (e) {
      console.warn('[SW] Could not precache articles from manifest:', e);
    }

    // 3. Precache fonts
    try {
      const fontCache = await caches.open(FONT_CACHE);
      for (const url of FONT_URLS) {
        try { await fontCache.add(url); } catch (e) { /* skip */ }
      }
      console.log('[SW] Fonts precached');
    } catch (e) { /* skip */ }

    // Skip waiting so the new SW activates immediately
    self.skipWaiting();
  })());
});


/* ═══ ACTIVATE — Clean old caches ═══════════════════════════ */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    console.log('[SW] Activating, cleaning old caches...');
    const keys = await caches.keys();
    const currentPrefixes = [
      'medlib-shell-' + CACHE_VERSION,
      'medlib-articles-' + CACHE_VERSION,
      'medlib-fonts-' + CACHE_VERSION,
      'medlib-dynamic-' + CACHE_VERSION
    ];
    const deleted = [];
    for (const key of keys) {
      // Delete any medlib cache that doesn't match the current version
      if (key.startsWith('medlib-') && !currentPrefixes.some(p => key.startsWith(p))) {
        await caches.delete(key);
        deleted.push(key);
      }
    }
    if (deleted.length) console.log('[SW] Deleted old caches:', deleted);

    // Claim all clients immediately
    self.clients.claim();

    // Notify all clients about the update
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
      client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
    });
  })());
});


/* ═══ FETCH — Routing strategy ══════════════════════════════ */
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip cross-origin (except fonts)
  if (url.origin !== location.origin) {
    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
      event.respondWith(fontStrategy(event.request));
    }
    return;
  }

  // HTML pages: stale-while-revalidate (freshness matters)
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // CSS, JS, images: cache-first with network fallback
  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|gif|ico|webp|woff2?)$/i)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request));
});


/* ═══ STRATEGIES ════════════════════════════════════════════ */

// Stale-while-revalidate: serve from cache, update in background
async function staleWhileRevalidate(request) {
  const cache = await caches.open('medlib-dynamic-' + CACHE_VERSION);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached); // Network failed, use cache

  // Return cached immediately if available, otherwise wait for network
  return cached || networkPromise;
}

// Cache-first: serve from cache, fetch only on cache miss
async function cacheFirst(request) {
  // Search all medlib caches
  const keys = await caches.keys();
  for (const key of keys) {
    if (key.startsWith('medlib-')) {
      const cache = await caches.open(key);
      const cached = await cache.match(request);
      if (cached) return cached;
    }
  }

  // Cache miss — fetch from network
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open('medlib-dynamic-' + CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    // Return a simple offline response for navigation
    if (request.headers.get('accept')?.includes('text/html')) {
      return new Response(offlinePage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    return new Response('Offline', { status: 503 });
  }
}

// Font strategy: cache-first with font-specific cache
async function fontStrategy(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return cached || new Response('', { status: 503 });
  }
}


// Simple offline fallback page
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Offline — MedLibrary</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Outfit',system-ui,sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem;text-align:center}
.box{max-width:420px}
.icon{font-size:3rem;margin-bottom:1.5rem;opacity:.6}
h1{font-size:1.5rem;margin-bottom:.75rem;color:#f0a500}
p{color:#8b949e;line-height:1.6;margin-bottom:1.5rem;font-size:.95rem}
button{padding:.7rem 1.5rem;border-radius:8px;background:#f0a500;color:#000;font-weight:600;border:none;cursor:pointer;font-size:.9rem}
button:hover{opacity:.9}
</style>
</head>
<body>
<div class="box">
  <div class="icon">&#128268;</div>
  <h1>You're Offline</h1>
  <p>It looks like you've lost your internet connection. Your cached articles are still available — try navigating back to a page you've visited before.</p>
  <button onclick="window.location.href='./index.html'">Go to Home</button>
</div>
</body>
</html>`;
}