import { JsEngine } from './JsEngine.js';
import init, { instrument_batch } from '../zerocms_tagger.js';

/**
 * WasmEngine.js
 * The high-performance Rust-WASM implementation of the ZeroCMS 
 * instrumentation engine.
 * 
 * Uses wasm-bindgen generated glue code for efficient string passing.
 */
export class WasmEngine extends JsEngine {
  static initialized = false;

  /**
   * Asynchronously loads the WASM module.
   */
  static async load(wasmPath = '/lib/zerocms_tagger_bg.wasm') {
    if (this.initialized) return true;
    
    try {
      console.log('[WasmEngine] Initializing Rust-WASM bridge...');
      await init(wasmPath);
      this.initialized = true;
      console.log('[WasmEngine] Rust-WASM engine initialized successfully.');
      return true;
    } catch (e) {
      console.warn('[WasmEngine] Failed to load WASM binary:', e.message);
      return false;
    }
  }

  constructor() {
    super();
  }

  /**
   * Optimized Batch Instrumentation.
   * Leverages the Rust 'instrument_batch' function via the glue code.
   */
  async instrumentBatch(files) {
    if (!WasmEngine.initialized) {
        // Fallback to sequential JS instrumentation
        const results = [];
        for (const file of files) {
            results.push({
                path: file.path,
                content: this.instrument(file.content, file.file_index, file.extension)
            });
        }
        return results;
    }

    // Prepare JSON for the WASM boundary
    const inputJson = JSON.stringify(files.map(f => ({
        path: f.path,
        content: f.content,
        file_index: f.file_index
    })));

    try {
        // instrument_batch is the function exported from the glue code
        const resultJson = instrument_batch(inputJson);
        return JSON.parse(resultJson);
    } catch (e) {
        console.error('[WasmEngine] Batch instrumentation failed:', e);
        return [];
    }
  }
}
