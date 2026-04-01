/**
 * runtime-sw.js
 * The ZeroCMS Proxy Service Worker.
 * Intercepts /preview/* requests and routes them to the WASM Runtime.
 */
const BYPASS_HEADER = 'x-zerocms-bypass';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Only intercept requests for the /preview prefix
  if (url.pathname.startsWith('/preview/')) {
    event.respondWith(handleRuntimeRequest(event));
  }
});

/**
 * Forwards requests to the WasmBridge (in a Web Worker or Main Thread).
 */
async function handleRuntimeRequest(event) {
  const clients = await self.clients.matchAll();
  const mainClient = clients.find(c => c.type === 'window' || c.type === 'worker');

  if (!mainClient) {
    return fetch(event.request);
  }

  // Communicate with the WasmBridge to get the WASM-rendered response
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (msg) => {
      if (msg.data.error) {
        resolve(new Response(msg.data.error, { status: 500 }));
      } else {
        // Construct the response from the WASM engine output
        const headers = new Headers(msg.data.headers || {});
        if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'text/html');
        }

        resolve(new Response(msg.data.body, {
          status: msg.data.status || 200,
          headers: headers
        }));
      }
    };

    mainClient.postMessage({
      type: 'RUNTIME_REQUEST',
      url: event.request.url,
      method: event.request.method,
      headers: Object.fromEntries(event.request.headers.entries())
    }, [channel.port2]);
  });
}
