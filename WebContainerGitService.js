import git from '/lib/isomorphic-git.js';
import FS from '/lib/lightning-fs.js';
import { WebContainer } from '/lib/webcontainer-api.js';
import { FRAMEWORKS, GENERIC_VITE } from './Frameworks.js';
/**
 * WebContainerGitService
 * Orchestrates Git operations in browser-persistent storage and 
 * runs a development environment using WebContainers.
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
    this.serverUrl = null;
    
    // Callbacks for UI updates
    this.onStatusChange = config.onStatusChange || (() => {});
    this.onServerReady = config.onServerReady || (() => {});
    this.onLog = config.onLog || ((msg) => console.log(`[WC-Log] ${msg}`));
    
    this.isBooting = false;
    this.isDevMode = false;
    this.serverProcess = null;
    this.middlewareProc = null;
    
    // Track files actually modified by applySmartMatchChange so we know what to sync
    this._modifiedFiles = new Set();

    // Framework detection
    this.detectedFramework = null;
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
      
      // AUTO-DETECT FRAMEWORK
      await this.autoDetectFramework();

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
          onAuth: () => ({ username: 'x-access-token', password: this.token }),
          onAuthFailure: () => { throw new Error('GitHub authentication failed. Please check your token.'); },
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
        onAuth: () => ({ username: 'x-token-auth', password: this.token }),
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
  }

  /**
   * Identifies the framework by checking package.json and file signatures.
   */
  async autoDetectFramework() {
    try {
      this.onLog('[Auto-Detect] Scanning for framework signals...');
      const pkgRaw = await this.webcontainerInstance.fs.readFile('/package.json', 'utf8').catch(() => null);
      const rootFiles = await this.webcontainerInstance.fs.readdir('/').catch(() => []);
      
      const pkg = pkgRaw ? JSON.parse(pkgRaw) : {};
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      // 1. Layered Detection: Match profiles from Frameworks.js
      let match = FRAMEWORKS.find(fw => {
        // Dependency Match
        const depMatch = fw.signals.deps && fw.signals.deps.some(d => deps[d]);
        // File Signature Match
        const fileMatch = fw.signals.files && fw.signals.files.some(f => rootFiles.includes(f));
        return depMatch || fileMatch;
      });

      // 2. Generic Vite Fallback
      if (!match) {
        const isVite = GENERIC_VITE.signals.deps.some(d => deps[d]) || rootFiles.includes('vite.config.js') || rootFiles.includes('vite.config.ts');
        if (isVite) match = GENERIC_VITE;
      }

      if (match) {
        this.detectedFramework = match;
        this.onLog(`[Auto-Detect] Matched Profile: ${match.name}`);
        
        // Auto-inject tagger if defined
        if (match.tagger) {
          const taggerCode = match.tagger();
          if (match.id === 'hexo') {
            await this.webcontainerInstance.fs.mkdir('scripts', { recursive: true });
            await this.webcontainerInstance.fs.writeFile('scripts/zcms-tagger.js', taggerCode);
          }
          // Note: Vite/Next.js/Astro tagging can be added here as we expand
        }
      } else {
        this.onLog('[Auto-Detect] No specific framework profile matched. Using generic defaults.');
      }
    } catch (e) {
      this.onLog(`[Warning] Auto-detection failed: ${e.message}`);
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
    let devCommand = manualCommand;
    
    // Auto-detection logic if no manual command provided
    if (!devCommand) {
      try {
        const pkgRaw = await this.webcontainerInstance.fs.readFile('/package.json', 'utf8').catch(() => null);
        if (pkgRaw) {
          const pkg = JSON.parse(pkgRaw);
          const scripts = pkg.scripts || {};
          // 1. Check for standard scripts
          if (scripts.dev) devCommand = 'npm run dev';
          else if (scripts.serve) devCommand = 'npm run serve';
          else if (scripts.start) devCommand = 'npm run start';
          else if (scripts.server) devCommand = 'npm run server';
        }

        // 2. Fallback to framework default command if no package scripts matched
        if (!devCommand && this.detectedFramework) {
            devCommand = this.detectedFramework.defaults.command;
            this.onLog(`[Auto-Detect] Using framework default command: ${devCommand}`);
        }
      } catch (e) {
        this.onLog(`[Warning] Error deciding dev command: ${e.message}`);
      }
    }

    // Default fallback
    if (!devCommand) devCommand = 'npm run dev';

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
    for (const [file] of changedFiles) {
      this.onLog(` + ${file}`);
      await git.add({ fs: this.fs, dir: this.dir, filepath: file });
    }

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
   * Tracks every file it writes to in this._modifiedFiles.
   * Uses partial/word matching for template-composed strings.
   */
  async applySmartMatchChange(original, updated, sourceFile = null) {
    if (!original || original === updated) return false;
    
    const writeAndTrack = async (filePath, content) => {
      await this.webcontainerInstance.fs.writeFile(filePath, content);
      const absPath = filePath.startsWith('/') ? filePath : '/' + filePath;
      // Don't track auto-generated SSG cache files - they're in .gitignore anyway
      const isGenerated = absPath.includes('db.json') || absPath.includes('/.cache/') || absPath.includes('/.astro/') || absPath.includes('/public/');
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
                    await writeAndTrack(sourceFile, JSON.stringify(data, null, 2));
                    return true;
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
                return true;
            }
        }

        // FALLBACK: Raw string or partial match in mapped file
        const matchStr = findMatch(content, original);
        if (matchStr) {
          content = content.split(matchStr).join(updated);
          await writeAndTrack(sourceFile, content);
          return true;
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
      try { dirEntries = await this.webcontainerInstance.fs.readdir(dir, { withFileTypes: true }); }
      catch (e) { return false; }

      for (const entry of dirEntries) {
        const fullPath = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('zcms-') || entry.name === 'public' || entry.name === 'dist' || entry.name === '.astro') continue;

        if (entry.isDirectory()) {
          if (await findAndReplace(fullPath)) return true;
        } else {
          const exts = ['.md', '.mdx', '.html', '.ejs', '.hbs', '.njk', '.astro', '.vue', '.json', '.yml', '.yaml', '.js', '.ts', '.jsx', '.tsx', '.toml'];
          if (exts.some(ext => entry.name.endsWith(ext))) {
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
                return true;
              }
            } catch (e) {}
          }
        }
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
    this.collections = [];
    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', 'public', '.astro', '.next', 'assets', 'images', 'components', 'layouts'];
    const validExtensions = ['.md', '.mdx', '.html', '.njk', '.11ty.js'];

    const readDirRecursive = async (currentPath, maxDepth = 4, currentDepth = 0) => {
      if (currentDepth > maxDepth) return;
      try {
        const entries = await this.webcontainerInstance.fs.readdir(currentPath, { withFileTypes: true });
        
        let fileCount = 0;
        let lastValidFile = null;
        let hasNonIndexFile = false;

        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (!ignoreDirs.includes(entry.name) && !entry.name.startsWith('.')) {
              await readDirRecursive(currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`, maxDepth, currentDepth + 1);
            }
          } else if (entry.isFile()) {
            const ext = entry.name.substring(entry.name.lastIndexOf('.'));
            const lowerName = entry.name.toLowerCase();
            if (validExtensions.includes(ext) && lowerName !== 'readme.md') {
              fileCount++;
              lastValidFile = entry.name;
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
    
    // Common paths fallback
    try { await readDirRecursive('/src/content', 2); } catch(e){}
    try { await readDirRecursive('/src/pages', 3); } catch(e){}
    try { await readDirRecursive('/content', 2); } catch(e){}
    
    // If nothing found, wider scan
    if (this.collections.length === 0) {
      await readDirRecursive('/', 3);
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
