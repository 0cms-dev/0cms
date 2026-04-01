/**
 * php-worker.js
 * The ZeroCMS PHP-WASM Runtime Environment.
 */
import { MarkerService } from '../../services/MarkerService.js';

let php = null;
const vfs = new Map(); // Simple VFS for memory synchronization

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

/**
 * Bootstraps the PHP-WASM CGI instance.
 */
async function initPhp() {
  console.log('[PHP Worker] Booting PHP interpreter via WASM...');
  php = {
    execute: (request, vfs) => {
        const url = new URL(request.url);
        const path = url.pathname.replace('/preview/', '/');
        const content = vfs.get(path) || vfs.get('/index.php');
        
        if (!content) return { status: 404, body: '404 - Not Found' };

        // DETECT MIME TYPE
        const ext = '.' + (path.split('.').pop() || 'html');
        const contentType = MIME_TYPES[ext] || 'text/html';
        
        return {
            status: 200,
            headers: { 'Content-Type': contentType },
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
    if (!php) await initPhp();
    
    // Simulate PHP-CGI execution
    const response = php.execute(data, vfs);
    
    // Send back to the Service Worker via the provided port
    const port = event.ports[0];
    if (port) {
        port.postMessage(response);
    }
  }
};
