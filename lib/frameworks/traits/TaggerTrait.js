import { JsEngine } from '../engines/JsEngine.js';
import { WasmEngine } from '../engines/WasmEngine.js';

/**
 * TaggerTrait.js
 * The modular orchestration layer for source instrumentation.
 * It manages the lifecycle of the JS and WASM engines and 
 * performs the 'Instrumentation' on the project's files.
 */
export class TaggerTrait {
  constructor(webcontainer) {
    this.wc = webcontainer;
    this.fileMap = new Map();
    this.pathMap = new Map();
    this.nextId = 1;
    this.jsEngine = new JsEngine();
    this.wasmEngine = new WasmEngine();
    this.activeEngine = this.jsEngine; // Default to JS
  }

  async initWasm() {
    const success = await WasmEngine.load('/lib/zerocms_tagger_bg.wasm');
    if (success) {
        this.activeEngine = this.wasmEngine;
        console.log('[TaggerTrait] High-Performance Rust-WASM Engine activated.');
    }
    return success;
  }

  /**
   * Scans and instruments a list of directories for content files.
   */
  async instrumentDirectories(contentPaths) {
    for (const rawPath of contentPaths) {
       // normalize path
       const dir = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
       try {
         const files = await this.recursiveReaddir(dir);
         for (const file of files) {
           if (file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.yml') || file.endsWith('.yaml')) {
             await this.instrumentFile(file);
           }
         }
       } catch (e) {
         console.warn(`[TaggerTrait] Skip path ${dir}:`, e.message);
       }
    }
    
    // Write the File Map to the WebContainer so the dashboard can access it if needed
    const registry = Object.fromEntries(this.fileMap);
    await this.wc.fs.writeFile('/zcms-source-map.json', JSON.stringify(registry));
  }

  async instrumentFile(path) {
    if (!this.pathMap.has(path)) {
      const id = this.nextId++;
      this.fileMap.set(id, path);
      this.pathMap.set(path, id);
    }
    
    const fileId = this.pathMap.get(path);
    const content = await this.wc.fs.readFile(path, 'utf8');
    const ext = path.split('.').pop();
    
    const instrumented = this.activeEngine.instrument(content, fileId, `.${ext}`);
    
    if (instrumented && instrumented !== content) {
        await this.wc.fs.writeFile(path, instrumented);
        console.log(`[TaggerTrait] Instrumented: ${path} (ID: ${fileId} via ${this.activeEngine.constructor.name})`);
    }
  }

  /**
   * High-Performance Batch Instrumentation (Premium)
   */
  async instrumentBatch(pathList) {
    if (this.activeEngine === this.wasmEngine && WasmEngine.wasm) {
        const fileBatch = [];
        for (const path of pathList) {
            const id = this.nextId++;
            this.fileMap.set(id, path);
            this.pathMap.set(path, id);
            
            const content = await this.wc.fs.readFile(path, 'utf8');
            const ext = '.' + path.split('.').pop();
            fileBatch.push({ path, content, file_index: id, extension: ext });
        }

        const results = await this.wasmEngine.instrumentBatch(fileBatch);
        for (const res of results) {
            if (res.content) {
                await this.wc.fs.writeFile(res.path, res.content);
            }
        }
        
        // Write source map
        const registry = Object.fromEntries(this.fileMap);
        await this.wc.fs.writeFile('/zcms-source-map.json', JSON.stringify(registry));
        return results;
    }
    
    // Standard JS parallel run
    return Promise.all(pathList.map(f => this.instrumentFile(f)));
  }

  /**
   * Native JS instrumentation logic moved to JsEngine.js
   */
  strip(content) {
    return this.jsEngine.strip(content);
  }

  async recursiveReaddir(dir) {
    const entries = await this.wc.fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = (dir === '/' ? '' : dir) + '/' + entry.name;
      if (entry.isDirectory()) {
        files.push(...(await this.recursiveReaddir(fullPath)));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }
}
