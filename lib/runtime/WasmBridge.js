/**
 * WasmBridge.js
 * The ZeroCMS Universal WASM Coordinator.
 * Manages the lifecycle of WASM runtimes (PHP, Python, SSG).
 */
export class WasmBridge {
  static instance = null;
  static activeWorker = null;
  static currentFramework = null;

  static getInstance() {
     if (!this.instance) this.instance = new WasmBridge();
     return this.instance;
  }

  constructor() {
    this.setupServiceWorkerComm();
  }

  /**
   * Initializes the bridge for a specific framework.
   */
  async activate(frameworkId) {
    if (this.currentFramework === frameworkId) return;
    
    console.log(`[WasmBridge] Activating runtime for: ${frameworkId}`);
    this.currentFramework = frameworkId;

    // 1. Terminate old worker
    if (this.activeWorker) this.activeWorker.terminate();

    // 2. Select and start the appropriate worker
    if (['wordpress', 'laravel'].includes(frameworkId)) {
        this.activeWorker = new Worker(new URL('./workers/php-worker.js', import.meta.url), { type: 'module' });
    } else if (frameworkId === 'django') {
        this.activeWorker = new Worker(new URL('./workers/python-worker.js', import.meta.url), { type: 'module' });
    }

    if (this.activeWorker) {
        this.activeWorker.onmessage = (e) => this.handleWorkerMessage(e);
    }
  }

  /**
   * Listens for requests from the runtime-sw.js Service Worker.
   */
  setupServiceWorkerComm() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', async (event) => {
        if (event.data?.type === 'RUNTIME_REQUEST') {
            const port = event.ports[0];
            this.forwardToWorker(event.data, port);
        }
      });
    }
  }

  /**
   * Forwards the HTTP request to the active WASM execution worker.
   */
  async forwardToWorker(requestData, responsePort) {
    if (!this.activeWorker) {
      responsePort.postMessage({ error: 'No active WASM runtime bridge.' });
      return;
    }

    // Pass the request and the response port to the worker
    this.activeWorker.postMessage({
        type: 'HTTP_REQUEST',
        ...requestData
    }, [responsePort]);
  }

  /**
   * Synchronizes a file's content to the WASM runtime memory.
   */
  async syncFile(path, content) {
    if (!this.activeWorker) return;
    
    this.activeWorker.postMessage({
        type: 'VFS_SYNC',
        path,
        content
    });
  }

  handleWorkerMessage(event) {
    // Shared logging and management
    if (event.data.type === 'LOG') {
      console.log(`[WasmBridge Worker]`, event.data.message);
    }
  }
}
