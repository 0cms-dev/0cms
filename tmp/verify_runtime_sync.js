/**
 * verify_runtime_sync.js
 * Verifies that file edits are correctly synced to the WasmBridge.
 */
import { WasmBridge } from '../lib/runtime/WasmBridge.js';

// Mock Worker and Navigator for Node.js environment
global.Worker = class {
  constructor() {
    this.messages = [];
  }
  postMessage(data) {
    this.messages.push(data);
    console.log(`[Mock Worker] Received:`, data.type);
  }
  terminate() {}
};

global.navigator = { serviceWorker: { addEventListener: () => {} } };

async function verifySync() {
  console.log('--- Starting ZeroCMS Runtime Sync Verification ---');

  const bridge = WasmBridge.getInstance();
  
  // 1. Activate WordPress (PHP-WASM)
  await bridge.activate('wordpress');
  
  // 2. Simulate a file sync from WebContainer
  const testPath = '/wp-content/themes/twentytwenty/style.css';
  const testContent = 'body { background: violet; }';
  
  await bridge.syncFile(testPath, testContent);

  // 3. Check if the worker received the sync
  const lastMsg = bridge.activeWorker.messages.find(m => m.type === 'VFS_SYNC');
  
  if (lastMsg && lastMsg.path === testPath && lastMsg.content === testContent) {
    console.log('[PASS] File sync correctly reached the WASM Worker memory.');
  } else {
    console.log('[FAIL] Sync message not found or data mismatch.');
  }

  console.log('--- Verification Complete ---');
}

verifySync().catch(console.error);
