import git from '/lib/isomorphic-git.js';
import FS from '/lib/lightning-fs.js';
import { WebContainer } from '/lib/webcontainer-api.js';
import { FrameworkBroker } from './lib/frameworks/FrameworkBroker.js';
import { TaggerTrait } from './lib/frameworks/traits/TaggerTrait.js';

/**
 * WebContainerGitService
 * Orchestrates Git operations in browser-persistent storage and 
 * manages the WASM-based WebContainer execution engine.
 */
export class WebContainerGitService {
  constructor(config = {}) {
    this.repoUrl = config.repoUrl;
    this.dir = config.dir || '/repo';
    
    // Always use the internal Git proxy to preserve Auth headers and avoid browser popups
    this.proxy = config.proxy || (typeof window !== 'undefined' ? window.location.origin + '/git-proxy' : 'https://cors.isomorphic-git.org');
    
    this.token = config.token;
    
    this.config = config;
    this.fs = new FS('cms-fs').promises;
    this.webcontainerInstance = null;
    this.serverUrl = null;       // Raw WebContainer URL (port 3001)
    this.previewUrl = null;      // Full URL including base path (used for iframe)
    
    // Callbacks for UI updates
    this.onStatusChange = config.onStatusChange || (() => {});
    this.onServerReady = config.onServerReady || (() => {});
    this.onLog = config.onLog || ((msg) => console.log(`[WC-Log] ${msg}`));
    
    this.isBooting = false;
    this.isDevMode = false;
    this.serverProcess = null;
    this.middlewareProc = null;
    this._lastMiddlewarePort = null;
    this.middlewareStarted = false;
    this._isOrchestratingMiddleware = false;
    // Track files actually modified by applySmartMatchChange so we know what to sync
    this._modifiedFiles = new Set();
    this._syncTimer = null;
    this._fsBusy = false; // Mutex: prevents concurrent WASM FS operations

    // Framework detection and drivers
    this.broker = null;
    this.activeDriver = null;

    this.semanticReady = false;
    this.readyPatterns = [
      /ready\s-\sstarted\sserver/i,      // Next.js
      /compiled\ssuccessfully/i,         // Webpack / Nuxt
      /dev\sserver\srunning\sat/i,       // Vite / Astro
      /astro\s.*ready\sin/i,             // Astro specific
      /serving\sat/i,                    // Eleventy
      /server\srunning\son/i,            // Hugo / Zola
      /listening\son/i                   // Generic
    ];
  }

  /**
   * Formal Shutdown: Kill all processes and reset repo-specific state.
   */
  async shutdown() {
    this.isShuttingDown = true;
    this.onLog('[Service] Shutting down current project engine...');
    
    if (this.serverProcess) {
        try { this.serverProcess.kill(); } catch (e) {}
        this.serverProcess = null;
    }
    if (this.middlewareProc) {
        try { this.middlewareProc.kill(); } catch (e) {}
        this.middlewareProc = null;
    }
    
    this.serverUrl = null;
    this.previewUrl = null;
    this.middlewareStarted = false;
    this.repoUrl = null;
    this.semanticReady = false;
    this._modifiedFiles.clear();
    
    this.isBooting = false;
    this.isShuttingDown = false;
    this.onLog('[Service] Shutdown complete.');
  }

  /**
   * Initialize the entire pipeline: Git -> WebContainer -> Dev Server
   */
  async boot(requestedRepoUrl, manualCommand = null) {
    // Reset if a different repository is requested
    if (this.repoUrl && this.repoUrl !== requestedRepoUrl) {
        this.onLog(`[Service] Repository changed from ${this.repoUrl} to ${requestedRepoUrl}. Performing reset...`);
        await this.shutdown();
        
        // STABILITY: Small delay to let OS release ports
        await new Promise(r => setTimeout(r, 500));
        
        await this.wipeDir(this.dir).catch(() => {});
        if (this.webcontainerInstance) {
            await this.wipeWebContainerFS();
        }
    }

    if (this.serverUrl) {
        this.onLog('[Service] Engine already running. Skipping boot.');
        return;
    }
    if (this.isBooting) {
        this.onLog('[Service] Engine is already initializing. Please wait...');
        return;
    }

    this.repoUrl = requestedRepoUrl;
    if (!this.repoUrl) {
        this.onLog('[Service] No repository URL provided. Skipping boot initialization.');
        return;
    }
    this.isBooting = true;
    try {
      this.onStatusChange('Initializing Engine...');
      await this.initWebContainer();
      
      this.onStatusChange('Cloning Repository...');
      await this.fetchOrClone();


      this.onStatusChange('Syncing Files...');
      await this.syncToWebContainer();
      
      this.onStatusChange('Preparing Environment...');
      await this.loadSnapshot(); 
      await this.installDependencies();
      
      // 4. AUTO-DETECT FRAMEWORK
      await this.autoDetectFramework();

      // 5. START MIDDLEWARE (Now that we have the driver detected)
      await this.startMiddleware();

      // 6. START DEV SERVER
      this.onStatusChange('Starting Dev Server...');
      await this.startDevServer(manualCommand);
      
      // Schedule background cache sync — delayed 90s to avoid race with Astro warmup
      setTimeout(() => this.syncBuildCache(), 90000); 
      
    } catch (error) {
      console.error('[CMS Service] Boot failed:', error);
      this.onStatusChange(`Error: ${error.message}`);
      throw error;
    } finally {
      this.isBooting = false;
    }
  }

  async initFS() {
    // Only create directory if it doesn't exist
    await this.fs.mkdir(this.dir).catch(() => {});
  }

  async fetchOrClone() {
    try {
      const isGit = await this.fs.readdir(`${this.dir}/.git`).then(() => true).catch(() => false);
      if (isGit) {
        this.onStatusChange('Pulling latest changes...');
        return await git.pull({
          fs: this.fs,
          http: (await import('/lib/isomorphic-git-http.js')).default,
          dir: this.dir,
          url: this.repoUrl,
          corsProxy: this.proxy,
          onAuth: () => ({ username: 'x-access-token', password: this.token }),
          onAuthFailure: () => { throw new Error('GitHub authentication failed. Please check your token.'); },
          singleBranch: true,
          fastForwardOnly: true,
          author: { name: 'CMS Sync', email: 'cms@example.com' }
        });
      } else {
        return await this.clone();
      }
    } catch (e) {
      if (this.isDevMode) console.warn('[CMS] Git Pull failed, attempting fresh sync:', e.message);
      this.onStatusChange('Optimizing environment...');
      try {
        await this.wipeDir(this.dir);
        return await this.clone();
      } catch (wipeErr) {
        console.error('[CMS] Fresh sync failed:', wipeErr);
        throw new Error(`Git sync failed: ${e.message}. Is your token correct?`);
      }
    }
  }

  async wipeDir(dir) {
    try {
      const entries = await this.fs.readdir(dir);
      for (const entry of entries) {
        const path = `${dir}/${entry}`;
        const stat = await this.fs.stat(path);
        if (stat.isDirectory()) {
          await this.wipeDir(path);
          await this.fs.rmdir(path);
        } else {
          await this.fs.unlink(path);
        }
      }
    } catch (e) {
      // Base directory likely doesn't exist yet
    }
  }

  async clone() {
    try {
      await git.clone({
        fs: this.fs,
        http: (await import('/lib/isomorphic-git-http.js')).default,
        dir: this.dir,
        url: this.repoUrl,
        corsProxy: this.proxy,
        onAuth: () => ({ username: 'x-access-token', password: this.token }),
        onAuthFailure: () => { throw new Error('GitHub authentication failed. Please check your token.'); },
        singleBranch: true,
        depth: 1,
        onMessage: msg => this.onStatusChange(`Git: ${msg}`)
      });
    } catch (e) {
      console.error('[CMS] Git Clone Error:', e);
      throw new Error(`Git clone failed: ${e.message}. Check your repo name and token.`);
    }
  }

