import git from 'https://esm.sh/isomorphic-git';
import FS from 'https://esm.sh/@isomorphic-git/lightning-fs';
import { WebContainer } from 'https://esm.sh/@webcontainer/api';

/**
 * WebContainerGitService
 * Orchestrates Git operations in browser-persistent storage and 
 * runs a development environment using WebContainers.
 */
export class WebContainerGitService {
  constructor(config = {}) {
    this.repoUrl = config.repoUrl;
    this.dir = config.dir || '/repo';
    this.proxy = config.proxy || 'https://cors.isomorphic-git.org';
    this.token = config.token;
    
    this.fs = new FS('cms-fs').promises;
    this.webcontainerInstance = null;
    this.serverUrl = null;
    
    // Callbacks for UI updates
    this.onStatusChange = config.onStatusChange || (() => {});
    this.onServerReady = config.onServerReady || (() => {});
    this.onLog = config.onLog || ((msg) => console.log(`[WC-Log] ${msg}`));
  }

  /**
   * Initialize the entire pipeline: Git -> WebContainer -> Dev Server
   */
  async boot(manualCommand = null) {
    try {
      this.onStatusChange('Initializing FileSystem...');
      await this.initFS();
      
      this.onStatusChange('Cloning Repository...');
      await this.clone();
      
      this.onStatusChange('Booting WebContainer...');
      await this.initWebContainer();
      
      this.onStatusChange('Syncing Files...');
      await this.syncToWebContainer();
      
      this.onStatusChange('Installing Dependencies...');
      await this.installDependencies();
      
      this.onStatusChange('Starting Dev Server...');
      await this.startDevServer(manualCommand);
      
    } catch (error) {
      console.error('[CMS Service] Boot failed:', error);
      this.onStatusChange(`Error: ${error.message}`);
      throw error;
    }
  }

  async initFS() {
    // Attempt to wipe directory for a clean start
    try {
      await this.wipeDir(this.dir);
      await this.fs.rmdir(this.dir); // Also remove the root dir itself
    } catch (e) {
      // Ignored if it doesn't exist
    }
    await this.fs.mkdir(this.dir);
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
    await git.clone({
      fs: this.fs,
      http: (await import('https://esm.sh/isomorphic-git/http/web/index.js')).default,
      dir: this.dir,
      url: this.repoUrl,
      corsProxy: this.proxy,
      singleBranch: true,
      depth: 1,
      onMessage: msg => this.onStatusChange(`Git: ${msg}`)
    });
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
    for (const file of files) {
      const relativePath = file.path.replace(this.dir, '');
      if (file.type === 'dir') {
        await this.webcontainerInstance.fs.mkdir(relativePath, { recursive: true });
      } else {
        // Read as Uint8Array (binary safe)
        const content = await this.fs.readFile(file.path);
        await this.webcontainerInstance.fs.writeFile(relativePath, content);
      }
    }
    await this.startMiddleware();
  }

  async startMiddleware() {
    this.onStatusChange('Starting CMS Middleware...');
    
    // 1. Create the middleware proxy script
    const middlewareContent = `
const http = require('http');
const fs = require('fs');
const path = require('path');
const TARGET_PORT = process.env.TARGET_PORT || 4000;
const PROXY_PORT = 3001;

const server = http.createServer((req, res) => {
  // Serve the bridge script (handle base paths)
  if (req.url.endsWith('/zcms-bridge.js')) {
    try {
      res.writeHead(200, { 
        'Content-Type': 'application/javascript',
        'Cross-Origin-Resource-Policy': 'cross-origin' 
      });
      res.end(fs.readFileSync('./zcms-bridge.js', 'utf8'));
      return;
    } catch (e) {
      console.error('[Middleware] Failed to serve bridge:', e.message);
    }
  }

  const options = {
    hostname: 'localhost',
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const contentType = proxyRes.headers['content-type'] || '';
    const isHtml = contentType.includes('text/html');

    if (isHtml) {
      let body = [];
      proxyRes.on('data', (chunk) => body.push(chunk));
      proxyRes.on('end', () => {
        let html = Buffer.concat(body).toString('utf8');
        if (html.includes('</body>') && !html.includes('zcms-bridge.js')) {
          // Identify the correct base path for the script injection
          // If we are at /foo/, the script should be /foo/zcms-bridge.js
          const pathParts = req.url.split('/');
          pathParts.pop();
          const basePath = pathParts.join('/') || '';
          const scriptTag = '<script type="module" src="' + basePath + '/zcms-bridge.js"></script></body>';
          html = html.replace('</body>', scriptTag);
        }
        const headers = { ...proxyRes.headers };
        delete headers['content-length'];
        res.writeHead(proxyRes.statusCode, headers);
        res.end(html);
      });
    } else {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', (e) => {
    res.writeHead(502);
    res.end('<h1>CMS Proxy Error</h1><p>SSG Server not responding on port ' + TARGET_PORT + '</p>');
  });

  req.pipe(proxyReq);
});

server.listen(PROXY_PORT, () => console.log('[Middleware] CMS Bridge running on port ' + PROXY_PORT));
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
    const installProcess = await this.webcontainerInstance.spawn('npm', ['install']);
    
    // Log output for debugging
    installProcess.output.pipeTo(new WritableStream({
      write: (data) => console.log('[npm install]', data)
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

    this.onStatusChange(`Running: ${devCommand}...`);
    const cmdTokens = devCommand.split(' ');
    const cmd = cmdTokens[0];
    const args = cmdTokens.slice(1);
    
    const serverProcess = await this.webcontainerInstance.spawn(cmd, args);
    
    serverProcess.output.pipeTo(new WritableStream({
      write: (data) => this.onLog(`[server] ${data}`)
    }));

    let middlewareStarted = false;

    // Listen for the server-ready event of WebContainers
    this.webcontainerInstance.on('server-ready', async (port, url) => {
      // 1. If it's the first port (not our middleware), start the middleware
      if (port !== 3001 && !middlewareStarted) {
        middlewareStarted = true;
        this.onLog(`[Middleware] SSG detected on port ${port}. Launching CMS Bridge...`);
        
        try {
          const middlewareProc = await this.webcontainerInstance.spawn('node', ['zcms-middleware.js'], {
            env: { TARGET_PORT: port }
          });

          middlewareProc.output.pipeTo(new WritableStream({
            write: (data) => this.onLog(`[bridge] ${data}`)
          }));
        } catch (e) {
          this.onLog(`[Error] Failed to start middleware: ${e.message}`);
        }
      }

      // 2. If it's our middleware port, we are ready to preview!
      if (port === 3001) {
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
      http: (await import('https://esm.sh/isomorphic-git/http/web/index.js')).default,
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
      http: (await import('https://esm.sh/isomorphic-git/http/web/index.js')).default,
      dir: this.dir,
      url: this.repoUrl,
      force: true, // IMPORTANT: Force push to overwrite remote history
      onAuth: () => ({ username: this.token }),
      corsProxy: this.proxy
    });

    this.onStatusChange('Rollback successful!');
    this.onLog('[Git] Repository history cleaned up.');
  }
}
