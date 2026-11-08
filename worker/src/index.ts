import './shims/nestjs-common';
import {
  bumpStoreEdgeCache,
  extractPublicStoreDomain,
  isCacheableStorefrontGet,
  peekSessionStoreDomain,
  serveStorefrontWithEdgeCache,
} from './edge-cache';
import type { WorkerEnv } from './env';
import { StoreDO } from './store-do';

export { StoreDO };

const STOREFRONT_ASSET_CACHE_CONTROL = 'public, max-age=14400, stale-while-revalidate=300';

const getStoreStub = (env: WorkerEnv): DurableObjectStub => {
  const ns = env.STORE_DO ?? env.STORE;
  if (!ns) {
    throw new Error('STORE_DO DurableObjectNamespace binding is missing');
  }
  return ns.get(ns.idFromName('global'), { locationHint: 'apac' });
};

const clientIp = (request: Request): string =>
  request.headers.get('cf-connecting-ip') ||
  (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
  '127.0.0.1';

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    // 1. Fast edge health probes
    if (
      request.method === 'GET' &&
      (url.pathname === '/livez' || url.pathname === '/health' || url.pathname === '/healthz' || url.pathname === '/api/healthz')
    ) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    // 1b. Block /api/internal/import/* at edge when MIGRATION_IMPORT_TOKEN is disabled
    if (url.pathname.startsWith('/api/internal/import/') && !String(env.MIGRATION_IMPORT_TOKEN ?? '').trim()) {
      return new Response(
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
        return new Response(assetRes.body, {
          status: 200,
          headers: {
            'Content-Type': isJs ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8',
            'Cache-Control': STOREFRONT_ASSET_CACHE_CONTROL,
            'Access-Control-Allow-Origin': '*',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
    }

    // 3. Edge rate limit on public storefront API
    if (url.pathname.startsWith('/api/public/') && env.PUBLIC_SAPO_RATE_LIMITER) {
      const { success } = await env.PUBLIC_SAPO_RATE_LIMITER.limit({
        key: `${url.pathname}:${clientIp(request)}`,
      });
      if (!success) {
        return new Response(
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
        );
      }
    }

    const forwardToStore = () => getStoreStub(env).fetch(request);

    // 4. Edge Cache for public storefront GET endpoints
    if (isCacheableStorefrontGet(request)) {
      return serveStorefrontWithEdgeCache(request, forwardToStore);
    }

    const response = await forwardToStore();
    if (
      request.method !== 'GET' &&
      request.method !== 'HEAD' &&
      request.method !== 'OPTIONS' &&
      response.status < 400
    ) {
      const targetStore = extractPublicStoreDomain(request) || peekSessionStoreDomain(request);
      if (targetStore) {
        await bumpStoreEdgeCache(targetStore);
      }
    }
    return response;
  },
} satisfies ExportedHandler<WorkerEnv>;