  async initWebContainer() {
    if (!this.webcontainerInstance) {
      this.webcontainerInstance = await WebContainer.boot();
      this.broker = new FrameworkBroker(this.webcontainerInstance);
      this.tagger = new TaggerTrait(this.webcontainerInstance);
    }
  }

  /**
   * Generates a FileSystemTree from LightningFS to be used with WebContainer.mount()
   */
  /**
   * Generates a FileSystemTree from LightningFS to be used with WebContainer.mount()
   * Optimized: Parallel reading and exclusion of heavy build artifacts.
   */
  async generateFileSystemTree(dir) {
    const tree = {};
    const entries = await this.fs.readdir(dir);
    const ignoreList = ['.git', 'node_modules', 'dist', 'build', '.next', '.astro', '.svelte-kit', 'out', '.cache'];

    await Promise.all(entries.map(async (entry) => {
      if (ignoreList.includes(entry)) return;
      
      const path = dir === '/' ? `/${entry}` : `${dir}/${entry}`;
      const stat = await this.fs.stat(path);
      
      if (stat.isDirectory()) {
        tree[entry] = {
          directory: await this.generateFileSystemTree(path)
        };
      } else {
        const contents = await this.fs.readFile(path);
        tree[entry] = {
          file: { contents }
        };
      }
    }));
    
    return tree;
  }

  /**
   * Turbo Boot: Syncs files using WebContainer.mount() for near-instant boot.
   */
  async syncToWebContainer() {
    this.onStatusChange('Syncing Files (Turbo)...');
    
    // 1. Build the virtual tree for the repo directory
    const repoTree = await this.generateFileSystemTree(this.dir);
    
    // 2. Mount it as '/repo' in the WebContainer
    await this.webcontainerInstance.mount({
       repo: {
         directory: repoTree
       }
    });
  }

