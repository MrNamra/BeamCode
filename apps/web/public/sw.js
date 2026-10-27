// BeamCode Progressive Web App Service Worker
// 1. Streaming Downloads (Safari / Firefox)
// 2. Offline App Shell Caching & Fast Loading
// 3. Web Share Target Interception
/* eslint-disable no-undef */

const CACHE_NAME = 'beamcode-pwa-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

const activeStreams = new Map(); // streamId -> { controller, filename, size, mime }

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[SW] Core assets pre-caching failed (will cache on demand):', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// IndexedDB Helper for Web Share Target
function storeSharedFiles(files) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('beamcode-share', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('shared-files')) {
        db.createObjectStore('shared-files', { autoIncrement: true });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('shared-files', 'readwrite');
      const store = tx.objectStore('shared-files');
      store.clear();
      for (const file of files) {
        store.add({
          name: file.name,
          size: file.size,
          type: file.type,
          blob: file,
          lastModified: file.lastModified,
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  const { type, streamId } = data;

  if (type === 'REGISTER_DOWNLOAD') {
    const { filename, size, mime } = data;
    let streamController;

    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;
      },
      cancel() {
        activeStreams.delete(streamId);
      },
    });

    activeStreams.set(streamId, {
      stream,
      getController: () => streamController,
      filename,
      size,
      mime: mime || 'application/octet-stream',
    });

    event.ports[0]?.postMessage({ ok: true });
    return;
  }

  const streamInfo = activeStreams.get(streamId);
  if (!streamInfo) return;

  const controller = streamInfo.getController();

  if (type === 'STREAM_CHUNK') {
    if (controller && data.chunk) {
      controller.enqueue(new Uint8Array(data.chunk));
    }
  } else if (type === 'STREAM_END') {
    if (controller) {
      try {
        controller.close();
      } catch {
        // already closed
      }
    }
    activeStreams.delete(streamId);
  } else if (type === 'STREAM_ABORT') {
    if (controller) {
      try {
        controller.error(new Error(data.reason || 'Stream aborted'));
      } catch {
        // already closed
      }
    }
    activeStreams.delete(streamId);
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Streaming downloads (ServiceWorkerStreamSink)
  if (url.pathname.startsWith('/sw-download/')) {
    const parts = url.pathname.split('/');
    const streamId = parts[2];
    const streamInfo = activeStreams.get(streamId);

    if (!streamInfo) {
      event.respondWith(new Response('Download stream expired or not found', { status: 404 }));
      return;
    }

    const headers = new Headers();
    headers.set('Content-Type', streamInfo.mime);
    headers.set(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(streamInfo.filename)}"`
    );
    if (streamInfo.size > 0) {
      headers.set('Content-Length', streamInfo.size.toString());
    }

    event.respondWith(
      new Response(streamInfo.stream, {
        headers,
      })
    );
    return;
  }

  // 2. Web Share Target handler (POST /share-target)
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const files = formData.getAll('files').filter((f) => f instanceof File);
          if (files.length > 0) {
            await storeSharedFiles(files);
          }
          return Response.redirect('/?shared=true', 303);
        } catch (err) {
          console.error('[SW] Share target error:', err);
          return Response.redirect('/', 303);
        }
      })()
    );
    return;
  }

  // 3. Ignore non-GET requests or WebSocket connections or API endpoints
  if (event.request.method !== 'GET') return;
  if (
    url.pathname.startsWith('/ws') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/healthz')
  ) {
    return;
  }

  // 4. Navigation requests (HTML / SPA) -> Network First with Cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          return new Response('Offline - BeamCode', {
            headers: { 'Content-Type': 'text/html' },
          });
        })
    );
    return;
  }

  // 5. Static assets (JS, CSS, icons, images) -> Stale While Revalidate
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.webmanifest')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
  }
});
