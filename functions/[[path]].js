import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';

const app = new Hono();

/** 
 * GET /github/login
 * Redirects the user to GitHub for OAuth authentication.
 */
app.get('/github/login', (c) => {
  const CLIENT_ID = c.env.GITHUB_CLIENT_ID;
  if (!CLIENT_ID) return c.text('GITHUB_CLIENT_ID not configured in Cloudflare Dashboard.', 500);
  
  const url = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=repo,user`;
  return c.redirect(url);
});

/**
 * GET /github/callback
 * Exchanges the temporary code for a permanent access_token.
 */
app.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const installationId = c.req.query('installation_id');
  const CLIENT_ID = c.env.GITHUB_CLIENT_ID;
  const CLIENT_SECRET = c.env.GITHUB_CLIENT_SECRET;

  if (!code) return c.text('Missing code', 400);

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'ZeroCMS-App'
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code
    })
  });

  const data = await res.json();
  if (data.access_token) {
    let redirectUrl = `/?token=${data.access_token}`;
    if (installationId) redirectUrl += `&installation_id=${installationId}`;
    return c.redirect(redirectUrl);
  }

  return c.json({ error: 'GitHub Auth failed', details: data }, 500);
});

/**
 * ALL /github/api/*
 * Proxies GitHub API requests to bypass CORS/COEP.
 */
app.all('/github/api/:path{.+}', async (c) => {
  const apiPath = c.req.param('path');
  const url = `https://api.github.com/${apiPath}`;
  
  const headers = new Headers(c.req.header());
  headers.delete('host');
  headers.set('User-Agent', 'ZeroCMS-App');
  headers.set('Accept', 'application/vnd.github.v3+json');

  const res = await fetch(url, {
    method: c.req.method,
    headers,
    body: c.req.method !== 'GET' ? await c.req.blob() : undefined
  });

  const body = await res.blob();
  const responseHeaders = new Headers(res.headers);
  responseHeaders.set('Access-Control-Allow-Origin', '*');

  return new Response(body, { status: res.status, headers: responseHeaders });
});

/**
 * ALL /git-proxy/*
 * Efficient Git Proxy for isomorphic-git.
 * Strips WWW-Authenticate to avoid browser popup.
 */
app.all('/git-proxy/:protocol/:path{.+}', async (c) => {
    const protocol = c.req.param('protocol'); // https or http
    const gitPath = c.req.param('path');
    const url = `${protocol}://${gitPath}`;
    
    // Check if it's a OPTIONS pre-flight
    if (c.req.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-git-protocol'
            }
        });
    }

    const headers = new Headers(c.req.header());
    headers.delete('host');
    headers.delete('origin');
    headers.delete('referer');

    const res = await fetch(url, {
        method: c.req.method,
        headers,
        body: c.req.method === 'POST' ? await c.req.blob() : undefined
    });

    // Special Auth Handling: convert 401 -> 400 for Fetch to stop browser popup
    // Or keep 401 but STRIP the WWW-Authenticate header.
    const isPush = url.includes('git-receive-pack');
    const statusCode = (!isPush && res.status === 401) ? 400 : res.status;
    
    const responseHeaders = new Headers(res.headers);
    responseHeaders.delete('www-authenticate');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Expose-Headers', 'x-git-protocol, content-type, content-length');

    const body = await res.blob();
    return new Response(body, { status: statusCode, headers: responseHeaders });
});

export const onRequest = handle(app);
