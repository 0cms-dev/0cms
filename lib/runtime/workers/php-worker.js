/**
 * php-worker.js
 * The ZeroCMS PHP-WASM Runtime Environment.
 */
import { MarkerService } from '../../services/MarkerService.js';

let php = null;
const vfs = new Map(); // Simple VFS for memory synchronization

/**
 * Bootstraps the PHP-WASM CGI instance.
 */
async function initPhp() {
  console.log('[PHP Worker] Booting PHP interpreter via WASM...');
  // This is where real 'php-wasm' library would load.
  // We simulate the CGI response logic here.
  php = {
    execute: (request, vfs) => {
        // Find the script (e.g. index.php)
        const path = new URL(request.url).pathname.replace('/preview/', '/');
        const content = vfs.get(path) || vfs.get('/index.php');
        
        if (!content) return { status: 404, body: '404 - Not Found' };
        
        // Return the HTML content with PHP logic resolved (or mocked)
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
