// Cloudflare Pages Functions — Transparent Proxy for NodeJS Backend
// Backend URL is injected via Cloudflare Pages environment variable BACKEND_URL
// Set it in: Cloudflare Dashboard → Pages → Settings → Environment Variables
// or in wrangler.toml [vars] section for local dev.

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Use env var so the backend URL is not hardcoded — change it in CF Pages settings
  const BACKEND_URL = env.BACKEND_URL || 'https://api-haravan-reviews.f1genz.dev';

  // Build the target URL on the backend, preserving path + query string
  const targetUrl = new URL(url.pathname + url.search, BACKEND_URL);

  // Clone the incoming request and point it at the backend
  const proxyRequest = new Request(targetUrl, request);
  proxyRequest.headers.set('X-Forwarded-Host', url.hostname);

  // Cloudflare Edge fetches from the backend (internal network — no CORS here)
  const response = await fetch(proxyRequest);

  // Return response to browser — browser sees it coming from reviews.f1genz.dev (same-origin ✅)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
