import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';

const app = new Hono().basePath('/github');

app.get('/login', (c) => {
  const CLIENT_ID = c.env.GITHUB_CLIENT_ID;
  if (!CLIENT_ID) return c.text('GITHUB_CLIENT_ID not configured.', 500);
  const url = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&scope=repo,user`;
  return c.redirect(url);
});

app.get('/callback', async (c) => {
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

// Helper to sign JWT for GitHub App Auth (RS256)
async function generateAppJWT(env) {
  const appId = env.GITHUB_APP_ID;
  const privateKeyPem = env.GITHUB_PRIVATE_KEY;
  if (!appId || !privateKeyPem) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + (10 * 60),
    iss: appId
  };

  const header = { alg: 'RS256', typ: 'JWT' };
  const base64Url = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const unsignedToken = `${base64Url(header)}.${base64Url(payload)}`;
  
  // Convert PEM to ArrayBuffer
  const pemHeader = "-----BEGIN RSA PRIVATE KEY-----";
  const pemFooter = "-----END RSA PRIVATE KEY-----";
  const pemContents = privateKeyPem.replace(pemHeader, "").replace(pemFooter, "").replace(/\s/g, "");
  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${unsignedToken}.${base64Signature}`;
}

app.all('/api/:path{.+}', async (c) => {
  const apiPath = c.req.param('path');
  const url = `https://api.github.com/${apiPath}`;
  
  const headers = new Headers(c.req.header());
  headers.delete('host');
  headers.set('User-Agent', 'ZeroCMS-App');
  headers.set('Accept', 'application/vnd.github.v3+json');

  // Special handling for App Auth (Installation Tokens)
  if (apiPath.includes('/access_tokens') && c.env.GITHUB_APP_ID && c.env.GITHUB_PRIVATE_KEY) {
      console.log('[CMS] Cloudflare: Generating App JWT');
      const jwt = await generateAppJWT(c.env);
      if (jwt) headers.set('Authorization', `Bearer ${jwt}`);
  }

  const res = await fetch(url, {
    method: c.req.method,
    headers,
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? await c.req.blob() : undefined
  });

  const responseHeaders = new Headers(res.headers);
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Cache-Control', 'public, max-age=0, s-maxage=10');

  const body = await res.blob();
  return new Response(body, { status: res.status, headers: responseHeaders });
});

export const onRequest = handle(app);