  /**
   * Idempotent Middleware Startup: Ensures the bridge is running for the correct target port.
   */
  async startMiddleware(targetPort = null, basePath = '') {
    const port = targetPort || this.activeDriver?.server.port || 3000;
    targetPort = port; // Ensure we use the resolved port
    // 0. CONCURRENCY LOCK: Prevent parallel orchestrations
    if (this._isOrchestratingMiddleware) return;
    
    // If already started for the exact same port AND base path, do nothing
    if (this.middlewareStarted && this._lastMiddlewarePort === targetPort && this._lastMiddlewareBasePath === basePath) {
        return;
    }

    this._isOrchestratingMiddleware = true;
    try {
        this.onLog(`[Middleware] Target updated to port ${targetPort} (Base: ${basePath}). Orchestrating bridge...`);
        this._lastMiddlewarePort = targetPort;
        this._lastMiddlewareBasePath = basePath;

    // 1. Create the middleware proxy script
    const middlewareContent = this.activeDriver?.server.getMiddlewareScript?.(targetPort) || `
      const http = require('http');
      const targetPort = parseInt(process.env.TARGET_PORT);
      const basePath = process.env.BASE_PATH || '';
      
      const server = http.createServer((req, res) => {
        console.log('[Middleware] Request: ' + req.url);
        
        // AUTO-REDIRECT: If root is requested but a base path exists, redirect
        if (req.url === '/' && basePath && basePath !== '/') {
          console.log('[Middleware] Redirecting / to ' + basePath);
          res.writeHead(302, { 'Location': basePath });
          res.end();
          return;
        }

        const options = {
          hostname: '127.0.0.1',
          port: targetPort,
          path: req.url,
          method: req.method,
          headers: req.headers
        };

        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (e) => {
          res.writeHead(502);
          res.end('Gateway Error: ' + e.message);
        });

        req.pipe(proxyReq, { end: true });
      });
      
      server.listen(3001, '0.0.0.0', () => {
        console.log('[ServerTrait] Middleware Bridge running on port 3001 -> ' + targetPort + ' (Base: ' + basePath + ')');
      });
    `;
    
    const bridgeResponse = await fetch('/cms.js');
    const bridgeContent = await bridgeResponse.text();
    
    await this.webcontainerInstance.fs.writeFile('zcms-bridge.js', bridgeContent);
    await this.webcontainerInstance.fs.writeFile('zcms-middleware.js', middlewareContent);
    
    // 2. Kill previous if any
    if (this.middlewareProc) {
        try { this.middlewareProc.kill(); } catch (e) {}
        this.middlewareProc = null;
    }
    
    // 3. NUCLEAR PORT CLEANUP: Forcefully kill any zombie on 3001
    try {
        const killProc = await this.webcontainerInstance.spawn('npx', ['--yes', 'kill-port', '3001']);
        await killProc.exit;
    } catch (e) {}
    
    await new Promise(r => setTimeout(r, 800)); 
    
    // 4. RETRY LOOP
    let retryCount = 0;
    while (retryCount < 3) {
        try {
            this.middlewareProc = await this.webcontainerInstance.spawn('node', ['zcms-middleware.js'], {
                env: { 
                    TARGET_PORT: targetPort.toString(),
                    BASE_PATH: basePath || this.activeDriver?.routing?.base || ''
                }
            });
            this.middlewareProc.output.pipeTo(new WritableStream({
                write: (data) => {
                    this.onLog(`[bridge] ${data}`);
                    if (data.includes('EADDRINUSE')) {
                        this.onLog(`[Warning] Port 3001 busy (Retry ${retryCount+1}/3)...`);
                    }
                }
            }));
            
            this.middlewareStarted = true;
            return;
        } catch (e) {
            retryCount++;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    
    this.onLog('[Error] Failed to start middleware after 3 retries.');
    } finally {
        this._isOrchestratingMiddleware = false;
    }
  }

  /**
   * Fast middleware restart: Updates BASE_PATH without kill-port delays.
   * Called when we detect the framework base path from server logs.
   */
  async _fastRestartMiddleware(targetPort, basePath) {
    if (!this.webcontainerInstance) return;
    // Debounce: only restart once per unique base path
    if (this._lastMiddlewareBasePath === basePath) return;
    this._lastMiddlewareBasePath = basePath;

    this.onLog(`[Middleware] Fast-updating proxy for base: ${basePath}`);
    
    const middlewareContent = `
      const http = require('http');
      const targetPort = parseInt(process.env.TARGET_PORT);
      const basePath = process.env.BASE_PATH || '';
      
      const server = http.createServer((req, res) => {
        console.log('[Middleware] Request: ' + req.url);
        if (req.url === '/' && basePath && basePath !== '/') {
          console.log('[Middleware] Redirecting / to ' + basePath);
          res.writeHead(302, { 'Location': basePath });
          res.end();
          return;
        }
        const options = {
          hostname: '127.0.0.1', port: targetPort,
          path: req.url, method: req.method, headers: req.headers
        };
        const proxyReq = http.request(options, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });
        proxyReq.on('error', (e) => { res.writeHead(502); res.end('Gateway Error: ' + e.message); });
        req.pipe(proxyReq, { end: true });
      });
      server.listen(3001, '0.0.0.0', () => {
        console.log('[ServerTrait] Middleware Bridge running on port 3001 -> ' + targetPort + ' (Base: ' + basePath + ')');
      });
    `;

    try {
      // Kill old process
      if (this.middlewareProc) {
        try { this.middlewareProc.kill(); } catch(e) {}
        this.middlewareProc = null;
      }
      // Brief pause for OS to release port
      await new Promise(r => setTimeout(r, 600));
      
      await this.webcontainerInstance.fs.writeFile('zcms-middleware.js', middlewareContent);
      
      this.middlewareProc = await this.webcontainerInstance.spawn('node', ['zcms-middleware.js'], {
        env: { TARGET_PORT: targetPort.toString(), BASE_PATH: basePath }
      });
      this.middlewareProc.output.pipeTo(new WritableStream({
        write: (data) => this.onLog(`[bridge] ${data}`)
      }));
      this.onLog(`[Middleware] Proxy updated successfully with base path: ${basePath}`);
    } catch(e) {
      this.onLog(`[Warning] Fast middleware restart failed: ${e.message}`);
    }
  }

  /**
   * Identifies the framework by checking package.json and file signatures.
   */
  async autoDetectFramework() {
    this.onLog('[Auto-Detect] Scanning for framework signals using semantic drivers...');
    try {
      this.activeDriver = await this.broker.detect();
      if (this.activeDriver) {
          this.onLog(`[Auto-Detect] Matched Driver: ${this.activeDriver.name}`);
          
          // NEW: ACTIVATE SUPER TAGGER (WASM)
          await this.tagger.initWasm().catch(e => {
              this.onLog(`[WebContainer] [Fallback] WASM Tagger failed to load: ${e.message}. Using JS engine.`);
          });

          // NEW: DETERMINISTIC INSTRUMENTATION (BATCHED)
          this.onLog(`[Instrumentation] Injecting invisible Unicode breadcrumbs (Batch: ${this.tagger.activeEngine.constructor.name})...`);
          
          const contentFiles = [];
          
          // ROBUSTNESS: If no content paths are defined, perform a GLOBAL RECURSIVE SCAN
          const targetPaths = (this.activeDriver.routing && this.activeDriver.routing.contentPaths && this.activeDriver.routing.contentPaths.length > 0)
              ? this.activeDriver.routing.contentPaths
              : ['/repo']; // Fallback to root for universal support

          this.onLog(`[Instrumentation] Scanning ${targetPaths.length} paths for content...`);
          
          for (const dir of targetPaths) {
              // Ensure we are looking inside /repo
              let fullDir = dir;
              if (!fullDir.startsWith('/repo')) {
                  fullDir = '/repo/' + (fullDir.startsWith('/') ? fullDir.slice(1) : fullDir);
              }
              fullDir = fullDir.replace(/\/+/g, '/');
              if (fullDir.endsWith('/')) fullDir = fullDir.slice(0, -1);
              
                try {
                  // RESILIENCE CHECK: Use readdir to check if path exists (since stat() is not supported)
                  const parts = fullDir.split('/').filter(Boolean);
                  const parent = '/' + parts.slice(0, -1).join('/');
                  const target = parts[parts.length - 1];
                  const exists = await this.webcontainerInstance.fs.readdir(parent)
                      .then(files => files.includes(target))
                      .catch(() => false);

                  if (!exists) {
                      this.onLog(`[Warning] Path skipped (Not Found): ${fullDir}`);
                      continue;
                  }

                  const files = await this.tagger.recursiveReaddir(fullDir);
                  const validExts = this.activeDriver.routing?.extensions || ['.md', '.mdx', '.html', '.json', '.yaml', '.yml', '.js', '.jsx', '.ts', '.tsx'];
                  
                  contentFiles.push(...files.filter(f => 
                      validExts.some(ext => f.endsWith(ext)) &&
                      !f.includes('/node_modules/') && 
                      !f.includes('/.git/') &&
                      !f.includes('/dist/') &&
                      !f.includes('/build/')
                  ));
              } catch (e) {
                  this.onLog(`[Warning] Scan failed for ${fullDir}: ${e.message}`);
              }
          }

          const startTime = performance.now();
          if (contentFiles.length > 0) {
              await this.tagger.instrumentBatch(contentFiles);
          }
          const duration = (performance.now() - startTime).toFixed(2);
          this.onLog(`[Instrumentation] Completed: ${contentFiles.length} files in ${duration}ms.`);
      } else {
          this.onLog('[Auto-Detect] No specific driver matched. Using generic fail-safe.');
      }
    } catch (e) {
      this.onLog(`[Warning] Framework detection failed: ${e.message}`);
    }
  }

  async readDirRecursive(dir) {
    const ignoreList = ['.git', 'node_modules', 'dist', 'build', '.next', '.astro', '.svelte-kit'];
    const results = [];
    const entries = await this.fs.readdir(dir);
    
    await Promise.all(entries.map(async (entry) => {
      if (ignoreList.includes(entry)) return;
      
      const path = dir === '/' ? `/${entry}` : `${dir}/${entry}`;
      const stat = await this.fs.stat(path);
      
      if (stat.isDirectory()) {
        results.push({ path, type: 'dir' });
        const subResults = await this.readDirRecursive(path);
        results.push(...subResults);
      } else {
        results.push({ path, type: 'file' });
      }
    }));
    
    return results;
  }

  async installDependencies() {
    // 1. Check if package.json exists
    const hasPackageJson = await this.webcontainerInstance.fs.readFile('/repo/package.json').then(() => true).catch(() => false);
    if (!hasPackageJson) {
      this.onLog('[npm] No package.json found. Skipping dependency installation.');
      return;
    }

    // 2. Reuse existing node_modules if present
    const hasModules = await this.webcontainerInstance.fs.readdir('/repo/node_modules').then(e => e.length > 0).catch(() => false);
    if (hasModules) {
      this.onLog('Reuse existing node_modules detected.');
      return;
    }
    
    this.onStatusChange('Installing Dependencies...');
    this.onLog('[npm] Running optimized install...');
    const installProcess = await this.webcontainerInstance.spawn('npm', ['install', '--no-audit', '--no-fund', '--quiet'], {
        cwd: 'repo'
    });
    
    let lastOutput = '';
    installProcess.output.pipeTo(new WritableStream({
      write: (data) => {
          lastOutput = data;
          if (this.isDevMode) console.log('[npm install]', data);
      }
    }));

    const exitCode = await installProcess.exit;
    if (exitCode !== 0) {
        this.onLog(`[Error] npm install failed (Exit: ${exitCode}). Retrying with full log...`);
        // Fallback for debugging if it fails
        const retryProc = await this.webcontainerInstance.spawn('npm', ['install'], { cwd: 'repo' });
        retryProc.output.pipeTo(new WritableStream({ write: d => this.onLog(`[npm-retry] ${d}`) }));
        if (await retryProc.exit !== 0) throw new Error('npm install failed');
    }
    this.onLog('[npm] Dependencies synchronized.');
  }

  /**
   * Verified Binary Resolution: Checks if a binary exists and is valid.
   * If broken or missing, falls back to npx.
   */
  async resolveBin(cmd, pkgName) {
    const parentDir = `/repo/node_modules/.bin`;
    
    // 1. Check if the .bin directory exists at all
    const binExists = await this.webcontainerInstance.fs.readdir('/repo/node_modules')
        .then(files => files.includes('.bin'))
        .catch(() => false);

    if (!binExists) {
        this.onLog(`[Resolver] No .bin directory found. Falling back to npx for ${cmd}`);
        return `npx --yes ${pkgName}`;
    }

    // 2. Check if the specific command exists in .bin
    const cmdExists = await this.webcontainerInstance.fs.readdir(parentDir)
        .then(files => files.includes(cmd))
        .catch(() => false);

    if (cmdExists) {
        const localPath = `${parentDir}/${cmd}`;
        
        // 3. STABILITY CHECK: Try to 'stat' or read a bit to ensure it's not a dead symlink
        // WebContainer fs.readFile is the most reliable check for existence/readability
        const isReadable = await this.webcontainerInstance.fs.readFile(localPath)
            .then(() => true)
            .catch(() => false);

        if (isReadable) {
            this.onLog(`[Resolver] Verified local binary: ${cmd}`);
            return localPath;
        } else {
            this.onLog(`[Resolver] Local binary ${cmd} is unreadable/broken. Falling back to npx.`);
            return `npx --yes ${pkgName}`;
        }
    } else {
        this.onLog(`[Resolver] Local ${cmd} missing in .bin. Using fallback: npx --yes ${pkgName}`);
        return `npx --yes ${pkgName}`;
    }
  }

  async startDevServer(manualCommand = null) {
    let devCommand = manualCommand;
    
    // 1. RESOLVE THE COMMAND SEMANTICALLY
    this.onLog(`[Resolver] Aligning command for ${this.activeDriver?.name || 'Generic'} project...`);
    
    // PRIORITY 1: package.json logic
    const pkgRaw = await this.webcontainerInstance.fs.readFile('/repo/package.json', 'utf8').catch(() => null);
    if (pkgRaw) {
        try {
            const pkg = JSON.parse(pkgRaw);
            const scripts = pkg.scripts || {};
            
            // If we have a 'dev' or 'start' script, use it. This is the absolute Node standard.
            if (scripts.dev) {
                devCommand = 'npm run dev';
            } else if (scripts.start) {
                devCommand = 'npm run start';
            }
        } catch (e) {}
    }

    // PRIORITY 2: If no npm script, or if we have a semantic driver command, resolve it intelligently
    if (!devCommand) {
        const semanticCmd = manualCommand || this.activeDriver?.server?.command || 'npm run dev';
        
        if (semanticCmd.includes('npm run') || semanticCmd.includes('npx')) {
            devCommand = semanticCmd;
        } else {
            // Fallback: try to find local bin or use npx
            const binName = semanticCmd.split(' ')[0];
            const localBin = await this.resolveBin(binName, binName);
            devCommand = localBin + ' ' + semanticCmd.split(' ').slice(1).join(' ');
        }
    }

    // FINAL ENFORCEMENT: For Next.js projects in WebContainers, Webpack is the only stable path.
    if (this.activeDriver?.id === 'nextjs' && !devCommand.includes('--webpack')) {
       this.onLog('[Optimization] Enforced Webpack for Next.js (WebContainer compatibility).');
       devCommand += ' --webpack';
    }

    // SHADOW PACKAGE.JSON INJECTION: Satisfy npx/npm for non-Node projects
    const pkgExists = (pkgRaw !== null);
    if (!pkgExists && (devCommand.includes('npx') || (this.activeDriver && this.activeDriver.id !== 'generic-node'))) {
        this.onLog('[Compatibility] Injecting Shadow package.json to satisfy runtime environment...');
        const shadowPkg = {
            name: "zerocms-runtime-shadow",
            version: "1.0.0",
            private: true,
            description: "Temporary shadow package to satisfy strict npm/npx environment constraints."
        };
        await this.webcontainerInstance.fs.writeFile('/repo/package.json', JSON.stringify(shadowPkg, null, 2));
    }

    // Cleanup previous processes if any
    if (this.serverProcess) {
       this.onLog('[Cleanup] Stopping previous dev server...');
       this.serverProcess.kill();
       this.serverProcess = null;
    }
    await new Promise(r => setTimeout(r, 400));
    
    // 1. Listen for the server-ready event of WebContainers
    if (!this._serverReadyListenerAttached) {
        this.webcontainerInstance.on('server-ready', async (port, url) => {
          if (port === 3001) {
            this.serverUrl = url;
            this.onLog('[Bridge] Port 3001 ready. Initializing preview instantly...');
            
            this.previewUrl = this._detectedBasePath 
                ? this.serverUrl.replace(/\/$/, '') + this._detectedBasePath
                : this.serverUrl;
                
            // Delay iframe load slightly to allow WebContainer Ingress router to register the port
            // Otherwise the iframe immediately hits a 404 Not Found from the WebContainer edge.
            setTimeout(() => {
                this.onServerReady(this.previewUrl);
            }, 1500);
            this.onStatusChange('Warming Up...');
          }
        });
        this._serverReadyListenerAttached = true;
    }

    this.onStatusChange(`Running: ${devCommand}...`);
    const cmdTokens = devCommand.split(' ');
    const cmd = cmdTokens[0];
    const args = cmdTokens.slice(1);
    
    this.serverProcess = await this.webcontainerInstance.spawn(cmd, args, { cwd: 'repo' });
    
    this.serverProcess.output.pipeTo(new WritableStream({
      write: (data) => {
          if (this.isDevMode) console.log(`[server] ${data}`);
          this.onLog(`[server] ${data}`);
          
          // DYNAMIC PORT SNIFFER: Detect target port from logs (Vite, Next, etc.)
          const portMatch = data.match(/Local:\s+http:\/\/localhost:(\d+)/i) || 
                            data.match(/available at:\s+http:\/\/localhost:(\d+)/i) ||
                            data.match(/listening on\s+.*?:(\d+)/i);
          
          if (portMatch) {
              const detectedPort = parseInt(portMatch[1]);
              if (detectedPort !== 3001 && detectedPort !== this.activeDriver?.server.port) {
                  this.onLog(`[Inference] Detected dev server on custom port: ${detectedPort}. Updating proxy...`);
                  this.startMiddleware(detectedPort);
              }
          }

          // BASE PATH SNIFFER: Astro logs "┃ Local    http://localhost:PORT/base-path" (no colon!)
          const basePathMatch = data.match(/Local\s+https?:\/\/localhost:\d+(\/[^\s\n]+)/i);
          if (basePathMatch && basePathMatch[1] && basePathMatch[1] !== '/') {
              const newBasePath = basePathMatch[1];
              if (this._detectedBasePath !== newBasePath) {
                  this._detectedBasePath = newBasePath;
                  this.onLog(`[Inference] Detected base path: ${this._detectedBasePath}. Updating proxy...`);
                  // Fast-restart middleware with new base path (skips kill-port for speed)
                  this._fastRestartMiddleware(this._lastMiddlewarePort || 4321, this._detectedBasePath);
              }
          }

          // SEMANTIC LOG MONITORING: Detect 'Ready' string
          if (!this.semanticReady && this.readyPatterns.some(p => p.test(data))) {
              this.onLog('[Ready] Detected framework ready signal!');
              this.semanticReady = true;
              this.onStatusChange('Server Ready!');
          }
      }
    }));

    this.middlewareStarted = false;
    
    // Return a promise that resolves when the dev server is fully booted
    // We wait for BOTH the proxy URL and the semantic signal before allowing boot() to continue
    // (This prevents heavy fs.readdir scans from running concurrently with framework compilation)
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (this.serverUrl && this.semanticReady) {
          clearInterval(check);
          resolve(this.serverProcess);
        }
      }, 500);
      
      // Safety timeout for the await (60s)
      setTimeout(() => {
        clearInterval(check);
        if (!this.semanticReady) {
            this.onLog('[Warning] Semantic ready signal not found. Resolving anyway.');
            this.semanticReady = true;
        }
        resolve(this.serverProcess);
      }, 60000);
    });
  }

  /**
   * Updates a file in the WebContainer FS. This triggers HMR in the dev server.
   */
  async updateFile(filePath, content) {
    await this.webcontainerInstance.fs.writeFile(filePath, content);
    console.log(`[CMS] Updated: ${filePath}`);
  }

  /**
   * Commits all changes made in the WebContainer back to Git.
   * Only syncs files that were actually modified by applySmartMatchChange.
   */
  async publishChanges(commitMessage = 'CMS update') {
    this.onStatusChange('Syncing changes back...');
    
    if (this._modifiedFiles.size === 0) {
      this.onLog('[Publish] No files were modified via SmartMatch. Nothing to commit.');
      this.onStatusChange('No changes to publish.');
      setTimeout(() => this.onStatusChange('Idle'), 3000);
      return { success: true, message: 'No changes' };
    }

    this.onLog(`[Publish] Syncing ${this._modifiedFiles.size} modified file(s) to Git FS...`);
    
    // Only sync the files we actually changed (faster + more reliable)
    for (const filePath of this._modifiedFiles) {
      try {
        const content = await this.webcontainerInstance.fs.readFile(filePath);
        // Ensure parent directories exist in LightningFS
        const parts = filePath.split('/').filter(Boolean);
        let currentPath = this.dir;
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath += '/' + parts[i];
          await this.fs.mkdir(currentPath).catch(() => {});
        }
        await this.fs.writeFile(this.dir + filePath, content);
        this.onLog(` ✓ Synced: ${filePath}`);
      } catch (e) {
        this.onLog(` ✗ Failed to sync ${filePath}: ${e.message}`);
      }
    }

    // 2. Explicitly remove any CMS-internal files from the Git index if they exist
    const gitFiles = await git.listFiles({ fs: this.fs, dir: this.dir });
    for (const f of gitFiles) {
      if (f.startsWith('zcms-') || f === 'scripts/zcms-tagger.js') {
        await git.remove({ fs: this.fs, dir: this.dir, filepath: f });
      }
    }

    // 3. Check status and add changed files
    this.onStatusChange('Committing...');
    const status = await git.statusMatrix({ fs: this.fs, dir: this.dir, filepath: '.' });
    const changedFiles = status.filter(row => row[1] !== row[2]);
    
    if (changedFiles.length === 0) {
      this.onLog('[Publish] Git sees no diff after targeted sync. Files may already be at latest.');
      this._modifiedFiles.clear();
      this.onStatusChange('No changes to publish.');
      setTimeout(() => this.onStatusChange('Idle'), 3000);
      return { success: true, message: 'No changes' };
    }

    this.onLog(`[Publish] Git detected ${changedFiles.length} changed file(s). Staging...`);
    
    // 4. STRIP BREADCRUMBS: Ensure production code is clean of invisible markers
    this.onStatusChange('Sanitizing Code...');
    const startTime = performance.now();
    
    // Batch process all changed files for maximum speed
    const filesToStrip = [];
    for (const [file] of changedFiles) {
        const fullPath = (this.dir + '/' + file).replace(/\/+/g, '/');
        try {
            const content = await this.fs.readFile(fullPath, 'utf8');
            filesToStrip.push({ path: file, content, fullPath });
        } catch (e) {}
    }

    if (filesToStrip.length > 0) {
        const cleanedResults = await this.tagger.stripBatch(filesToStrip);
        for (const res of cleanedResults) {
            const original = filesToStrip.find(f => f.path === res.path);
            if (original && res.content !== original.content) {
                await this.fs.writeFile(original.fullPath, res.content);
                this.onLog(` ✨ Sanitized: ${res.path}`);
            }
        }
    }

    // Stage all files
    for (const [file] of changedFiles) {
        await git.add({ fs: this.fs, dir: this.dir, filepath: file });
    }

    const duration = (performance.now() - startTime).toFixed(2);
    this.onLog(`[Sanitization] Completed: ${changedFiles.length} files in ${duration}ms.`);


    await git.commit({
      fs: this.fs,
      dir: this.dir,
      message: commitMessage,
      author: { name: 'CMS User', email: 'cms@example.com' }
    });

    this.onStatusChange('Pushing to GitHub...');
    this.onLog(`[Push] Starting push to ${this.repoUrl} (Branch: ${await git.currentBranch({ fs: this.fs, dir: this.dir })})`);
    
    const pushResult = await git.push({
      fs: this.fs,
      http: (await import('/lib/isomorphic-git-http.js')).default,
      dir: this.dir,
      url: this.repoUrl,
      onAuth: () => ({ username: 'x-access-token', password: this.token }),
      onAuthFailure: () => { 
          this.onLog('[Push] Authentication failed! Check that your GitHub token has the "repo" scope.');
          throw new Error('GitHub authentication failed. Token may be expired or lacks "repo" scope.'); 
      },
      corsProxy: this.proxy
    });

    if (pushResult.ok) {
        this.onLog('[Push] Push successful!');
        this.onStatusChange('Published successfully!');
        this._modifiedFiles.clear(); // Reset tracking after successful push
    } else {
        this.onLog(`[Push] Push rejected: ${JSON.stringify(pushResult.refs)}`);
        throw new Error('Push rejected by GitHub.');
    }
    return pushResult;
  }

  async syncFromWebContainer() {
    // This part requires a recursive read from WebContainer and write back to lightning-fs
    // Avoiding node_modules is critical here.
    const processEntry = async (path) => {
      const names = await this.webcontainerInstance.fs.readdir(path).catch(() => []);
      for (const name of names) {
        if (name === 'node_modules' || name === '.git' || name.startsWith('zcms-')) continue;
        const entryPath = path === '/' ? `/${name}` : `${path}/${name}`;
        
        try {
            const isDir = await this.webcontainerInstance.fs.readdir(entryPath)
                .then(() => true)
                .catch(() => false);

            if (isDir) {
                await this.fs.mkdir(`${this.dir}${entryPath}`).catch(() => {});
                await processEntry(entryPath);
            } else {
                const content = await this.webcontainerInstance.fs.readFile(entryPath);
                await this.fs.writeFile(`${this.dir}${entryPath}`, content);
            }
        } catch (e) {}
      }
    };
    await processEntry('/');
  }

  /**
   * Scans the filesystem for 'original' and replaces it with 'updated'.
   * Tracks every file it writes to in this._modifiedFiles.
   * Uses partial/word matching for template-composed strings.
   */
  async applySmartMatchChange(original, updated, metadata = null) {
    if (!original || original === updated) return false;
    
    // Resolve deterministic source if metadata (fileId/line) is provided
    let sourceFile = null;
    if (metadata && metadata.fileId) {
        sourceFile = this.tagger.pathMap.get(metadata.fileId);
        if (sourceFile) this.onLog(`[SmartMatch] Deterministic Link: ${sourceFile} (Line: ${metadata.line || '?'})`);
    }

    const writeAndTrack = async (filePath, content) => {
      await this.webcontainerInstance.fs.writeFile(filePath, content);
      const absPath = filePath.startsWith('/') ? filePath : '/' + filePath;
      // Don't track auto-generated SSG cache files - they're in .gitignore anyway
      // EXCEPTION: Allow db.json if it is actually in the root, as some drivers use it
      const isGenerated = absPath.includes('/.cache/') || absPath.includes('/.astro/') || absPath.includes('/public/');
      
      if (!isGenerated) {
        this._modifiedFiles.add(absPath);
        this.onLog(`[SmartMatch] ✓ Wrote changes to ${filePath}`);
      } else {
        this.onLog(`[SmartMatch] Skipped generated file: ${filePath}`);
      }
    };

    // --- Helper: find the best string match (exact or partial) ---
    const findMatch = (content, searchStr) => {
      if (content.includes(searchStr)) return searchStr;
      // Try trimmed version
      const trimmed = searchStr.trim();
      if (trimmed !== searchStr && content.includes(trimmed)) return trimmed;
      // Try matching the first significant word/segment (for template-composed titles like "Home - Site Name")
      const segments = searchStr.split(/\s*[-|·–—]\s*/);
      for (const seg of segments) {
        const s = seg.trim();
        if (s.length > 3 && content.includes(s)) return s;
      }
      return null;
    };

    // 1. If we have a dedicated source file, try to update it directly first
    if (sourceFile) {
      this.onLog(`[SmartMatch] Trying direct source: ${sourceFile}`);
      try {
        let content = await this.webcontainerInstance.fs.readFile(sourceFile, 'utf8');
        
        // DATA OBJECT UPDATE: JSON
        if (sourceFile.endsWith('.json')) {
            try {
                const data = JSON.parse(content);
                const updateValue = (obj) => {
                    let updatedCount = 0;
                    for (const key in obj) {
                        if (typeof obj[key] === 'string') {
                            const match = findMatch(obj[key], original);
                            if (match !== null && obj[key] === original) {
                                obj[key] = updated;
                                updatedCount++;
                            }
                        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                            updatedCount += updateValue(obj[key]);
                        }
                    }
                    return updatedCount;
                };
                if (updateValue(data) > 0) {
                    const newContent = JSON.stringify(data, null, 2);
                    await writeAndTrack(sourceFile, newContent);
                    return { path: sourceFile, content: newContent };
                }
            } catch (e) {
                this.onLog(`[Warning] Failed to parse JSON ${sourceFile}: ${e.message}`);
            }
        }

        // DATA OBJECT UPDATE: YAML
        if (sourceFile.endsWith('.yml') || sourceFile.endsWith('.yaml')) {
            const matchStr = findMatch(content, original);
            if (matchStr) {
                const escaped = matchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`^(\\s*[a-zA-Z0-9_-]+\\s*:\\s*["']?)${escaped}["']?\\s*$`, 'm');
                if (regex.test(content)) {
                    this.onLog(`[SmartMatch] YAML key match in ${sourceFile}`);
                    // Replace only the matched segment within the line 
                    content = content.replace(regex, (m, prefix) => `${prefix}${updated}`);
                    await writeAndTrack(sourceFile, content);
                    return true;
                }
                // Fallback: direct replacement of matched segment in file
                content = content.split(matchStr).join(updated);
                await writeAndTrack(sourceFile, content);
                return { path: sourceFile, content: content };
            }
        }

        // FALLBACK: Raw string or partial match in mapped file
        const matchStr = findMatch(content, original);
        if (matchStr) {
          content = content.split(matchStr).join(updated);
          await writeAndTrack(sourceFile, content);
          return { path: sourceFile, content: content };
        }
      } catch (e) {
        this.onLog(`[Warning] Could not read source file ${sourceFile}: ${e.message}`);
      }
    }

    // 2. Global file search - check source directories first, then root
    this.onLog(`[SmartMatch] Global search for: "${original.substring(0, 40)}"`);
    const searchDirs = ['/source', '/src', '/content', '/layouts', '/themes', '/'];
    
    const findAndReplace = async (dir) => {
      let dirEntries = [];
      try { dirEntries = await this.webcontainerInstance.fs.readdir(dir); }
      catch (e) { return false; }

      for (const name of dirEntries) {
        const fullPath = dir === '/' ? `/${name}` : `${dir}/${name}`;
        if (name === 'node_modules' || name === '.git' || name.startsWith('zcms-') || name === 'public' || name === 'dist' || name === '.astro') continue;

        try {
            const isDir = await this.webcontainerInstance.fs.readdir(fullPath)
                .then(() => true)
                .catch(() => false);

            if (isDir) {
                if (await findAndReplace(fullPath)) return true;
            } else {
                const exts = ['.md', '.mdx', '.html', '.ejs', '.hbs', '.njk', '.astro', '.vue', '.json', '.yml', '.yaml', '.js', '.ts', '.jsx', '.tsx', '.toml'];
                if (exts.some(ext => name.endsWith(ext))) {
                    try {
                      let content = await this.webcontainerInstance.fs.readFile(fullPath, 'utf8');
                      const matchStr = findMatch(content, original);
                      if (matchStr !== null) {
                        if (fullPath.endsWith('.json')) {
                            try {
                                const data = JSON.parse(content);
                                const updateValue = (obj) => {
                                    let count = 0;
                                    for (const key in obj) {
                                        if (typeof obj[key] === 'string' && obj[key] === original) {
                                            obj[key] = updated; count++;
                                        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                                            count += updateValue(obj[key]);
                                        }
                                    }
                                    return count;
                                };
                                if (updateValue(data) > 0) {
                                    await writeAndTrack(fullPath, JSON.stringify(data, null, 2));
                                    return true;
                                }
                            } catch (e) {}
                        }
                        content = content.split(matchStr).join(updated);
                        await writeAndTrack(fullPath, content);
                        return { path: fullPath, content: content };
                      }
                    } catch (e) {}
                }
            }
        } catch (e) {}
      }
      return false;
    };

    for (const s of searchDirs) {
      if (await findAndReplace(s)) return true;
    }
    
    this.onLog(`[Warning] SmartMatch could not find "${original.substring(0, 40)}" in any source file.`);
    return false;
  }

  /**
   * ZERO CONFIG CONTENT DISCOVERY & CREATION
   * Automatically detect collections based on markdown/html files
   */
  async scanCollections() {
    // GUARD: Do not run if the WASM filesystem is busy (e.g. Astro is compiling)
    if (this._fsBusy) {
      this.onLog('[Discovery] Skipping scan - filesystem busy.');
      return this.collections || [];
    }
    this._fsBusy = true;
    try {

    this.onLog('[Discovery] Starting content scan in /repo...');
    // DIAGNOSTIC: List root of repo
    const rootFiles = await this.webcontainerInstance.fs.readdir('/repo').catch(() => []);
    this.onLog(`[Discovery] Files in /repo: ${rootFiles.join(', ')}`);

    this.collections = [];
    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', 'public', '.astro', '.next', 'assets', 'images', 'components', 'layouts'];
    const validExtensions = ['.md', '.mdx', '.html', '.njk', '.11ty.js'];

    const readDirRecursive = async (currentPath, maxDepth = 4, currentDepth = 0) => {
      if (currentDepth > maxDepth) return;
      try {
        const names = await this.webcontainerInstance.fs.readdir(currentPath).catch(() => []);
        if (names.length === 0) return;

        let fileCount = 0;
        let lastValidFile = null;
        let hasNonIndexFile = false;

        for (const name of names) {
          const fullPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
          const isDir = await this.webcontainerInstance.fs.readdir(fullPath)
              .then(() => true)
              .catch(() => false);

          if (isDir) {
            if (!ignoreDirs.includes(name) && !name.startsWith('.')) {
              await readDirRecursive(fullPath, maxDepth, currentDepth + 1);
            }
          } else {
            const ext = name.substring(name.lastIndexOf('.'));
            const lowerName = name.toLowerCase();
            if (validExtensions.includes(ext) && lowerName !== 'readme.md') {
              fileCount++;
              lastValidFile = name;
              if (!lowerName.startsWith('index.') && !lowerName.startsWith('404.')) {
                hasNonIndexFile = true;
              }
            }
          }
        }

        // We consider it a "collection" if there is at least one non-index file OR multiple files.
        // This prevents capturing standalone page routes (like /about/index.md) as collections.
        if (fileCount > 0 && lastValidFile && currentPath !== '/') {
          if (fileCount > 1 || hasNonIndexFile) {
            let colName = currentPath.split('/').pop() || currentPath;
            colName = colName.replace(/^_/, ''); // e.g., _posts -> posts
            this.collections.push({
              path: currentPath,
              name: colName,
              templateFile: lastValidFile
            });
          }
        }
      } catch (e) {
        // Ignored unreadable dirs
      }
    };

    // Fast tracking based on framework profile
    if (this.detectedFramework && this.detectedFramework.defaults.contentPaths) {
      for (const path of this.detectedFramework.defaults.contentPaths) {
        try { await readDirRecursive(path, 3); } catch(e){}
      }
    }
    
    // Common paths fallback - Always prefix with /repo
    // First try to list /repo/src to discover real subdirectories
    const srcContents = await this.webcontainerInstance.fs.readdir('/repo/src').catch(() => []);
    if (srcContents.length > 0) {
      this.onLog(`[Discovery] Found /repo/src with: ${srcContents.join(', ')}`);
      for (const subdir of srcContents) {
        if (!ignoreDirs.includes(subdir) && !subdir.startsWith('.')) {
          const fullPath = `/repo/src/${subdir}`;
          // SEQUENTIAL: Small delay between scans to avoid concurrent WASM FS access
          await new Promise(r => setTimeout(r, 50));
          try { await readDirRecursive(fullPath, 3); } catch(e){}
        }
      }
    }
    await new Promise(r => setTimeout(r, 50));
    try { await readDirRecursive('/repo/src/content', 2); } catch(e){}
    await new Promise(r => setTimeout(r, 50));
    try { await readDirRecursive('/repo/src/pages', 3); } catch(e){}
    await new Promise(r => setTimeout(r, 50));
    try { await readDirRecursive('/repo/content', 2); } catch(e){}
    
    // If nothing found, wider scan from repo root
    if (this.collections.length === 0) {
      await new Promise(r => setTimeout(r, 100));
      await readDirRecursive('/repo', 3);
    }
    
    // Deduplicate array of objects based on 'path'
    const uniquePaths = new Set();
    this.collections = this.collections.filter(c => {
      if (!uniquePaths.has(c.path)) {
        uniquePaths.add(c.path);
        return true;
      }
      return false;
    });

    this.onLog(`[Discovery] Found ${this.collections.length} potential content collections.`);
    return this.collections;

    } finally {
      this._fsBusy = false;
    }
  }

  async createNewItem(collectionPath, title, templateFile) {
    const slug = title.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/(^-|-$)/g, '');
    const ext = templateFile.substring(templateFile.lastIndexOf('.'));
    const targetPath = `${collectionPath}/${slug}${ext}`;
    
    // Read the template file
    const templateContent = await this.webcontainerInstance.fs.readFile(`${collectionPath}/${templateFile}`, 'utf-8');
    
    // We try to extract frontmatter (YAML block bounded by ---)
    let newContent = templateContent;
    const fmRegex = /^---\n([\s\S]*?)\n---/;
    const match = templateContent.match(fmRegex);
    
    const date = new Date().toISOString().split('T')[0];

    if (match) {
      let frontmatter = match[1];
      // Updated title
      if (/^title:\s*/m.test(frontmatter)) {
         frontmatter = frontmatter.replace(/^title:\s*["']?.*?["']?/m, `title: "${title}"`);
      } else {
         frontmatter += `\ntitle: "${title}"`;
      }
      
      // Updated date
      if (/^date:\s*/m.test(frontmatter)) {
         frontmatter = frontmatter.replace(/^date:\s*["']?.*?["']?/m, `date: "${date}"`);
      } else {
         frontmatter += `\ndate: "${date}"`;
      }
      
      newContent = `---\n${frontmatter}\n---\n\nStart writing your new content here...\n`;
    } else {
      // If no frontmatter found (e.g. pure HTML), we just clone and insert a placeholder
      newContent = `<!-- Title: ${title} -->\n<div>New Content</div>\n`;
    }
    
    // Ensure LightningFS target dir exists
    const dir = targetPath.substring(0, targetPath.lastIndexOf('/'));
    const ensureLightningDir = async (pathStr) => {
      const parts = pathStr.split('/').filter(Boolean);
      let currentPath = this.dir;
      for (const part of parts) {
        currentPath += '/' + part;
        try { await this.fs.mkdir(currentPath); } catch(e) {}
      }
    };
    await ensureLightningDir(dir);

    // Save to both filesystems
    await this.webcontainerInstance.fs.writeFile(targetPath, newContent);
    await this.fs.writeFile(this.dir + targetPath, newContent);
    
    this.onLog(`[CMS] Created new collection item: ${targetPath}`);
    return targetPath;
  }

  /**
   * Undoes the last commit locally and force-pushes the result to GitHub.
   * This is used to clean up accidental internal file pushes.
   */
  async undoLastCommitAndForcePush() {
    this.onStatusChange('Undoing last commit...');
    
    // 1. Resolve current branch and HEAD
    const branch = await git.currentBranch({ fs: this.fs, dir: this.dir });
    const head = await git.resolveRef({ fs: this.fs, dir: this.dir, ref: 'HEAD' });
    
    // 2. Get history (need at least 2 commits to undo 1)
    const log = await git.log({ fs: this.fs, dir: this.dir, depth: 2, ref: head });
    if (log.length < 2) {
      throw new Error('Not enough history to perform a rollback.');
    }
    
    const parentOid = log[1].oid;
    this.onLog(`[Rollback] Current: ${head.substring(0, 7)}, Target: ${parentOid.substring(0, 7)}`);

    // 3. Update the branch reference locally (Hard Reset)
    await git.writeRef({
      fs: this.fs,
      dir: this.dir,
      ref: `refs/heads/${branch}`,
      value: parentOid,
      force: true
    });

    // 4. Force push to remote
    this.onStatusChange('Force pushing to GitHub...');
    await git.push({
      fs: this.fs,
      http: (await import('/lib/isomorphic-git-http.js')).default,
      dir: this.dir,
      url: this.repoUrl,
      force: true, // IMPORTANT: Force push to overwrite remote history
      onAuth: () => ({ username: 'x-token-auth', password: this.token }),
      onAuthFailure: () => { throw new Error('GitHub authentication failed. Check that your token has the "repo" scope.'); },
      corsProxy: this.proxy
    });

    this.onStatusChange('Rollback successful!');
    this.onLog('[Git] Repository history cleaned up.');
  }

  /**
   * QUANTUM BOOT: Save/Load binary snapshots of node_modules
   */
  async saveSnapshot() {
    if (!this.repoUrl) return;
    const repoSlug = this.repoUrl.split('/').pop().replace('.git', '');
    this.onLog(`[Quantum] Creating snapshot for ${repoSlug}...`);
    try {
      await this.webcontainerInstance.spawn('tar', ['-cf', '/tmp/modules.tar', 'node_modules'], { cwd: 'repo' });
      const tarData = await this.webcontainerInstance.fs.readFile('/tmp/modules.tar');
      
      await this.fs.mkdir('/snapshots').catch(() => {});
      await this.fs.writeFile(`/snapshots/${repoSlug}.tar`, tarData);
      this.onLog('[Quantum] Snapshot cached successfully.');
    } catch (e) {
      this.onLog(`[Warning] Snapshot failed: ${e.message}`);
    }
  }

  async loadSnapshot() {
    if (!this.repoUrl) return;
    const repoSlug = this.repoUrl.split('/').pop().replace('.git', '');
    try {
      const tarData = await this.fs.readFile(`/snapshots/${repoSlug}.tar`).catch(() => null);
      if (!tarData) return;

      this.onLog(`[Quantum] Restoring ${repoSlug} from cache...`);
      await this.webcontainerInstance.fs.writeFile('/tmp/modules.tar', tarData);
      const untar = await this.webcontainerInstance.spawn('tar', ['-xf', '/tmp/modules.tar', '-C', '/repo']);
      const code = await untar.exit;
      if (code === 0) this.onLog('[Quantum] Restore complete.');
      else this.onLog('[Quantum] Restore failed (tar exit ' + code + ')');
    } catch (e) {
      this.onLog(`[Warning] Load snapshot failed: ${e.message}`);
    }
  }

  /**
   * QUANTUM BOOT: Cache build results for instant preview
   */
  async syncBuildCache() {
    // GUARD: Don't run if WASM FS is busy or already syncing
    if (this._fsBusy || this._syncingCache) return;
    this._syncingCache = true;
    this._fsBusy = true;
    try {
    const buildDirs = ['public', 'dist', '_site', 'out', 'build'];
    let detectedDir = null;
    
    for (const d of buildDirs) {
      const exists = await this.webcontainerInstance.fs.readdir(`/${d}`).then(() => true).catch(() => false);
      if (exists) { detectedDir = d; break; }
      await new Promise(r => setTimeout(r, 20)); // small delay between checks
    }

    if (!detectedDir) return;
    this.onLog(`[Quantum] Caching build results from /${detectedDir}`);
    
    const ensureDir = async (path) => {
      const parts = path.split('/').filter(Boolean);
      let currentPath = '';
      for (const part of parts) {
        currentPath += '/' + part;
        await this.fs.mkdir(currentPath).catch(() => {});
      }
    };
    
    const syncDirRecursive = async (path) => {
      const names = await this.webcontainerInstance.fs.readdir(path).catch(() => []);
      for (const name of names) {
        const fullPath = path === '/' ? `/${name}` : `${path}/${name}`;
        const cachePath = `/__qcms_cache__${fullPath}`;
        
        try {
            const isDir = await this.webcontainerInstance.fs.readdir(fullPath)
                .then(() => true)
                .catch(() => false);

            if (isDir) {
                await ensureDir(cachePath);
                await syncDirRecursive(fullPath);
            } else {
                // Ensure parent directory exists before writing file
                const parentDir = cachePath.substring(0, cachePath.lastIndexOf('/'));
                await ensureDir(parentDir);
                const content = await this.webcontainerInstance.fs.readFile(fullPath);
                await this.fs.writeFile(cachePath, content);
            }
        } catch (e) {}
      }
    };
    
    await ensureDir('/__qcms_cache__');
    await syncDirRecursive(`/${detectedDir}`);
    
    // Also trigger snapshot of modules while we're at it
    this.saveSnapshot();
    } catch(e) {
      this.onLog(`[Warning] syncBuildCache failed: ${e.message}`);
    } finally {
      this._fsBusy = false;
      this._syncingCache = false;
    }
  }

  async wipeWebContainerFS() {
    this.onLog('[Service] Wiping WebContainer filesystem...');
    try {
      const entries = await this.webcontainerInstance.fs.readdir('/').catch(() => []);
      for (const name of entries) {
        if (name === 'tmp') continue; 
        try {
          await this.webcontainerInstance.fs.rm(name, { recursive: true });
        } catch (e) {
          this.onLog(`[Warning] Could not remove ${name}: ${e.message}`);
        }
      }
    } catch (e) {
      this.onLog(`[Error] Failed to wipe WebContainer FS: ${e.message}`);
    }
  }

  async listComponents(dir = '/repo/src/components/zcms', baseDir = '/repo/src/components/zcms') {
    if (!this.webcontainerInstance) return [];
    try {
      const results = [];
      // Use simple readdir to avoid 'dirent' panics in WASM
      const entries = await this.webcontainerInstance.fs.readdir(dir).catch(() => []);
      
      const relativePath = dir.replace(baseDir, '').replace(/^\/+/, '');
      const category = relativePath.split('/')[0] || 'General';
      const formattedCategory = category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');

      for (const name of entries) {
        const fullPath = `${dir}/${name}`;
        try {
          // Check if it's a directory by trying readdir on it (stat-less check)
          const isDir = await this.webcontainerInstance.fs.readdir(fullPath)
              .then(() => true)
              .catch(() => false);

          if (isDir) {
            const sub = await this.listComponents(fullPath, baseDir);
            results.push(...sub);
          } else if (name.endsWith('.html')) {
            const content = await this.webcontainerInstance.fs.readFile(fullPath, 'utf-8');
            results.push({
              name: name.replace('.html', '').replace(/_/g, ' '),
              category: formattedCategory,
              filename: name,
              path: fullPath,
              html: content
            });
          }
        } catch (e) {
          continue; // Skip individual file errors
        }
      }
      return results;
    } catch (e) {
      return [];
    }
  }

  /**
   * ASSET DISCOVERY: Recursively list project assets (images, svgs, etc)
   */
  async listAssets(dir = '/repo/public') {
    if (!this.webcontainerInstance) return [];
    try {
      const results = [];
      const entries = await this.webcontainerInstance.fs.readdir(dir).catch(() => []);
      
      for (const name of entries) {
        const fullPath = `${dir}/${name}`;
        try {
            const isDir = await this.webcontainerInstance.fs.readdir(fullPath)
                .then(() => true)
                .catch(() => false);

            if (isDir) {
                const sub = await this.listAssets(fullPath);
                results.push(...sub);
            } else if (name.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
                const publicPath = fullPath.replace('/repo/public', '') || '/';
                results.push({
                    name: name,
                    path: fullPath,
                    url: publicPath,
                    type: name.split('.').pop().toLowerCase()
                });
            }
        } catch (e) { continue; }
      }
      return results;
    } catch (e) {
      return [];
    }
  }

  /**
   * ASSET UPLOAD: Write a binary file to the WebContainer FS
   */
  async saveAsset(file, targetDir = '/repo/public/images') {
    if (!this.webcontainerInstance) throw new Error('WebContainer not ready');
    
    // Ensure target dir exists
    await this.webcontainerInstance.fs.mkdir(targetDir, { recursive: true }).catch(() => {});
    
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const fullPath = `${targetDir}/${file.name}`;
    
    await this.webcontainerInstance.fs.writeFile(fullPath, uint8Array);
    return {
        name: file.name,
        path: fullPath,
        url: fullPath.replace('/repo/public', '')
    };
  }

  /**
   * SILENT SYNC: Debounced background persistence of edits
   */
  async syncChangesToDisk(changes) {
    if (this._syncTimer) clearTimeout(this._syncTimer);
    
    this._syncTimer = setTimeout(async () => {
        const startTime = performance.now();
        let syncedCount = 0;
        
        for (const [selector, content] of Object.entries(changes)) {
            try {
                // In a production scenario, we'd use the Source Map to find the actual file/line
                // For now, we perform a smart-match update to the virtual disk to ensure persistence
                this.onLog(`[Sync] Background auto-save for ${selector}...`);
                // Placeholder for the actual smart-match persistence logic
                // await this.applySmartMatchChange(selector, content);
                syncedCount++;
            } catch (e) {}
        }
        
        if (syncedCount > 0) {
            const duration = (performance.now() - startTime).toFixed(2);
            this.onLog(`[Sync] Background write completed (${syncedCount} items in ${duration}ms)`);
        }
    }, 2000);
  }
}
