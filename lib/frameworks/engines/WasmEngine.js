import { JsEngine } from './JsEngine.js';
// Static imports removed to allow building without the generated WASM glue code
// import init, { instrument_batch } from '../../zerocms_tagger.js';

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
      const mod = await import('/lib/zerocms_tagger.js');
      await mod.default({ module_or_path: wasmPath });
      this.wasm = mod; // Store for later use
      this.initialized = true;
      console.log('[WasmEngine] Rust-WASM engine initialized successfully.');
      return true;
    } catch (e) {
      console.warn('[WasmEngine] WASM glue code missing or failed to load:', e.message);
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
        // use the stored wasm module
        const resultJson = this.constructor.wasm.instrument_batch(inputJson);
        return JSON.parse(resultJson);
    } catch (e) {
        console.error('[WasmEngine] Batch instrumentation failed:', e);
        return [];
    }
  }

  /**
   * High-Performance Batch Stripping (Standardized for Git Sanitization)
   */
  async stripBatch(files) {
    if (!WasmEngine.initialized) {
        // Fallback to sequential JS stripping
        return files.map(file => ({
            path: file.path,
            content: this.strip(file.content)
        }));
    }

    const inputJson = JSON.stringify(files.map(f => ({
        path: f.path,
        content: f.content
    })));

    try {
        const resultJson = this.constructor.wasm.strip_batch(inputJson);
        return JSON.parse(resultJson);
    } catch (e) {
        console.error('[WasmEngine] Batch strip failed:', e);
        return files;
    }
  }
}
