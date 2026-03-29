import git from '/lib/isomorphic-git.js';
import FS from '/lib/lightning-fs.js';
import { WebContainer } from '/lib/webcontainer-api.js';

/**
 * WebContainerGitService
 * Orchestrates Git operations in browser-persistent storage and 
 * runs a development environment using WebContainers.
 */
export class WebContainerGitService {
  constructor(config = {}) {
    this.repoUrl = config.repoUrl;
    this.dir = config.dir || '/repo';
    
    // Automatically use the fast local git proxy to preserve Auth headers securely
    const isLocalServer = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    this.proxy = config.proxy || (isLocalServer ? window.location.origin + '/git-proxy' : 'https://cors.isomorphic-git.org');
    
    this.token = config.token;
    
    this.config = config;
    this.fs = new FS('cms-fs').promises;
    this.webcontainerInstance = null;
    this.serverUrl = null;
    
    // Callbacks for UI updates
    this.onStatusChange = config.onStatusChange || (() => {});
    this.onServerReady = config.onServerReady || (() => {});
    this.onLog = config.onLog || ((msg) => console.log(`[WC-Log] ${msg}`));
    
    this.isBooting = false;
    this.isDevMode = false;
    this.serverProcess = null;
    this.middlewareProc = null;
  }

  /**
   * Initialize the entire pipeline: Git -> WebContainer -> Dev Server
   */
  async boot(manualCommand = null) {
    if (this.serverUrl) {
        this.onLog('[Service] Engine already running. Skipping boot.');
        return;
    }
    if (this.isBooting) {
        this.onLog('[Service] Engine is already initializing. Please wait...');
        return;
    }
    this.isBooting = true;
    try {
      this.onStatusChange('Initializing FileSystem...');
      const fsExists = await this.fs.readdir(this.dir).then(e => e.length > 0).catch(() => false);
      
      // Start WebContainer and Git Fetching in Parallel
      const [container, gitResult] = await Promise.all([
        this.initWebContainer(),
        this.fetchOrClone()
      ]);

      this.onStatusChange('Syncing Files...');
      await this.syncToWebContainer();
      
      this.onStatusChange('Preparing Environment...');
      await this.loadSnapshot(); // Restore node_modules snapshot if available
      await this.installDependencies();
      
      this.onStatusChange('Starting Dev Server...');
      await this.startDevServer(manualCommand);
      
      // Schedule background cache sync
      setTimeout(() => this.syncBuildCache(), 5000); 
      
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
          onAuth: () => ({ username: this.token }),
          singleBranch: true,
          fastForwardOnly: true,
          author: { name: 'CMS Sync', email: 'cms@example.com' }
        });
      } else {
        this.onStatusChange('Cloning Repository...');
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
        onAuth: () => ({ username: this.token }),
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
    }
  }

  /**
   * Syncs files from lightning-fs (browser persistence) to WebContainer FS (WASM runtime)
   */
  async syncToWebContainer() {
    const files = await this.readDirRecursive(this.dir);
    
    // 1. Create all directories first (sequential to ensure order)
    for (const file of files) {
      if (file.type === 'dir') {
        const relativePath = file.path.replace(this.dir, '');
        if (relativePath) {
          await this.webcontainerInstance.fs.mkdir(relativePath, { recursive: true });
        }
      }
    }
    
    // 2. Write all files in parallel
    const fileWrites = files
      .filter(f => f.type === 'file')
      .map(async (file) => {
        const relativePath = file.path.replace(this.dir, '');
        const content = await this.fs.readFile(file.path);
        return this.webcontainerInstance.fs.writeFile(relativePath, content);
      });
      
    await Promise.all(fileWrites);
    await this.startMiddleware();
  }

  async startMiddleware() {
    this.onStatusChange('Starting CMS Middleware...');
    
    // Check if we have a cached build to serve instantly
    const hasCache = await this.fs.readdir('/__qcms_cache__').then(e => e.length > 0).catch(() => false);
    
    // 1. Create the middleware proxy script
    const middlewareContent = `
const http = require('http');
const fs = require('fs');
const path = require('path');
const TARGET_PORT = process.env.TARGET_PORT || 4000;
const PROXY_PORT = 3001;

const findInCache = (url) => {
    const cacheDir = '/__qcms_cache__';
    const normalizedUrl = url === '/' ? '/index.html' : url;
    const fullPath = path.join(cacheDir, normalizedUrl);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) return fullPath;
    const altPaths = [
        path.join(cacheDir, 'index.html'),
        path.join(cacheDir, 'public/index.html'),
        path.join(cacheDir, 'dist/index.html'),
        path.join(cacheDir, '_site/index.html')
    ];
    for (const alt of altPaths) {
        if (fs.existsSync(alt) && fs.statSync(alt).isFile()) return alt;
    }
    return null;
};

const server = http.createServer((req, res) => {
  if (req.url === '/__zcms_ping') {
      res.writeHead(200); res.end('pong'); return;
  }
  if (req.url.endsWith('/zcms-bridge.js')) {
    try {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Access-Control-Allow-Origin': '*' });
      res.end(fs.readFileSync('./zcms-bridge.js', 'utf8'));
      return;
    } catch (e) {}
  }
  const options = { hostname: '127.0.0.1', port: TARGET_PORT, path: req.url, method: req.method, headers: req.headers };
  const proxyReq = http.request(options, (proxyRes) => {
    const contentType = proxyRes.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      let body = [];
      proxyRes.on('data', (chunk) => body.push(chunk));
      proxyRes.on('end', () => {
        let html = Buffer.concat(body).toString('utf8');
        if (html.includes('</body>') && !html.includes('zcms-bridge.js')) {
          html = html.replace('</body>', '<script type="module" src="/zcms-bridge.js"></script></body>');
        }
        const headers = { ...proxyRes.headers }; delete headers['content-length'];
        res.writeHead(proxyRes.statusCode, headers); res.end(html);
      });
    } else {
      res.writeHead(proxyRes.statusCode, proxyRes.headers); proxyRes.pipe(res);
    }
  });
  proxyReq.on('error', (e) => {
    const cachePath = findInCache(req.url);
    if (cachePath) {
      const ext = path.extname(cachePath);
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'text/plain';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache', 'Cross-Origin-Resource-Policy': 'cross-origin' });
      res.end(fs.readFileSync(cachePath));
    } else {
      res.writeHead(502); res.end('Proxy Error: SSG down and no cache');
    }
  });
  req.pipe(proxyReq);
});
server.listen(PROXY_PORT, '0.0.0.0', () => console.log('[Middleware] CMS Bridge running on port ' + PROXY_PORT));
    `;
    
    // Use relative paths for writing within the WebContainer
    const bridgeResponse = await fetch('/cms.js');
    const bridgeContent = await bridgeResponse.text();
    
    await this.webcontainerInstance.fs.writeFile('zcms-bridge.js', bridgeContent);
    await this.webcontainerInstance.fs.writeFile('zcms-middleware.js', middlewareContent);

    // 2. Inject Tagger plugins for specific frameworks
    await this.createTaggerPlugin();

    // 3. The actual process spawning is handled in startDevServer after we know the port
  }

  async createTaggerPlugin() {
    this.onStatusChange('Creating Tagger Plugin...');
    
    // Check for Hexo (uses scripts/ folder for local plugins)
    try {
      const packageJsonContent = await this.webcontainerInstance.fs.readFile('/package.json', 'utf8');
      const pkg = JSON.parse(packageJsonContent);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      if (deps['hexo'] || deps['hexo-cli']) {
        this.onLog('[Tagger] Hexo detected. Injecting scripts/zcms-tagger.js');
        const hexoTagger = `
hexo.extend.filter.register('after_render:html', function(html, data) {
  if (data.source) {
    // Inject source file path into body tag
    const sourcePath = 'source/' + data.source;
    return html.replace('<body', '<body data-cms-source="' + sourcePath + '"');
  }
  return html;
});
        `;
        await this.webcontainerInstance.fs.mkdir('scripts', { recursive: true });
        await this.webcontainerInstance.fs.writeFile('scripts/zcms-tagger.js', hexoTagger);
      }
      
      // Astro doesn't need an injection, it has data-astro-source-file in dev
    } catch (e) {
      this.onLog(`[Warning] Tagger injection failed: ${e.message}`);
    }
  }

  async readDirRecursive(dir) {
    const results = [];
    const entries = await this.fs.readdir(dir);
    
    for (const entry of entries) {
      if (entry === '.git') continue;
      const path = `${dir}/${entry}`;
      const stat = await this.fs.stat(path);
      
      if (stat.isDirectory()) {
        results.push({ path, type: 'dir' });
        results.push(...(await this.readDirRecursive(path)));
      } else {
        results.push({ path, type: 'file' });
      }
    }
    return results;
  }

  async installDependencies() {
    // PRO-TIP: Check if node_modules already exists from a previous sync
    // This makes repeat-boots extremely fast.
    const hasModules = await this.webcontainerInstance.fs.readdir('/node_modules').then(e => e.length > 0).catch(() => false);
    if (hasModules) {
      this.onLog('Reuse existing node_modules detected.');
      return;
    }
    
    this.onStatusChange('Installing Dependencies...');
    const installProcess = await this.webcontainerInstance.spawn('npm', ['install']);
    
    // Log output only in dev mode
    installProcess.output.pipeTo(new WritableStream({
      write: (data) => {
          if (this.isDevMode) console.log('[npm install]', data);
      }
    }));

    const exitCode = await installProcess.exit;
    if (exitCode !== 0) throw new Error('npm install failed');
  }

  async startDevServer(manualCommand = null) {
    const FRAMEWORK_DEFAULTS = {
      'hexo': 'npx hexo server',
      'astro': 'npx astro dev',
      'nuxt': 'npx nuxi dev',
      'next': 'npx next dev',
      'vite': 'npx vite',
      'eleventy': 'npx @11ty/eleventy --serve',
      'docusaurus': 'npx docusaurus start',
      'vitepress': 'npx vitepress dev'
    };

    let devCommand = manualCommand || 'npm run dev';
    
    // Auto-detection logic if no manual command provided
    if (!manualCommand) {
      try {
        const packageJsonContent = await this.webcontainerInstance.fs.readFile('/package.json', 'utf-8');
        const pkg = JSON.parse(packageJsonContent);
        const scripts = pkg.scripts || {};
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        
        // 1. Check for standard scripts
        if (scripts.dev) devCommand = 'npm run dev';
        else if (scripts.serve) devCommand = 'npm run serve';
        else if (scripts.start) devCommand = 'npm run start';
        else if (scripts.server) devCommand = 'npm run server';
        else {
          // 2. Identify framework from dependencies
          const detectedFramework = Object.keys(FRAMEWORK_DEFAULTS).find(fw => deps[fw] || deps[`@${fw}/core`]);
          if (detectedFramework) {
            devCommand = FRAMEWORK_DEFAULTS[detectedFramework];
            this.onLog(`[Auto-Detect] Framework found: ${detectedFramework}. Using: ${devCommand}`);
          } else if (Object.keys(scripts).length > 0) {
            // 3. Fallback to first script that doesn't look like build/test
            const possible = Object.keys(scripts).find(s => !['build', 'test', 'lint', 'generate'].includes(s));
            devCommand = possible ? `npm run ${possible}` : `npm run ${Object.keys(scripts)[0]}`;
          }
        }
      } catch (e) {
        this.onLog(`[Warning] No package.json found or readable. Falling back to default: ${devCommand}`);
      }
    }

    // Cleanup previous processes if any
    if (this.serverProcess) {
       this.onLog('[Cleanup] Stopping previous dev server...');
       this.serverProcess.kill();
    }
    if (this.middlewareProc) {
       this.onLog('[Cleanup] Stopping previous CMS bridge...');
       this.middlewareProc.kill();
    }

    this.onStatusChange(`Running: ${devCommand}...`);
    const cmdTokens = devCommand.split(' ');
    const cmd = cmdTokens[0];
    const args = cmdTokens.slice(1);
    
    this.serverProcess = await this.webcontainerInstance.spawn(cmd, args);
    const serverProcess = this.serverProcess;
    
    serverProcess.output.pipeTo(new WritableStream({
      write: (data) => {
          if (this.isDevMode) console.log(`[server] ${data}`);
      }
    }));

    this.middlewareStarted = false;

    // Listen for the server-ready event of WebContainers
    this.webcontainerInstance.on('server-ready', async (port, url) => {
      // 1. If it's the first port (not our middleware), start the middleware
      if (port !== 3001 && !this.middlewareStarted) {
        this.middlewareStarted = true;
        this.onLog(`[Middleware] SSG detected on port ${port}. Launching CMS Bridge...`);
        
        try {
          this.middlewareProc = await this.webcontainerInstance.spawn('node', ['zcms-middleware.js'], {
            env: { TARGET_PORT: port }
          });

          this.middlewareProc.output.pipeTo(new WritableStream({
            write: (data) => this.onLog(`[bridge] ${data}`)
          }));
        } catch (e) {
          this.onLog(`[Error] Failed to start middleware: ${e.message}`);
          this.middlewareStarted = false; // Reset on failure
        }
      }

      // 2. If it's our middleware port, we are ready to preview!
      if (port === 3001) {
        this.serverUrl = url;
        this.onLog(`[Middleware] CMS Bridge Ready! Loading preview...`);
        this.onServerReady(url);
        this.onStatusChange('Server Ready!');
      }
    });

    return serverProcess;
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
   */
  async publishChanges(commitMessage = 'CMS update') {
    this.onStatusChange('Syncing changes back...');
    
    // 1. Sync files back from WebContainer to lightning-fs (Cleanup CMS files!)
    await this.syncFromWebContainer();

    // 2. Explicitly remove any CMS-internal files from the Git index if they exist
    const gitFiles = await git.listFiles({ fs: this.fs, dir: this.dir });
    for (const f of gitFiles) {
      if (f.startsWith('zcms-') || f === 'scripts/zcms-tagger.js') {
        await git.remove({ fs: this.fs, dir: this.dir, filepath: f });
      }
    }

    // 3. Git Commit & Push
    this.onStatusChange('Committing...');
    await git.add({ fs: this.fs, dir: this.dir, filepath: '.' });
    await git.commit({
      fs: this.fs,
      dir: this.dir,
      message: commitMessage,
      author: { name: 'CMS User', email: 'cms@example.com' }
    });

    this.onStatusChange('Pushing to GitHub...');
    const pushResult = await git.push({
      fs: this.fs,
      http: (await import('/lib/isomorphic-git-http.js')).default,
      dir: this.dir,
      url: this.repoUrl,
      onAuth: () => ({ username: this.token }),
      corsProxy: this.proxy
    });

    this.onStatusChange('Publish successful!');
    return pushResult;
  }

  async syncFromWebContainer() {
    // This part requires a recursive read from WebContainer and write back to lightning-fs
    // Avoiding node_modules is critical here.
    const processEntry = async (path) => {
      const entries = await this.webcontainerInstance.fs.readdir(path, { withFileTypes: true });
      for (const entry of entries) {
        // IGNORE CMS INTERNAL FILES AND TEMP FILES
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('zcms-')) continue;
        const entryPath = path === '/' ? `/${entry.name}` : `${path}/${entry.name}`;
        
        if (entry.isDirectory()) {
          await this.fs.mkdir(`${this.dir}${entryPath}`).catch(() => {});
          await processEntry(entryPath);
        } else {
          const content = await this.webcontainerInstance.fs.readFile(entryPath);
          await this.fs.writeFile(`${this.dir}${entryPath}`, content);
        }
      }
    };
    await processEntry('/');
  }

  /**
   * Scans the filesystem for 'original' and replaces it with 'updated'.
   * If sourceFile is provided (via Tagger plugin), it targets that file directly.
   */
  async applySmartMatchChange(original, updated, sourceFile = null) {
    if (!original || original === updated) return;
    
    // 1. If we have a dedicated source file, try to update it directly first
    if (sourceFile) {
      this.onLog(`[SmartMatch] Direct source mapping found: ${sourceFile}`);
      try {
        let content = await this.webcontainerInstance.fs.readFile(sourceFile, 'utf8');
        if (content.includes(original)) {
          this.onLog(`[SmartMatch] Success: Found match in ${sourceFile}`);
          content = content.split(original).join(updated);
          await this.webcontainerInstance.fs.writeFile(sourceFile, content);
          return true;
        }
      } catch (e) {
        this.onLog(`[Warning] Could not read mapped source file ${sourceFile}: ${e.message}`);
      }
    }

    this.onLog(`[SmartMatch] Falling back to global search for: "${original.substring(0, 30)}..."`);
    const searchDirs = ['/source', '/src', '/layouts', '/'];
    
    const findAndReplace = async (dir) => {
      let entries = [];
      try { entries = await this.webcontainerInstance.fs.readdir(dir, { withFileTypes: true }); }
      catch (e) { return false; }

      for (const entry of entries) {
        const fullPath = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('zcms-')) continue;

        if (entry.isDirectory()) {
          if (await findAndReplace(fullPath)) return true;
        } else {
          // Only check text-like files
          const exts = ['.md', '.html', '.ejs', '.astro', '.vue', '.json', '.yml', '.yaml'];
          if (exts.some(ext => entry.name.endsWith(ext))) {
            try {
              let content = await this.webcontainerInstance.fs.readFile(fullPath, 'utf8');
              if (content.includes(original)) {
                this.onLog(`[SmartMatch] Match found in ${fullPath}! Applying change...`);
                content = content.split(original).join(updated);
                await this.webcontainerInstance.fs.writeFile(fullPath, content);
                return true;
              }
            } catch (e) {}
          }
        }
      }
      return false;
    };

    for (const s of searchDirs) {
      if (await findAndReplace(s)) return;
    }
    
    this.onLog(`[Warning] SmartMatch failed to find original text in any source files.`);
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
      onAuth: () => ({ username: this.token }),
      corsProxy: this.proxy
    });

    this.onStatusChange('Rollback successful!');
    this.onLog('[Git] Repository history cleaned up.');
  }

  /**
   * QUANTUM BOOT: Save/Load binary snapshots of node_modules
   */
  async saveSnapshot() {
    this.onLog('[Quantum] Creating node_modules snapshot...');
    try {
      // Create a tarball inside the WebContainer
      await this.webcontainerInstance.spawn('tar', ['-cf', '/tmp/modules.tar', 'node_modules']);
      const tarData = await this.webcontainerInstance.fs.readFile('/tmp/modules.tar');
      
      // Save the binary blob to lightning-fs
      await this.fs.writeFile(`${this.dir}/__qcms_snapshot__.tar`, tarData);
      this.onLog('[Quantum] Snapshot saved successfully.');
    } catch (e) {
      this.onLog(`[Warning] Snapshot failed: ${e.message}`);
    }
  }

  async loadSnapshot() {
    try {
      const tarData = await this.fs.readFile(`${this.dir}/__qcms_snapshot__.tar`).catch(() => null);
      if (!tarData) return;

      this.onLog('[Quantum] Restoring node_modules snapshot...');
      await this.webcontainerInstance.fs.writeFile('/tmp/modules.tar', tarData);
      const untar = await this.webcontainerInstance.spawn('tar', ['-xf', '/tmp/modules.tar', '-C', '/']);
      await untar.exit;
      this.onLog('[Quantum] Snapshot restored.');
    } catch (e) {
      this.onLog(`[Warning] Load snapshot failed: ${e.message}`);
    }
  }

  /**
   * QUANTUM BOOT: Cache build results for instant preview
   */
  async syncBuildCache() {
    const buildDirs = ['public', 'dist', '_site', 'out', 'build'];
    let detectedDir = null;
    
    for (const d of buildDirs) {
      const exists = await this.webcontainerInstance.fs.readdir(`/${d}`).then(() => true).catch(() => false);
      if (exists) { detectedDir = d; break; }
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
      const entries = await this.webcontainerInstance.fs.readdir(path, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path === '/' ? `/${entry.name}` : `${path}/${entry.name}`;
        const cachePath = `/__qcms_cache__${fullPath}`;
        if (entry.isDirectory()) {
          await ensureDir(cachePath);
          await syncDirRecursive(fullPath);
        } else {
          // Ensure parent directory exists before writing file
          const parentDir = cachePath.substring(0, cachePath.lastIndexOf('/'));
          await ensureDir(parentDir);
          const content = await this.webcontainerInstance.fs.readFile(fullPath);
          await this.fs.writeFile(cachePath, content);
        }
      }
    };
    
    await ensureDir('/__qcms_cache__');
    await syncDirRecursive(`/${detectedDir}`);
    
    // Also trigger snapshot of modules while we're at it
    this.saveSnapshot();
  }
}
