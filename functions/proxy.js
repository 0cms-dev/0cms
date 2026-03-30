export async function onRequest(context) {
    const { request, env } = context;
    const urlStr = new URL(request.url).searchParams.get('url');
    if (!urlStr) return new Response('Missing url', { status: 400 });

    const res = await fetch(urlStr);
    const body = await res.blob();
    
    return new Response(body, {
        status: res.status,
        headers: {
            'Content-Type': res.headers.get('content-type') || 'image/jpeg',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=0, s-maxage=10' // 10s CDN Cache
        }
    });
}
