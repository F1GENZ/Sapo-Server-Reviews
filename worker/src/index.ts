import { createHmac, timingSafeEqual } from 'node:crypto';
import './shims/nestjs-common';
import {
  bumpStoreEdgeCache,
  evictSapoMediaEdgeCache,
  extractPublicStoreDomain,
  isCacheableStorefrontGet,
  isValidSapoMediaKey,
  peekSessionStoreDomain,
  serveSapoMediaWithEdgeCache,
  serveStorefrontWithEdgeCache,
} from './edge-cache';
import type { WorkerEnv } from './env';
import { StoreDO, type SapoQueueEvent } from './store-do';

export { StoreDO };

const STOREFRONT_ASSET_CACHE_CONTROL = 'public, max-age=14400, stale-while-revalidate=300';

const getStoreStub = (env: WorkerEnv): DurableObjectStub<StoreDO> => {
  const ns = env.STORE_DO ?? env.STORE;
  if (!ns) {
    throw new Error('STORE_DO DurableObjectNamespace binding is missing');
  }
  return ns.get(ns.idFromName('global'), { locationHint: 'apac' }) as DurableObjectStub<StoreDO>;
};

const clientIp = (request: Request): string =>
  request.headers.get('cf-connecting-ip') ||
  (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
  '127.0.0.1';

const extractSapoMediaKey = (pathname: string): string | null => {
  const lower = pathname.toLowerCase();
  if (lower.startsWith('/api/public/media/file/')) {
    return decodeURIComponent(pathname.slice('/api/public/media/file/'.length));
  }
  if (lower.startsWith('/api/media/file/')) {
    return decodeURIComponent(pathname.slice('/api/media/file/'.length));
  }
  if (lower.startsWith('/media/')) {
    return decodeURIComponent(pathname.slice('/media/'.length));
  }
  return null;
};

const verifySapoBearerSessionStore = (request: Request, env: WorkerEnv): string | null => {
  const secret = String(env.APP_SESSION_SECRET ?? '').trim();
  if (secret.length < 32) return null;
  const auth = request.headers.get('authorization') || '';
  if (!/^Bearer\s+/i.test(auth)) return null;
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url'));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const raw: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!raw || typeof raw !== 'object') return null;
    const now = Math.floor(Date.now() / 1000);
    if (
      !('type' in raw) ||
      raw.type !== 'sapo_app_session' ||
      !('storeDomain' in raw) ||
      typeof raw.storeDomain !== 'string' ||
      !raw.storeDomain ||
      !('exp' in raw) ||
      typeof raw.exp !== 'number' ||
      raw.exp <= now ||
      !('gen' in raw) ||
      !Number.isInteger(raw.gen)
    ) {
      return null;
    }
    return raw.storeDomain.trim().toLowerCase();
  } catch {
    return null;
  }
};

const recordSapoAnalytics = (
  env: WorkerEnv,
  request: Request,
  pathname: string,
  response: Response,
  startMs: number,
): Response => {
  if (env.ANALYTICS) {
    const latencyMs = Math.max(0, Date.now() - startMs);
    const cacheStatus = response.headers.get('X-Edge-Cache') || 'BYPASS';
    try {
      env.ANALYTICS.writeDataPoint({
        blobs: ['f1genz-sapo-reviews-api', request.method, pathname, cacheStatus],
        doubles: [response.status, latencyMs],
        indexes: ['f1genz-sapo-reviews-api'],
      });
    } catch {
      // Non-blocking Analytics Engine write.
    }
  }
  return response;
};

