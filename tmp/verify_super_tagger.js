/**
 * verify_super_tagger.js
 * Verifies the batch instrumentation logic and WasmEngine fallback.
 */
import { TaggerTrait } from '../lib/frameworks/traits/TaggerTrait.js';

// Mock WebContainer for Node.js environment
const mockWc = {
    fs: {
        readFile: async (path) => {
            if (path.includes('index.html')) return '<h1>Hello World</h1><p>{{ title }}</p>';
            if (path.includes('post.md')) return '# Post\n{{ content }}';
            return '';
        },
        writeFile: async (path, content) => {
            console.log(`[Mock WC FS] Wrote: ${path} (${content.length} bytes)`);
        }
    }
};

async function verifySuperTagger() {
  console.log('--- Starting ZeroCMS Super Tagger Verification ---');

  const tagger = new TaggerTrait(mockWc);
  
  // 1. Initial State: Should be JsEngine
  console.log(`Initial Engine: ${tagger.activeEngine.constructor.name}`);

  // 2. Mocking Batch Files
  const files = ['/repo/index.html', '/repo/post.md'];
  
  console.log('Running Batch Instrumentation (Fallback Mode)...');
  const results = await tagger.instrumentBatch(files);

  if (results.length === 2) {
    console.log('[PASS] Batch instrumentation successfully processed all files.');
    // Check for Unicode breadcrumb in the first result
    const hasMarker = results[0].content.includes('\u{200B}\u{200C}');
    if (hasMarker) {
        console.log('[PASS] Content contains valid Unicode breadcrumbs.');
    } else {
        console.log('[FAIL] Content missing breadcrumbs.');
    }
  } else {
    console.log('[FAIL] Batch did not return all results.');
  }

  // 3. Test WASM activation attempt
  console.log('Attempting WASM activation (Expect Fail/Fallback)...');
  const wasmSuccess = await tagger.initWasm();
  console.log(`WASM Activation Success: ${wasmSuccess}`);
  console.log(`Active Engine: ${tagger.activeEngine.constructor.name}`);

  console.log('--- Verification Complete ---');
}

verifySuperTagger().catch(console.error);
