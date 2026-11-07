import { normalizeStoreDomainCandidate } from './core/common/security/public-rate-limit';

const EDGE_CACHE_ORIGIN = 'https://edge-cache.f1genz.internal';
const PUBLIC_CACHE_TTL_SECONDS = 60;
const PUBLIC_CACHE_SWR_SECONDS = 300;
const EPOCH_CACHE_TTL_SECONDS = 86_400;

const localEpochs = new Map<string, number>();

export const bumpStoreEdgeCacheSync = (storeDomain: string): number => {
  const key = storeDomain.trim().toLowerCase();
  if (!key) return 0;
  const next = (localEpochs.get(key) ?? 0) + 1;
  localEpochs.set(key, next);
  return next;
};

export const bumpStoreEdgeCache = async (storeDomain: string): Promise<void> => {
  const key = storeDomain.trim().toLowerCase();
  if (!key) return;
  const next = bumpStoreEdgeCacheSync(key);
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default ?? null : null;
  if (!cache) return;
  const value = `${Date.now()}-${next}`;
  try {
    await cache.put(
      new Request(`${EDGE_CACHE_ORIGIN}/sapo-reviews-epoch/${encodeURIComponent(key)}`, { method: 'GET' }),
      new Response(value, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': `public, max-age=${EPOCH_CACHE_TTL_SECONDS}`,
        },
      }),
    );
  } catch {
    // Best-effort cache epoch update.
  }
};

export const getStoreEdgeCacheEpoch = async (storeDomain: string): Promise<string> => {
  const key = storeDomain.trim().toLowerCase();
  const local = localEpochs.get(key) ?? 0;
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default ?? null : null;
  if (!cache) return `0:${local}`;
  try {
    const hit = await cache.match(
      new Request(`${EDGE_CACHE_ORIGIN}/sapo-reviews-epoch/${encodeURIComponent(key)}`, { method: 'GET' }),
    );
    if (!hit) return `0:${local}`;
    const text = (await hit.text()).trim();
    return `${text || '0'}:${local}`;
  } catch {
    return `0:${local}`;
  }
};

export const PUBLIC_STORE_DOMAIN_HEADERS = [
  'x-store-domain',
  'x-shop-domain',
  'x-sapo-shop-domain',
  'x-store',
  'x-shop',
] as const;

export const PUBLIC_STORE_DOMAIN_QUERY_PARAMS = [
  'storeDomain',
  'shopDomain',
  'store',
  'shop',
  'domain',
] as const;

export const normalizePublicStoreDomain = normalizeStoreDomainCandidate;

export const extractPublicStoreDomain = (request: Request): string => {
  const url = new URL(request.url);
  for (const h of PUBLIC_STORE_DOMAIN_HEADERS) {
    const fromHeader = normalizePublicStoreDomain(request.headers.get(h));
    if (fromHeader) return fromHeader;
  }
  for (const q of PUBLIC_STORE_DOMAIN_QUERY_PARAMS) {
    const fromQuery = normalizePublicStoreDomain(url.searchParams.get(q));
    if (fromQuery) return fromQuery;
  }
  return '';
};

export const isCacheableStorefrontGet = (request: Request): boolean => {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/public/reviews') || url.pathname.startsWith('/api/public/qna');
};

export const serveStorefrontWithEdgeCache = async (
  request: Request,
  upstreamFetch: () => Promise<Response>,
): Promise<Response> => {
  const storeDomain = extractPublicStoreDomain(request);
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default ?? null : null;
  if (!storeDomain || !cache) {
    const upstream = await upstreamFetch();
    const outHeaders = new Headers(upstream.headers);
    if (upstream.status === 200) outHeaders.set('X-Edge-Cache', 'MISS');
    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
  }

  const epoch = await getStoreEdgeCacheEpoch(storeDomain);
  const url = new URL(request.url);
  const sortedParams = new URLSearchParams(url.searchParams);
  sortedParams.set('_sd', storeDomain);
  sortedParams.sort();
  const cacheKey = new Request(
    `${EDGE_CACHE_ORIGIN}/sapo-reviews-public/${encodeURIComponent(storeDomain)}/${encodeURIComponent(epoch)}${url.pathname}?${sortedParams.toString()}`,
    { method: 'GET' },
  );

  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-Edge-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }
  } catch {
    // Fallback to upstream on cache read error.
  }

  const upstream = await upstreamFetch();
  if (upstream.status !== 200) {
    return upstream;
  }

  const bytes = await upstream.arrayBuffer();
  const cacheControl = `public, max-age=${PUBLIC_CACHE_TTL_SECONDS}, stale-while-revalidate=${PUBLIC_CACHE_SWR_SECONDS}`;
  try {
    const toCacheHeaders = new Headers(upstream.headers);
    toCacheHeaders.set('Cache-Control', cacheControl);
    toCacheHeaders.set('X-Edge-Cache', 'HIT');
    await cache.put(cacheKey, new Response(bytes.slice(0), { status: 200, headers: toCacheHeaders }));
  } catch {
    // Ignore cache write errors.
  }

  const outHeaders = new Headers(upstream.headers);
  outHeaders.set('Cache-Control', cacheControl);
  outHeaders.set('X-Edge-Cache', 'MISS');
  return new Response(bytes, { status: 200, headers: outHeaders });
};
