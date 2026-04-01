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
    return `
const http = require('http');
const fs = require('fs');
const path = require('path');
const TARGET_PORT = ${targetPort || this.port};
const PROXY_PORT = ${this.proxyPort};

const server = http.createServer((req, res) => {
  if (req.url === '/__zcms_ping') {
      res.writeHead(200); res.end('pong'); return;
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
        const headers = { ...proxyRes.headers }; 
        delete headers['content-length'];
        headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
        headers['Cross-Origin-Opener-Policy'] = 'same-origin';
        headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
        
        res.writeHead(proxyRes.statusCode, headers); 
        res.end(html);
      });
    } else {
      proxyRes.headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
      res.writeHead(proxyRes.statusCode, proxyRes.headers); 
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', (e) => {
      res.writeHead(502); 
      res.end('Proxy Error: Framework dev server (port ' + TARGET_PORT + ') is not responding yet.');
  });
  req.pipe(proxyReq);
});

server.listen(PROXY_PORT, '0.0.0.0', () => console.log('[ServerTrait] Middleware Bridge running on port ' + PROXY_PORT));
    `;
  }
}