export const handleSapoQueue = async (batch: MessageBatch<unknown>, env: WorkerEnv): Promise<void> => {
  const grouped = new Map<string, { messages: Message<unknown>[]; events: SapoQueueEvent[] }>();
  for (const msg of batch.messages) {
    const body = msg.body as Partial<SapoQueueEvent> | null;
    const storeDomain = typeof body?.storeDomain === 'string' ? body.storeDomain.trim().toLowerCase() : '';
    if (!storeDomain || !body?.kind) {
      msg.ack();
      continue;
    }
    const group = grouped.get(storeDomain) ?? { messages: [], events: [] };
    group.messages.push(msg);
    group.events.push({
      kind: body.kind,
      storeDomain,
      eventId: typeof body.eventId === 'string' ? body.eventId : undefined,
      deliveryId: typeof body.deliveryId === 'string' ? body.deliveryId : undefined,
      productId: typeof body.productId === 'string' ? body.productId : undefined,
      timestamp: typeof body.timestamp === 'number' ? body.timestamp : Date.now(),
    });
    grouped.set(storeDomain, group);
  }

  if (grouped.size === 0) return;

  const allEvents = [...grouped.values()].flatMap((g) => g.events);
  try {
    await getStoreStub(env).processQueuedBatch(allEvents);
    for (const [storeDomain, group] of grouped) {
      await bumpStoreEdgeCache(storeDomain);
      for (const msg of group.messages) msg.ack();
    }
  } catch (error) {
    console.error('sapo queue batch failed', error instanceof Error ? error.message : String(error));
    for (const group of grouped.values()) {
      for (const msg of group.messages) msg.retry();
    }
  }
};

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const startMs = Date.now();
    const url = new URL(request.url);
    // 1. Fast edge health probes
    if (
      request.method === 'GET' &&
      (url.pathname === '/livez' || url.pathname === '/health' || url.pathname === '/healthz' || url.pathname === '/api/healthz')
    ) {
      return recordSapoAnalytics(
        env,
        request,
        url.pathname,
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        }),
        startMs,
      );
    }
    // 1b. Block /api/internal/import/* at edge when MIGRATION_IMPORT_TOKEN is disabled
    if (url.pathname.startsWith('/api/internal/import/') && !String(env.MIGRATION_IMPORT_TOKEN ?? '').trim()) {
      return recordSapoAnalytics(
        env,
        request,
        url.pathname,
        new Response(
          JSON.stringify({
            message: `Cannot ${request.method} ${url.pathname}`,
            error: 'Not Found',
            statusCode: 404,
          }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
            },
          },
        ),
        startMs,
      );
    }

    // 2. Storefront static widget JS/CSS
    if (
      request.method === 'GET' &&
      (url.pathname === '/storefront/f1genz-storefront.js' || url.pathname === '/storefront/f1genz-storefront.css') &&
      env.ASSETS
    ) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status === 200) {
        const isJs = url.pathname.endsWith('.js');
        return recordSapoAnalytics(
          env,
          request,
          url.pathname,
          new Response(assetRes.body, {
            status: 200,
            headers: {
              'Content-Type': isJs ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8',
              'Cache-Control': STOREFRONT_ASSET_CACHE_CONTROL,
              'Access-Control-Allow-Origin': '*',
              'X-Content-Type-Options': 'nosniff',
            },
          }),
          startMs,
        );
      }
    }

    // 2b. R2 Media Edge Cache route (/api/public/media/file/*, /api/media/file/*, /media/*)
    const mediaKey = extractSapoMediaKey(url.pathname);
    if (mediaKey !== null) {
      if (request.method === 'GET' || request.method === 'HEAD') {
        const mediaRes = await serveSapoMediaWithEdgeCache(request, env.MEDIA_BUCKET, mediaKey);
        return recordSapoAnalytics(env, request, url.pathname, mediaRes, startMs);
      }
      if (request.method === 'DELETE') {
        const cleanKey = mediaKey.replace(/^\/+/, '');
        if (!isValidSapoMediaKey(cleanKey)) {
          return recordSapoAnalytics(
            env,
            request,
            url.pathname,
            new Response(
              JSON.stringify({ message: 'Media not found', error: 'Not Found', statusCode: 404 }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
              },
            ),
            startMs,
          );
        }
        const keyStoreDomain = cleanKey.split('/')[1] || '';
        const sessionStore = verifySapoBearerSessionStore(request, env);
        if (!sessionStore || sessionStore !== keyStoreDomain) {
          return recordSapoAnalytics(
            env,
            request,
            url.pathname,
            new Response(
              JSON.stringify({ message: 'Missing or invalid auth', error: 'Unauthorized', statusCode: 401 }),
              {
                status: 401,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
              },
            ),
            startMs,
          );
        }
        if (env.MEDIA_BUCKET) {
          await env.MEDIA_BUCKET.delete(cleanKey).catch(() => undefined);
        }
        await evictSapoMediaEdgeCache([cleanKey]);
        return recordSapoAnalytics(
          env,
          request,
          url.pathname,
          new Response(JSON.stringify({ ok: true, deleted: true, key: cleanKey }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          }),
          startMs,
        );
      }
    }

    // 3. Edge rate limit on public storefront API
    if (url.pathname.startsWith('/api/public/') && env.PUBLIC_SAPO_RATE_LIMITER) {
      const { success } = await env.PUBLIC_SAPO_RATE_LIMITER.limit({
        key: `${url.pathname}:${clientIp(request)}`,
      });
      if (!success) {
        return recordSapoAnalytics(
          env,
          request,
          url.pathname,
          new Response(
            JSON.stringify({
              message: 'Too many requests, please try again later.',
              error: 'Too Many Requests',
              statusCode: 429,
            }),
            {
              status: 429,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Retry-After': '60',
                'X-Content-Type-Options': 'nosniff',
              },
            },
          ),
          startMs,
        );
      }
    }

    const forwardToStore = () => getStoreStub(env).fetch(request);

    // 4. Edge Cache for public storefront GET endpoints
    if (isCacheableStorefrontGet(request)) {
      const cachedRes = await serveStorefrontWithEdgeCache(request, forwardToStore);
      return recordSapoAnalytics(env, request, url.pathname, cachedRes, startMs);
    }

    let response = await forwardToStore();
    const evictedMediaHeader = response.headers.get('x-evict-media-keys');
    if (evictedMediaHeader) {
      const keys = evictedMediaHeader.split(',').map((k) => k.trim()).filter(Boolean);
      if (keys.length > 0) {
        await evictSapoMediaEdgeCache(keys);
      }
      const cleanedHeaders = new Headers(response.headers);
      cleanedHeaders.delete('x-evict-media-keys');
      response = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: cleanedHeaders,
      });
    }
    if (
      request.method !== 'GET' &&
      request.method !== 'HEAD' &&
      request.method !== 'OPTIONS' &&
      response.status < 400
    ) {
      const targetStore =
        extractPublicStoreDomain(request) ||
        peekSessionStoreDomain(request) ||
        normalizeStoreHeader(request);
      if (targetStore) {
        await bumpStoreEdgeCache(targetStore);
      }
    }
    return recordSapoAnalytics(env, request, url.pathname, response, startMs);
  },
  async queue(batch: MessageBatch<unknown>, env: WorkerEnv): Promise<void> {
    await handleSapoQueue(batch, env);
  },
} satisfies ExportedHandler<WorkerEnv>;

const normalizeStoreHeader = (request: Request): string => {
  const raw = request.headers.get('x-sapo-shop-domain') || request.headers.get('x-shop-domain') || '';
  return raw.trim().toLowerCase();
};
