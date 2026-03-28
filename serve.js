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

const CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'YOUR_CLIENT_ID';
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
        const tokenData = JSON.parse(body);
        if (tokenData.access_token) {
          // Redirect back to admin with the token
          res.writeHead(302, { Location: `/admin.html?token=${tokenData.access_token}` });
          res.end();
        } else {
          res.writeHead(500);
          res.end('GitHub Token Error: ' + body);
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

  let filePath = '.' + req.url.split('?')[0];
  if (filePath === './') filePath = './index.html';
  
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
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\x1b[32m[ZeroCMS] Server running at http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[33mOpen http://localhost:${PORT}/admin.html to start the CMS.\x1b[0m`);
  if (CLIENT_ID === 'YOUR_CLIENT_ID') {
    console.log(`\x1b[31m[!] GITHUB_CLIENT_ID is not configured. OAuth will not work.\x1b[0m`);
  }
});
