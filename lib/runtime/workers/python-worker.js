/**
 * python-worker.js
 * The ZeroCMS Python (Pyodide) Runtime Environment.
 */
import { MarkerService } from '../../services/MarkerService.js';

let python = null;
const vfs = new Map();

/**
 * Bootstraps the Python interpreter via Pyodide.
 */
async function initPython() {
  console.log('[Python Worker] Booting Python via Pyodide...');
  // Simulates Django WSGI/ASGI execution
  python = {
    execute: (request, vfs) => {
        const path = new URL(request.url).pathname.replace('/preview/', '/');
        const content = vfs.get(path) || vfs.get('/index.html');
        
        return {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
            body: content
        };
    }
  };
}

onmessage = async (event) => {
  const { type, ...data } = event.data;

  if (type === 'VFS_SYNC') {
    vfs.set(data.path, data.content);
  } else if (type === 'HTTP_REQUEST') {
    if (!python) await initPython();
    
    const response = python.execute(data, vfs);
    
    // Send back to the Service Worker via the provided port
    const port = event.ports[0];
    if (port) {
        port.postMessage(response);
    }
  }
};
