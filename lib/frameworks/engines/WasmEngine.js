import { JsEngine } from './JsEngine.js';

/**
 * WasmEngine.js
 * The high-performance Rust-WASM implementation of the ZeroCMS 
 * instrumentation engine.
 * 
 * Provides near-native speed for batch instrumentation of large monorepos.
 * Falls back to JsEngine if the WASM binary is not loaded.
 */
export class WasmEngine extends JsEngine {
  static wasm = null;

  /**
   * Asynchronously loads the WASM module from the provided path.
   */
  static async load(wasmPath = '/lib/zerocms_tagger_bg.wasm') {
    if (this.wasm) return true;
    
    try {
      // 1. SILENT CHECK: Use a HEAD request to see if the file exists without triggering a console 404 error
      const headCheck = await fetch(wasmPath, { method: 'HEAD' });
      if (!headCheck.ok) {
          // File missing, silent exit (fall back to JS)
          return false;
      }

      console.log('[WasmEngine] Loading high-performance Rust tagger...');
      // In a real environment, we would use 'wasm-bindgen' generated glue code.
      // For this bridge, we assume the module exports 'instrument_batch'.
      const response = await fetch(wasmPath);
      if (!response.ok) throw new Error('WASM binary not found');
      
      const buffer = await response.arrayBuffer();
      const module = await WebAssembly.instantiate(buffer, {
        env: {
          memory: new WebAssembly.Memory({ initial: 256, maximum: 1024 })
        }
      });
      
      this.wasm = module.instance.exports;
      console.log('[WasmEngine] Rust-WASM engine initialized successfully.');
      return true;
    } catch (e) {
      // Fallback to JS without noisy warnings
      return false;
    }
  }

  constructor() {
    super();
  }

  /**
   * Optimized Batch Instrumentation.
   * Passes all files to the Rust side in a single boundary-cross.
   */
  async instrumentBatch(files) {
    if (!WasmEngine.wasm) {
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
        // Rust returns a JSON string of results
        const resultJson = WasmEngine.wasm.instrument_batch(inputJson);
        return JSON.parse(resultJson);
    } catch (e) {
        console.error('[WasmEngine] Batch instrumentation failed:', e);
        return [];
    }
  }
}
