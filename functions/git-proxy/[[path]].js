import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';

const app = new Hono().basePath('/git-proxy');

app.all('/:protocol/:path{.+}', async (c) => {
    const protocol = c.req.param('protocol'); // https or http
    const gitPath = c.req.param('path');
    const url = `${protocol}://${gitPath}`;
    
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
