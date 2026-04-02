/**
 * ServerTrait.js
 * Handles the dev server execution and proxy middleware logic.
 * Integrated with a factory to simplify declarative drivers.
 */
export class ServerTrait {
  constructor(config = {}) {
    this.command = config.command || 'npm run dev';
    this.port = config.port || 3000;
    this.proxyPort = config.proxyPort || 3001;
  }

  /**
   * Factory method to create a Trait instance from a plain config object.
   */
  static from(config) {
    if (config instanceof ServerTrait) return config;
    return new ServerTrait(config || {});
  }

  getDevCommand() {
    return this.command;
  }

  getMiddlewareScript(targetPort) {
    const target = targetPort || this.port;
    const proxy = this.proxyPort;
    
    // Use a template that carefully escapes backticks for the inner HTML
    return `
const http = require('http');
const TARGET_PORT = process.env.TARGET_PORT || ${target};
const PROXY_PORT = ${proxy};

const server = http.createServer((req, res) => {
  if (req.url === '/__zcms_ping') {
      res.writeHead(200); res.end('pong'); return;
  }

  // SELF-SERVE BRIDGE: Serve the CMS bridge script directly from the middleware
  if (req.url === '/zcms-bridge.js') {
    try {
        const fs = require('fs');
        const content = fs.readFileSync('./zcms-bridge.js');
        res.writeHead(200, { 
            'Content-Type': 'application/javascript',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp'
        });
        res.end(content);
        return;
    } catch (e) {
        console.error('[bridge] Failed to serve zcms-bridge.js from disk:', e.message);
    }
  }
  
  const options = { 
    hostname: 'localhost', 
    port: TARGET_PORT, 
    path: req.url, 
    method: req.method, 
    headers: req.headers 
  };

  const tryProxy = (attempt = 1) => {
    const proxyReq = http.request(options, (proxyRes) => {
      const contentType = proxyRes.headers['content-type'] || '';
      
      // Force CORS/COEP headers on ALL proxied responses for WebContainer stability
      const headers = { ...proxyRes.headers }; 
      headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
      headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
      headers['Cross-Origin-Opener-Policy'] = 'same-origin';

      if (contentType.includes('text/html')) {
        let body = [];
        proxyRes.on('data', (chunk) => body.push(chunk));
        proxyRes.on('end', () => {
          let html = Buffer.concat(body).toString('utf8');
          // Inject bridge script if not already present
          if (html.includes('</body>') && !html.includes('zcms-bridge.js')) {
            html = html.replace('</body>', '<script type="module" src="/zcms-bridge.js"></script></body>');
          }
          delete headers['content-length'];
          res.writeHead(proxyRes.statusCode, headers); 
          res.end(html);
        });
      } else {
        res.writeHead(proxyRes.statusCode, headers); 
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (e) => {
      if (attempt < 60) { // Increased wait time for Next.js WASM downloads (30s total)
          if (attempt % 5 === 0) console.log('[bridge] Still waiting for dev server on port ' + TARGET_PORT + ' (Attempt ' + attempt + ')...');
          setTimeout(() => tryProxy(attempt + 1), 500);
          return;
      }
      res.writeHead(502, { 
          'Content-Type': 'text/html',
          'Refresh': '5' // Auto-refresh the 502 page every 5s
      }); 
      res.end('<html><body style="background:#0f172a; color:#f8fafc; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; margin:0; text-align:center; padding:20px;">' +
              '<h2 style="color:#a78bfa; font-size:2rem; margin-bottom:10px;">Engine Warming Up</h2>' +
              '<p style="opacity:0.8; max-width:400px; line-height:1.6;">Next.js is currently preparing its internal assets (SWC/WASM). This first boot takes a bit longer.</p>' +
              '<div style="margin:30px; width:40px; height:40px; border:4px solid rgba(167, 139, 250, 0.1); border-top-color:#a78bfa; border-radius:50%; animation:spin 1s linear infinite;"></div>' +
              '<p style="font-size:0.9rem; font-weight:600; color:#a78bfa;">Retrying automatically...</p>' +
              '<style>@keyframes spin { to { transform: rotate(360deg); } }</style>' +
              '</body></html>');
    });
    
    if (req.method === 'POST' || req.method === 'PUT') {
        req.pipe(proxyReq);
    } else {
        proxyReq.end();
    }
  };

  tryProxy();
});

server.listen(PROXY_PORT, '0.0.0.0', () => console.log('[ServerTrait] Middleware Bridge running on port ' + PROXY_PORT));
`;
  }
}
