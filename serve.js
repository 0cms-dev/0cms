const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// Simple .env parser to keep it Zero-Config
function loadEnv() {
  try {
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
      });
    }
  } catch (e) {
    console.error('Error loading .env file:', e);
  }
}
loadEnv();

const CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Iv23liNrAlnfsB931xbl';
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // IMPORTANT: These headers are REQUIRED for WebContainers to work
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  // GitHub Login Redirect
  if (req.url.startsWith('/github/login')) {
    if (CLIENT_ID === 'YOUR_CLIENT_ID') {
      res.writeHead(500);
      res.end('Error: GITHUB_CLIENT_ID not configured in serve.js or environment.');
      return;
    }
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=repo,user`;
    res.writeHead(302, { Location: githubAuthUrl });
    res.end();
    return;
  }

  // GitHub OAuth Callback
  if (req.url.startsWith('/github/callback')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const code = url.searchParams.get('code');

    if (!code) {
      res.writeHead(400);
      res.end('Missing code parameter');
      return;
    }

    const installationId = url.searchParams.get('installation_id');

    // Exchange code for Access Token
    const data = JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
    });

    const options = {
      hostname: 'github.com',
      port: 443,
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': data.length,
        'User-Agent': 'ZeroCMS-App',
      },
    };

    const gitReq = https.request(options, (gitRes) => {
      let body = '';
      gitRes.on('data', (d) => { body += d; });
      gitRes.on('end', () => {
        try {
          const tokenData = JSON.parse(body);
          if (tokenData.access_token) {
            // Redirect back to index with the token and optional installation_id
            let redirectUrl = `/index.html?token=${tokenData.access_token}`;
            if (installationId) redirectUrl += `&installation_id=${installationId}`;
            
            res.writeHead(302, { Location: redirectUrl });
            res.end();
          } else {
            res.writeHead(500);
            res.end('GitHub Token Error: ' + body);
          }
        } catch (e) {
          res.writeHead(500);
          res.end('JSON Parse Error: ' + body);
        }
      });
    });

    gitReq.on('error', (e) => {
      res.writeHead(500);
      res.end('Fetch Error: ' + e.message);
    });

    gitReq.write(data);
    gitReq.end();
    return;
  }

  // Image Proxy for external placeholders (COEP Bypass)
  if (req.url.startsWith('/proxy')) {
    const url = new URL(req.url, `http://${req.headers.host}`).searchParams.get('url');
    if (!url) {
      res.writeHead(400);
      res.end('Missing url parameter');
      return;
    }

    const proxyReq = https.get(url, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'],
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'public, max-age=3600'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      res.writeHead(500);
      res.end('Proxy Error: ' + e.message);
    });
    return;
  }

  // GitHub API Proxy (COEP/CORS Bypass)
  if (req.url.startsWith('/github/api/')) {
    const apiPath = req.url.replace('/github/api/', '');
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: '/' + apiPath,
      method: req.method,
      headers: { ...req.headers }
    };

    // Keep only essential headers
    delete options.headers['host'];
    delete options.headers['origin'];
    delete options.headers['referer'];
    options.headers['User-Agent'] = 'ZeroCMS-App';
    options.headers['Accept'] = 'application/vnd.github.v3+json';

    const apiReq = https.request(options, (apiRes) => {
      res.writeHead(apiRes.statusCode, {
        ...apiRes.headers,
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      });
      apiRes.pipe(res);
    });

    apiReq.on('error', (e) => {
      res.writeHead(500);
      res.end('API Proxy Error: ' + e.message);
    });
    req.pipe(apiReq);
    return;
  }

  // Git Cors Proxy for isomorphic-git (Because public proxies strip Auth headers)
  if (req.url.startsWith('/git-proxy/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-git-protocol'
      });
      res.end();
      return;
    }
    
    const gitUrl = 'https://' + req.url.replace('/git-proxy/', '');
    const options = {
      method: req.method,
      headers: { ...req.headers }
    };
    
    // Clean up headers before proxying
    delete options.headers['host'];
    delete options.headers['origin'];
    delete options.headers['referer'];
    
    if (options.headers['connection'] === 'keep-alive') {
        delete options.headers['connection'];
    }

    const proxyReq = https.request(gitUrl, options, (proxyRes) => {
      const isPush = req.url.includes('git-receive-pack');
      
      // For FETCH (upload-pack): convert 401→400 to prevent browser Basic Auth dialog.
      // For PUSH (receive-pack): keep real 401 so isomorphic-git onAuthFailure triggers,
      //   but STRIP the WWW-Authenticate header so the BROWSER doesn't show its own dialog.
      const statusCode = (!isPush && proxyRes.statusCode === 401) ? 400 : proxyRes.statusCode;
      
      const responseHeaders = { ...proxyRes.headers };
      // Always strip WWW-Authenticate - we handle auth ourselves, browser dialog is never helpful
      delete responseHeaders['www-authenticate'];
      
      console.log(`[Git Proxy] ${req.method} ${gitUrl} -> ${proxyRes.statusCode} (proxied as ${statusCode})`);
      
      res.writeHead(statusCode, {
        ...responseHeaders,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'x-git-protocol, content-type, content-length'
      });
      
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (e) => {
      console.error(`[Git Proxy Error] ${e.message}`);
      res.writeHead(500);
      res.end('Git Proxy Error: ' + e.message);
    });

    if (req.method === 'POST') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
    return;
  }

  let filePath = '.' + req.url.split('?')[0];

  // Map root to the main index.html (One-Pager)
  if (filePath === './') {
    filePath = './index.html';
  }
  
  // High-Performance Library Serving
  if (req.url.startsWith('/lib/')) {
    filePath = '.' + req.url;
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + error.code);
      }
    } else {
      res.writeHead(200, { 
          'Content-Type': contentType,
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Permissions-Policy': 'interest-cohort=()'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\x1b[32m[ZeroCMS] Server running at http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[33mOpen http://localhost:${PORT} to start the CMS.\x1b[0m`);
  if (CLIENT_ID === 'YOUR_CLIENT_ID') {
    console.log(`\x1b[31m[!] GITHUB_CLIENT_ID is not configured. OAuth will not work.\x1b[0m`);
  }
});
