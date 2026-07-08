export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'PUT') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const authHeader = request.headers.get('X-Upload-Token');
    if (!authHeader || authHeader !== env.UPLOAD_SECRET) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const url = new URL(request.url);
    const key = url.pathname.slice(1);
    if (!key) return jsonResponse({ error: 'Missing object key' }, 400);
    if (!env.R2_BUCKET) return jsonResponse({ error: 'R2 bucket is not configured' }, 500);

    const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
    if (!ALLOWED_TYPES.includes(contentType)) {
      return jsonResponse({ error: `Unsupported type: ${contentType}` }, 400);
    }

    const contentLength = parseInt(request.headers.get('Content-Length') || '0');
    if (contentLength > 2 * 1024 * 1024) {
      return jsonResponse({ error: 'File too large' }, 413);
    }

    try {
      const body = await request.arrayBuffer();
      if (body.byteLength > 2 * 1024 * 1024) return jsonResponse({ error: 'File too large' }, 413);
      if (body.byteLength === 0) return jsonResponse({ error: 'Empty file' }, 400);

      await env.R2_BUCKET.put(key, body, { httpMetadata: { contentType } });
      const cdnUrl = `https://${env.CDN_DOMAIN}/${key}`;
      return jsonResponse({ success: true, cdnUrl }, 200);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Token',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
