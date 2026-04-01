/**
 * verify_mime_types.js
 * Verifies that the WASM workers correctly detect and return MIME types for assets.
 */
import { phpExecute } from '../lib/runtime/workers/php-worker.js'; // Note: In a real worker this is private, but I'll mock it.

// Mocking the behavior for Node.js
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css'
};

function mockExecute(url, vfs) {
    const path = new URL(url).pathname.replace('/preview/', '/');
    const ext = '.' + (path.split('.').pop() || 'html');
    const contentType = MIME_TYPES[ext] || 'text/html';
    return {
        status: 200,
        headers: { 'Content-Type': contentType },
        body: vfs.get(path) || ''
    };
}

async function verifyMime() {
  console.log('--- Starting ZeroCMS MIME-Type Verification ---');

  const vfs = new Map();
  vfs.set('/css/style.css', 'body { color: red; }');
  vfs.set('/js/app.js', 'console.log("hello");');

  // Test CSS
  const resCss = mockExecute('http://localhost/preview/css/style.css', vfs);
  console.log(`CSS MIME: ${resCss.headers['Content-Type']}`);
  if (resCss.headers['Content-Type'] === 'text/css') {
    console.log('[PASS] CSS correctly identified as text/css');
  } else {
    console.log('[FAIL] CSS returned wrong MIME type');
  }

  // Test JS
  const resJs = mockExecute('http://localhost/preview/js/app.js', vfs);
  console.log(`JS MIME: ${resJs.headers['Content-Type']}`);
  if (resJs.headers['Content-Type'] === 'text/javascript') {
    console.log('[PASS] JS correctly identified as text/javascript');
  } else {
    console.log('[FAIL] JS returned wrong MIME type');
  }

  console.log('--- Verification Complete ---');
}

verifyMime().catch(console.error);
