import { timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { BadRequestException, HttpException, NotFoundException, Reflector, UnauthorizedException } from '@nestjs/common';
import { AiController } from './core/ai/ai.controller';
import { AiService } from './core/ai/ai.service';
import { CatalogProductStoreService } from './core/catalog/catalog-product-store.service';
import { CatalogSyncService } from './core/catalog/catalog-sync.service';
import { ProductsController } from './core/catalog/products.controller';
import { ShopAuthGuard } from './core/common/guards/shop-auth.guard';
import { NumericIdPipe } from './core/common/pipes/numeric-id.pipe';
import { IngressRateLimitService } from './core/common/security/ingress-rate-limit.service';
import { sanitizePublicResponse } from './core/common/security/public-response';
import { DashboardController } from './core/dashboard/dashboard.controller';
import { DashboardService } from './core/dashboard/dashboard.service';
import { HealthController } from './core/health/health.controller';
import { MediaController } from './core/media/media.controller';
import { PublicMediaController } from './core/media/public-media.controller';
import { PublicMediaGuard } from './core/media/public-media.guard';
import { MetafieldSyncPendingService } from './core/database/metafield-sync-pending.service';
import { DurabilitySweepService } from './core/ops/durability-sweep.service';
import { OpsController } from './core/ops/ops.controller';
import { OpsService } from './core/ops/ops.service';
import { OutboundDispatcherService } from './core/outbound/outbound-dispatcher.service';
import { OutboundWebhookController } from './core/outbound/outbound-webhook.controller';
import { OutboundWebhookService } from './core/outbound/outbound-webhook.service';
import { PurchaseStoreService } from './core/purchase/purchase-store.service';
import { PublicQnaController } from './core/qna/public-qna.controller';
import { QnaController } from './core/qna/qna.controller';
import { QnaDataToolsService } from './core/qna/qna-data-tools.service';
import { QnaStoreService } from './core/qna/qna-store.service';
import { QnaService } from './core/qna/qna.service';
import { PublicReviewController } from './core/review/public-review.controller';
import { ReviewController } from './core/review/review.controller';
import { ReviewDataToolsService } from './core/review/review-data-tools.service';
import { ReviewProductStoreService } from './core/review/review-product-store.service';
import { ReviewService } from './core/review/review.service';
import { HmacVerifierService } from './core/sapo/hmac-verifier.service';
import { LifecycleLockService } from './core/sapo/lifecycle-lock.service';
import { OAuthStateService } from './core/sapo/oauth-state.service';
import { SapoApiService } from './core/sapo/sapo-api.service';
import { SapoController } from './core/sapo/sapo.controller';
import { SapoService } from './core/sapo/sapo.service';
import { SessionService } from './core/sapo/session.service';
import { ShopDomainService } from './core/sapo/shop-domain.service';
import { TokenEncryptionService } from './core/sapo/token-encryption.service';
import { UninstallService } from './core/sapo/uninstall.service';
import { WebhookRegistrationService } from './core/sapo/webhook-registration.service';
import { WebhookService } from './core/sapo/webhook.service';
import { StorefrontService } from './core/storefront/storefront.service';
import type { PrismaService } from './core/database/prisma.service';
import type { RedisService } from './core/redis/redis.service';
import type { PrismaSqliteService } from './db/prisma-sqlite';
import type { SqliteRedisService } from './db/sqlite-redis';
import { bumpStoreEdgeCache, normalizePublicStoreDomain } from './edge-cache';
import { buildAppEnv, type WorkerEnv } from './env';
import { WorkerMediaService } from './media/worker-media.service';

export interface AppContainer {
  prisma: PrismaSqliteService;
  redis: SqliteRedisService;
  env: ReturnType<typeof buildAppEnv>;
  workerEnv: WorkerEnv;
  sapoService: SapoService;
  webhookService: WebhookService;
  durabilitySweep: DurabilitySweepService;
  mediaService: WorkerMediaService;
}

interface ExpressReqLike {
  method: string;
  url: string;
  originalUrl: string;
  path: string;
  ip: string;
  socket: { remoteAddress: string };
  headers: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  rawBody?: Buffer;
  storeDomain?: string;
  token?: string;
  sapoTokenExpired?: boolean;
  publicStoreDomain?: string;
}

interface ExpressResLike {
  statusCode: number;
  headers: Headers;
  redirectLocation: string | null;
  sentBody: unknown;
  hasSent: boolean;
  status(code: number): ExpressResLike;
  setHeader(name: string, value: string | string[]): ExpressResLike;
  set(name: string, value: string): ExpressResLike;
  redirect(codeOrUrl: number | string, maybeUrl?: string): void;
  json(payload: unknown): void;
  send(payload: unknown): void;
}

const numericIdPipe = new NumericIdPipe();

const parseIntOrDefault = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new BadRequestException('Validation failed (numeric string is expected)');
  }
  return parsed;
};

const parseOptionalInt = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw === '') return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new BadRequestException('Validation failed (numeric string is expected)');
  }
  return parsed;
};

const safeTokenEqual = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

const buildExpressAdapters = async (
  c: Context,
  options: { parseBody?: boolean; keepRawBody?: boolean } = {},
): Promise<{ req: ExpressReqLike; res: ExpressResLike }> => {
  const url = new URL(c.req.url);
  const headersObj: Record<string, string> = {};
  c.req.raw.headers.forEach((v, k) => {
    headersObj[k.toLowerCase()] = v;
  });
  const queryObj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    queryObj[k] = v;
  });
  if (url.pathname.startsWith('/api/public/') || url.pathname.startsWith('/api/oauth/')) {
    const headerAlias =
      headersObj['x-store-domain'] ||
      headersObj['x-shop-domain'] ||
      headersObj['x-sapo-shop-domain'] ||
      headersObj['x-store'] ||
      headersObj['x-shop'];
    if (headerAlias) {
      headersObj['x-store-domain'] =
        c.req.method === 'GET' || c.req.method === 'HEAD' || headerAlias.includes('.')
          ? normalizePublicStoreDomain(headerAlias)
          : headerAlias.trim().toLowerCase();
    }
    const queryAlias =
      queryObj.storeDomain ||
      queryObj.shopDomain ||
      queryObj.store ||
      queryObj.shop ||
      queryObj.domain;
    if (queryAlias) {
      queryObj.storeDomain = normalizePublicStoreDomain(queryAlias);
    }
    if (queryObj.store) {
      queryObj.store = normalizePublicStoreDomain(queryObj.store);
    }
  }
  let body: unknown = {};
  let rawBody: Buffer | undefined;
  if (options.parseBody && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const ab = await c.req.raw.clone().arrayBuffer();
    rawBody = Buffer.from(ab);
    if (rawBody.length > 0) {
      const ct = headersObj['content-type'] ?? '';
      if (ct.includes('application/json') || ct === '') {
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          throw new BadRequestException('Invalid JSON payload');
        }
      } else if (ct.includes('application/x-www-form-urlencoded')) {
        const sp = new URLSearchParams(rawBody.toString('utf8'));
        const formObj: Record<string, string> = {};
        sp.forEach((v, k) => {
          formObj[k] = v;
        });
        body = formObj;
      }
    }
  }

  const clientIp =
    headersObj['cf-connecting-ip'] ||
    (headersObj['x-forwarded-for'] ? headersObj['x-forwarded-for'].split(',')[0].trim() : '') ||
    '127.0.0.1';

  const req: ExpressReqLike = {
    method: c.req.method,
    url: `${url.pathname}${url.search}`,
    originalUrl: `${url.pathname}${url.search}`,
    path: url.pathname,
    ip: clientIp,
    socket: { remoteAddress: clientIp },
    headers: headersObj,
    query: queryObj,
    body,
    rawBody: options.keepRawBody ? rawBody : undefined,
  };

  const resHeaders = new Headers();
  const res: ExpressResLike = {
    statusCode: 200,
    headers: resHeaders,
    redirectLocation: null,
    sentBody: undefined,
    hasSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string | string[]) {
      if (Array.isArray(value)) {
        resHeaders.delete(name);
        for (const v of value) resHeaders.append(name, v);
      } else {
        resHeaders.set(name, value);
      }
      return this;
    },
    set(name: string, value: string) {
      resHeaders.set(name, value);
      return this;
    },
    redirect(codeOrUrl: number | string, maybeUrl?: string) {
      if (typeof codeOrUrl === 'number') {
        this.statusCode = codeOrUrl;
        this.redirectLocation = maybeUrl ?? '/';
      } else {
        this.statusCode = 302;
        this.redirectLocation = codeOrUrl;
      }
      resHeaders.set('Location', this.redirectLocation);
      this.hasSent = true;
    },
    json(payload: unknown) {
      this.sentBody = payload;
      this.hasSent = true;
    },
    send(payload: unknown) {
      this.sentBody = payload;
      this.hasSent = true;
    },
  };

  return { req, res };
};

const finalizeResponse = (res: ExpressResLike, returnVal: unknown, defaultStatus = 200): Response => {
  if (res.redirectLocation) {
    return new Response(null, { status: res.statusCode || 302, headers: res.headers });
  }
  const status = res.statusCode !== 200 ? res.statusCode : defaultStatus;
  const payload = res.hasSent ? res.sentBody : returnVal;
  if (typeof payload === 'string') {
    if (!res.headers.has('Content-Type')) {
      res.headers.set('Content-Type', 'text/plain; charset=utf-8');
    }
    return new Response(payload, { status, headers: res.headers });
  }
  res.headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload ?? {}), { status, headers: res.headers });
};

export const createApp = (
  prisma: PrismaSqliteService,
  redis: SqliteRedisService,
  workerEnv: WorkerEnv,
): { app: Hono; container: AppContainer } => {
  const env = buildAppEnv(workerEnv);
  const prismaAsService = prisma as unknown as PrismaService;
  const redisAsService = redis as unknown as RedisService;

  const rateLimit = new IngressRateLimitService(redisAsService);
  const tokenEncryption = new TokenEncryptionService(env);
  const hmacVerifier = new HmacVerifierService(env);
  const oauthState = new OAuthStateService(redisAsService);
  const sessionService = new SessionService(env, redisAsService);
  const lifecycleLock = new LifecycleLockService(redisAsService);
  const shopDomainService = new ShopDomainService(redisAsService, prismaAsService);
  const sapoApiService = new SapoApiService(env);
  const webhookRegistrationService = new WebhookRegistrationService(sapoApiService, env, prismaAsService);
  const storefrontService = new StorefrontService(sapoApiService, env);
  const uninstallService = new UninstallService(
    prismaAsService,
    redisAsService,
    shopDomainService,
    lifecycleLock,
    sessionService,
  );
  const catalogProductStore = new CatalogProductStoreService(prismaAsService);
  const catalogSync = new CatalogSyncService(sapoApiService, catalogProductStore, prismaAsService);
  const sapoService = new SapoService(
    env,
    prismaAsService,
    oauthState,
    sapoApiService,
    sessionService,
    tokenEncryption,
    shopDomainService,
    lifecycleLock,
    webhookRegistrationService,
    storefrontService,
    catalogSync,
  );

  const purchaseStore = new PurchaseStoreService(prismaAsService, env);
  const pendingMetafields = new MetafieldSyncPendingService(prismaAsService);
  const outboundDispatcher = new OutboundDispatcherService(env, prismaAsService, tokenEncryption);
  const outboundWebhookService = new OutboundWebhookService(
    env,
    prismaAsService,
    tokenEncryption,
    outboundDispatcher,
  );
  const mediaService = new WorkerMediaService(env, redisAsService, workerEnv.MEDIA_BUCKET);

  const reviewProductStore = new ReviewProductStoreService(prismaAsService);
  const reviewService = new ReviewService(
    redisAsService,
    prismaAsService,
    sapoApiService,
    reviewProductStore,
    catalogProductStore,
    purchaseStore,
    pendingMetafields,
    mediaService,
    outboundWebhookService,
  );
  const reviewDataTools = new ReviewDataToolsService(
    prismaAsService,
    reviewProductStore,
    reviewService,
    catalogProductStore,
    pendingMetafields,
    mediaService,
    outboundWebhookService,
  );

  const qnaStore = new QnaStoreService(prismaAsService);
  const qnaService = new QnaService(
    prismaAsService,
    qnaStore,
    catalogProductStore,
    outboundWebhookService,
  );
  const qnaDataTools = new QnaDataToolsService(
    prismaAsService,
    qnaStore,
    catalogProductStore,
    outboundWebhookService,
  );

  const webhookService = new WebhookService(
    prismaAsService,
    hmacVerifier,
    shopDomainService,
    uninstallService,
    sapoService,
    catalogSync,
    purchaseStore,
  );

  const dashboardService = new DashboardService(reviewProductStore, qnaStore, prismaAsService);
  const opsService = new OpsService(
    env,
    sapoService,
    webhookRegistrationService,
    catalogSync,
    catalogProductStore,
    reviewProductStore,
    qnaStore,
    purchaseStore,
    prismaAsService,
    storefrontService,
    pendingMetafields,
    redisAsService,
    sapoApiService,
    reviewService,
  );
  const durabilitySweep = new DurabilitySweepService(
    env,
    redisAsService,
    reviewService,
    webhookService,
    sapoService,
    prismaAsService,
    mediaService,
    outboundDispatcher,
  );
  const aiService = new AiService(env, rateLimit, workerEnv.AI ?? null);

  const reflector = new Reflector();
  const shopAuthGuard = new ShopAuthGuard(env, sessionService, sapoService, reflector);
  const publicMediaGuard = new PublicMediaGuard(mediaService, sapoService, env, rateLimit);

  const healthController = new HealthController(env, prismaAsService, redisAsService);
  const sapoController = new SapoController(env, sapoService, hmacVerifier, sessionService, webhookService, rateLimit);
  const publicReviewController = new PublicReviewController(reviewService, sapoService, env, rateLimit);
  const publicQnaController = new PublicQnaController(qnaService, reviewService, env, rateLimit);
  const publicMediaController = new PublicMediaController(mediaService, reviewService);
  const reviewController = new ReviewController(reviewService, reviewDataTools);
  const qnaController = new QnaController(qnaService, qnaDataTools);
  const productsController = new ProductsController(prismaAsService, catalogProductStore);
  const dashboardController = new DashboardController(dashboardService);
  const opsController = new OpsController(opsService);
  const mediaController = new MediaController(mediaService);
  const outboundWebhookController = new OutboundWebhookController(outboundWebhookService);
  const aiController = new AiController(aiService);

  const requireShopAuth = async (req: ExpressReqLike, res: ExpressResLike): Promise<void> => {
    await shopAuthGuard.canActivate({
      switchToHttp: () => ({
        getRequest: <T = unknown>() => req as unknown as T,
        getResponse: <T = unknown>() => res as unknown as T,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    });
  };

  const requirePublicMediaAuth = async (req: ExpressReqLike, res: ExpressResLike): Promise<void> => {
    await publicMediaGuard.canActivate({
      switchToHttp: () => ({
        getRequest: <T = unknown>() => req as unknown as T,
        getResponse: <T = unknown>() => res as unknown as T,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    });
  };

  const app = new Hono();

  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    const isPublic = c.req.path.startsWith('/api/public/') || c.req.path.startsWith('/storefront/');
    const allowedOrigin = isPublic
      ? origin || '*'
      : origin && (env.CORS_ALLOWED_ORIGINS.includes(origin) || origin === env.FRONTEND_URL)
        ? origin
        : null;

    if (c.req.method === 'OPTIONS') {
      const headers = new Headers({
        'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Store-Domain,X-Shop-Domain,X-Upload-Token,X-Sapo-Hmac-Sha256,X-Sapo-Topic,X-Sapo-Shop-Domain',
        'Access-Control-Max-Age': '600',
        'X-Content-Type-Options': 'nosniff',
      });
      if (allowedOrigin) {
        headers.set('Access-Control-Allow-Origin', allowedOrigin);
        if (allowedOrigin !== '*') headers.set('Access-Control-Allow-Credentials', 'true');
        headers.set('Vary', 'Origin');
      }
      return new Response(null, { status: 204, headers });
    }

    await next();

    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    if (allowedOrigin) {
      c.res.headers.set('Access-Control-Allow-Origin', allowedOrigin);
      if (allowedOrigin !== '*') c.res.headers.set('Access-Control-Allow-Credentials', 'true');
      c.res.headers.set('Vary', 'Origin');
    }
  });

  app.onError((err, c) => {
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const response = err.getResponse();
      const body =
        typeof response === 'string'
          ? { message: response, statusCode: status }
          : response;
      return c.json(body, status as 400);
    }
    return c.json(
      {
        message: err instanceof Error ? err.message : 'Internal server error',
        error: 'Internal Server Error',
        statusCode: 500,
      },
      500,
    );
  });

  app.notFound((c) =>
    c.json(
      {
        message: `Cannot ${c.req.method} ${new URL(c.req.url).pathname}`,
        error: 'Not Found',
        statusCode: 404,
      },
      404,
    ),
  );

  // Health & Readiness
  app.get('/livez', () => new Response(JSON.stringify(healthController.livez()), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }));
  app.get('/health', () => new Response(JSON.stringify(healthController.livez()), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }));
  app.get('/healthz', () => new Response(JSON.stringify(healthController.livez()), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }));
  app.get('/api/healthz', () => new Response(JSON.stringify(healthController.livez()), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }));
  app.get('/readyz', async (c) => {
    const result = await healthController.readyz(c.req.header('authorization'));
    return c.json(result, 200);
  });

  // Internal Migration Import Routes (disabled when MIGRATION_IMPORT_TOKEN is empty)
  app.use('/api/internal/import/*', async (c, next) => {
    const token = String(workerEnv.MIGRATION_IMPORT_TOKEN ?? '').trim();
    if (!token) {
      throw new NotFoundException(`Cannot ${c.req.method} ${new URL(c.req.url).pathname}`);
    }
    const provided = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!safeTokenEqual(provided, token)) {
      throw new UnauthorizedException('Invalid migration import token');
    }
    await next();
  });

  app.post('/api/internal/import/dump', async (c) => {
    const payload = (await c.req.json()) as {
      reset?: boolean;
      tables?: Record<string, Array<Record<string, unknown>>>;
    };
    const counts = prisma.importDatabaseDump(payload.tables ?? {}, Boolean(payload.reset));
    return c.json({ ok: true, counts });
  });
  app.post('/api/internal/import/reset', (c) => {
    prisma.importDatabaseDump({}, true);
    return c.json({ ok: true });
  });

  app.post('/api/internal/import/batch', async (c) => {
    const payload = (await c.req.json()) as {
      table?: string;
      rows?: Array<Record<string, unknown>>;
    };
    const table = String(payload.table ?? '');
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const counts = prisma.importDatabaseDump({ [table]: rows }, false);
    return c.json({ ok: true, table, inserted: counts[table] ?? 0 });
  });

  app.get('/api/internal/import/digest', (c) => {
    return c.json({ ok: true, stats: prisma.exportDatabaseStats() });
  });

  // Sapo OAuth / Auth / Session / Webhooks
  app.get('/api/oauth/install/login', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const out = await sapoController.startLogin(req as never, req.query.storeDomain, req.query.redirect, res as never);
    return finalizeResponse(res, out);
  });
  app.post('/api/oauth/install/login', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    const b = (req.body ?? {}) as Record<string, string>;
    const rawStoreDomain = b.storeDomain || b.shopDomain || b.store || b.shop || b.domain || req.query.storeDomain;
    const out = await sapoController.startLogin(
      req as never,
      rawStoreDomain ? normalizePublicStoreDomain(rawStoreDomain) : undefined,
      b.redirect || req.query.redirect,
    );
    return finalizeResponse(res, out);
  });
  app.get('/api/oauth/install/login/entry', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const out = await sapoController.loginEntry(req as never, req.query.storeDomain, req.query.redirect);
    return finalizeResponse(res, out);
  });
  app.get('/api/oauth/install/login/verify-hmac', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const out = await sapoController.verifyHmac(req as never);
    return finalizeResponse(res, out);
  });
  app.get('/api/oauth/install/login/callback', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const out = await sapoController.loginCallbackGet(req as never, res as never, req.query.code, req.query.state);
    return finalizeResponse(res, out);
  });
  app.post('/api/oauth/install/login/callback', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    const b = (req.body ?? {}) as Record<string, string>;
    const out = await sapoController.loginCallbackPost(req as never, res as never, b.code, b.state);
    return finalizeResponse(res, out);
  });
  app.get('/api/oauth/install/start', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const out = await sapoController.installStart(req as never, req.query.storeDomain, res as never);
    return finalizeResponse(res, out);
  });
  app.get('/api/oauth/install', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const out = await sapoController.installStart(req as never, req.query.storeDomain || req.query.store, res as never);
    return finalizeResponse(res, out);
  });
  app.get('/api/oauth/install/callback', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const out = await sapoController.installCallbackGet(
      req as never,
      res as never,
      req.query.code,
      req.query.state,
      req.query.store,
    );
    return finalizeResponse(res, out);
  });
  app.post('/api/oauth/install/callback', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    const b = (req.body ?? {}) as Record<string, string>;
    const out = await sapoController.installCallbackPost(req as never, res as never, b.code, b.state);
    return finalizeResponse(res, out);
  });
  app.get('/api/oauth/install/webhooks', async (c) => {
    const { res } = await buildExpressAdapters(c);
    await sapoController.webhookChallenge(res as never);
    return finalizeResponse(res, undefined);
  });
  app.post('/api/oauth/install/webhooks', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true, keepRawBody: true });
    const out = await sapoController.webhookPost(req as never, req.body, req.query, req.headers);
    return finalizeResponse(res, out);
  });
  app.post('/api/webhooks/sapo', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true, keepRawBody: true });
    const out = await sapoController.webhookPost(req as never, req.body, req.query, req.headers);
    return finalizeResponse(res, out);
  });
  app.post('/api/auth/session/exchange', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    const b = (req.body ?? {}) as Record<string, string>;
    const out = await sapoController.sessionExchange(req as never, b.handoffCode, res as never);
    return finalizeResponse(res, out);
  });
  app.post('/api/auth/logout', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    const out = await sapoController.logout(req as never, res as never);
    return finalizeResponse(res, out);
  });
  app.post('/api/auth/session/logout', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    const out = await sapoController.logout(req as never, res as never);
    return finalizeResponse(res, out);
  });
  app.get('/api/app/session', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const out = await sapoController.sessionProbe(req as never);
    return finalizeResponse(res, out);
  });

  // Public Storefront Review Routes
  const handlePublicWidgetConfig = async (c: Context): Promise<Response> => {
    const { req, res } = await buildExpressAdapters(c);
    const out = await publicReviewController.getWidgetConfig(req.headers['x-store-domain'], req.query.storeDomain);
    return finalizeResponse(res, out);
  };
  app.get('/api/public/reviews/config/widget', handlePublicWidgetConfig);
  app.get('/api/public/reviews/widget-config', handlePublicWidgetConfig);

  app.get('/api/public/reviews/summaries', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const out = await publicReviewController.getSummaries(
      req.query.productIds,
      req.headers['x-store-domain'],
      req.query.storeDomain,
    );
    return finalizeResponse(res, out);
  });

  app.post('/api/public/reviews/:productId/purchase-eligibility', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    const productId = numericIdPipe.transform(c.req.param('productId'));
    const out = await publicReviewController.checkPurchaseEligibility(
      productId,
      req as never,
      req.body as never,
      req.headers['x-store-domain'],
      req.query.storeDomain,
    );
    return finalizeResponse(res, out);
  });

  app.get('/api/public/reviews/:productId/slider', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const productId = numericIdPipe.transform(c.req.param('productId'));
    const out = await publicReviewController.getSlider(
      productId,
      req.headers['x-store-domain'],
      req.query.storeDomain,
      req.query.limit,
    );
    return finalizeResponse(res, out);
  });

  app.get('/api/public/reviews/:productId/summary', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const productId = numericIdPipe.transform(c.req.param('productId'));
    const out = await publicReviewController.getSummary(
      productId,
      req.headers['x-store-domain'],
      req.query.storeDomain,
    );
    return finalizeResponse(res, out);
  });

  app.get('/api/public/reviews/:productId', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const productId = numericIdPipe.transform(c.req.param('productId'));
    const page = parseIntOrDefault(req.query.page, 1);
    const limit = parseIntOrDefault(req.query.limit, 20);
    const out = await publicReviewController.getReviews(
      productId,
      req.headers['x-store-domain'],
      req.query.storeDomain,
      page,
      limit,
      req.query.sort,
    );
    return finalizeResponse(res, out);
  });

  app.post('/api/public/reviews/:productId', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    const productId = numericIdPipe.transform(c.req.param('productId'));
    const storeDomain = normalizePublicStoreDomain(req.headers['x-store-domain'] || req.query.storeDomain || '');
    const out = await publicReviewController.submitReview(
      productId,
      req as never,
      req.body as never,
      req.headers['x-store-domain'],
      req.query.storeDomain,
    );
    if (storeDomain) await bumpStoreEdgeCache(storeDomain);
    return finalizeResponse(res, out, 201);
  });

  // Public Storefront QnA Routes
  app.get('/api/public/qna/:productId/summary', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const productId = numericIdPipe.transform(c.req.param('productId'));
    const out = await publicQnaController.getSummary(
      productId,
      req.headers['x-store-domain'],
      req.query.storeDomain,
    );
    return finalizeResponse(res, out);
  });

  app.get('/api/public/qna/:productId', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    const productId = numericIdPipe.transform(c.req.param('productId'));
    const page = parseIntOrDefault(req.query.page, 1);
    const limit = parseIntOrDefault(req.query.limit, 20);
    const out = await publicQnaController.getQuestions(
      productId,
      req.headers['x-store-domain'],
      req.query.storeDomain,
      page,
      limit,
    );
    return finalizeResponse(res, out);
  });

  app.post('/api/public/qna/:productId', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    const productId = numericIdPipe.transform(c.req.param('productId'));
    const storeDomain = normalizePublicStoreDomain(req.headers['x-store-domain'] || req.query.storeDomain || '');
    const out = await publicQnaController.submitQuestion(
      productId,
      req as never,
      req.body as never,
      req.headers['x-store-domain'],
      req.query.storeDomain,
    );
    if (storeDomain) await bumpStoreEdgeCache(storeDomain);
    return finalizeResponse(res, sanitizePublicResponse(req.path, out), 201);
  });

  // Public Media Routes (both /ticket used by storefront widget and /upload-ticket alias)
  const handlePublicMediaTicket = async (c: Context, defaultStatus: number): Promise<Response> => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requirePublicMediaAuth(req, res);
    const out = await publicMediaController.createTicket(req as never, req.body as never);
    return finalizeResponse(res, out, defaultStatus);
  };
  app.post('/api/public/media/ticket', (c) => handlePublicMediaTicket(c, 200));
  app.post('/api/public/media/upload-ticket', (c) => handlePublicMediaTicket(c, 201));

  app.post('/api/public/media/upload', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requirePublicMediaAuth(req, res);
    const formData = await c.req.raw.formData();
    const fileEntry = formData.get('file');
    if (!fileEntry || typeof fileEntry === 'string') {
      throw new BadRequestException('Missing file');
    }
    const fileBlob = fileEntry as File;
    const ab = await fileBlob.arrayBuffer();
    const uploadedFile = {
      buffer: Buffer.from(ab),
      mimetype: fileBlob.type || 'application/octet-stream',
      size: ab.byteLength,
    };
    const out = await publicMediaController.upload(
      uploadedFile,
      req as never,
      req.query.productId,
      req.query.ticket,
    );
    return finalizeResponse(res, out, 200);
  });

  // Admin Review Routes (mounted on both /api/admin/reviews and /api/reviews, plus settings on /api/settings)
  for (const base of ['/api/admin/reviews', '/api/reviews']) {
    app.get(`${base}/widget-config`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const out = await reviewController.getWidgetConfig(req as never);
      return finalizeResponse(res, out);
    });
    const handleUpdateWidgetConfig = async (c: Context) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const out = await reviewController.updateWidgetConfig(req.body as never, req as never);
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    };
    app.put(`${base}/widget-config`, handleUpdateWidgetConfig);
    app.patch(`${base}/widget-config`, handleUpdateWidgetConfig);
    app.get(`${base}/widget-config/revisions`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const out = await reviewController.widgetConfigRevisions(req as never);
      return finalizeResponse(res, out);
    });
    app.post(`${base}/widget-config/revisions/:revisionId/restore`, async (c) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const out = await reviewController.restoreWidgetConfigRevision(c.req.param('revisionId'), req as never);
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    });
    app.get(`${base}/spam-config`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const out = await reviewController.getSpamConfig(req as never);
      return finalizeResponse(res, out);
    });
    const handleUpdateSpamConfig = async (c: Context) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const out = await reviewController.updateSpamConfig(req.body as never, req as never);
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    };
    app.put(`${base}/spam-config`, handleUpdateSpamConfig);
    app.patch(`${base}/spam-config`, handleUpdateSpamConfig);
    app.post(`${base}/sync-metafield`, async (c) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const out = await reviewController.syncMetafield(req.body as never, req as never);
      return finalizeResponse(res, out);
    });
    app.get(`${base}/export`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const out = await reviewController.exportReviews(req.query.format, req as never);
      return finalizeResponse(res, out);
    });
    app.get(`${base}/import/history`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const out = await reviewController.importHistory(req as never);
      return finalizeResponse(res, out);
    });
    app.post(`${base}/import/dry-run`, async (c) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const out = await reviewController.importDryRun(req.body as never, req as never);
      return finalizeResponse(res, out);
    });
    app.post(`${base}/import`, async (c) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const out = await reviewController.importReviews(req.body as never, req as never);
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    });
    app.post(`${base}/bulk`, async (c) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const out = await reviewController.bulkReviews(req.body as never, req as never);
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    });
    app.get(base, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const rawLimit = req.query.limit ?? req.query.pageSize ?? req.query.size;
      const rawSort = req.query.sort ?? req.query.sortBy;
      const out = await reviewController.listAllReviews(
        parseIntOrDefault(req.query.page, 1),
        parseIntOrDefault(rawLimit, 20),
        req.query.status,
        rawSort,
        req.query.productId,
        req.query.search,
        req.query.star,
        req as never,
      );
      return finalizeResponse(res, out);
    });
    app.get(`${base}/:productId/stats`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId'));
      const out = await reviewController.getStats(productId, req as never);
      return finalizeResponse(res, out);
    });
    app.get(`${base}/:productId`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId'));
      const out = await reviewController.getReviews(productId, req.query.star, req as never);
      return finalizeResponse(res, out);
    });
    app.post(`${base}/:productId`, async (c) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId'));
      const out = await reviewController.createReview(productId, req.body as never, req as never);
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out, 201);
    });
    const handleReplyReview = async (c: Context) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId') ?? '');
      const out = await reviewController.replyToReview(
        productId,
        c.req.param('reviewId') ?? '',
        req.body as never,
        req as never,
      );
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    };
    app.patch(`${base}/:productId/:reviewId/reply`, handleReplyReview);
    app.put(`${base}/:productId/:reviewId/reply`, handleReplyReview);

    const handlePinReview = async (c: Context) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId') ?? '');
      const out = await reviewController.pinReview(
        productId,
        c.req.param('reviewId') ?? '',
        req as never,
        req.body as never,
      );
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    };
    app.patch(`${base}/:productId/:reviewId/pin`, handlePinReview);
    app.put(`${base}/:productId/:reviewId/pin`, handlePinReview);
    app.post(`${base}/:productId/:reviewId/pin`, handlePinReview);

    const handleStatusReview = async (c: Context) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId') ?? '');
      const out = await reviewController.updateStatus(
        productId,
        c.req.param('reviewId') ?? '',
        req.body as never,
        req as never,
      );
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    };
    app.patch(`${base}/:productId/:reviewId/status`, handleStatusReview);
    app.put(`${base}/:productId/:reviewId/status`, handleStatusReview);

    const handleUpdateReview = async (c: Context) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId') ?? '');
      const out = await reviewController.updateReview(
        productId,
        c.req.param('reviewId') ?? '',
        req.body as never,
        req as never,
      );
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    };
    app.patch(`${base}/:productId/:reviewId`, handleUpdateReview);
    app.put(`${base}/:productId/:reviewId`, handleUpdateReview);
    app.delete(`${base}/:productId/:reviewId`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId'));
      const out = await reviewController.deleteReview(productId, c.req.param('reviewId'), req as never);
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    });
  }

  // Settings alias routes (/api/settings/*)
  app.get('/api/settings/widget-config', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const out = await reviewController.getWidgetConfig(req as never);
    return finalizeResponse(res, out);
  });
  app.put('/api/settings/widget-config', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await reviewController.updateWidgetConfig(req.body as never, req as never);
    if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
    return finalizeResponse(res, out);
  });
  app.get('/api/settings/spam-config', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const out = await reviewController.getSpamConfig(req as never);
    return finalizeResponse(res, out);
  });
  app.put('/api/settings/spam-config', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await reviewController.updateSpamConfig(req.body as never, req as never);
    if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
    return finalizeResponse(res, out);
  });

  // Admin QnA Routes (mounted on both /api/admin/qna and /api/qna)
  for (const base of ['/api/admin/qna', '/api/qna']) {
    app.get(`${base}/export`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const out = await qnaController.exportQuestions(req.query.format, req as never);
      return finalizeResponse(res, out);
    });
    app.get(`${base}/import/history`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const out = await qnaController.importHistory(req as never);
      return finalizeResponse(res, out);
    });
    app.post(`${base}/import/dry-run`, async (c) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const out = await qnaController.importDryRun(req.body as never, req as never);
      return finalizeResponse(res, out);
    });
    app.post(`${base}/import`, async (c) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const out = await qnaController.importQuestions(req.body as never, req as never);
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    });
    app.post(`${base}/bulk`, async (c) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const out = await qnaController.bulkQuestions(req.body as never, req as never);
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    });
    app.get(base, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const rawLimit = req.query.limit ?? req.query.pageSize ?? req.query.size;
      const rawSort = req.query.sort ?? req.query.sortBy;
      const out = await qnaController.listAllQuestions(
        parseIntOrDefault(req.query.page, 1),
        parseIntOrDefault(rawLimit, 20),
        req.query.status,
        rawSort,
        req.query.productId,
        req.query.search,
        req as never,
      );
      return finalizeResponse(res, out);
    });
    app.get(`${base}/:productId/stats`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId'));
      const out = await qnaController.getStats(productId, req as never);
      return finalizeResponse(res, out);
    });
    app.get(`${base}/:productId`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId'));
      const rawLimit = req.query.limit ?? req.query.pageSize ?? req.query.size;
      const rawSort = req.query.sort ?? req.query.sortBy;
      const out = await qnaController.getQuestions(
        productId,
        parseIntOrDefault(req.query.page, 1),
        parseIntOrDefault(rawLimit, 20),
        req.query.status,
        rawSort,
        req as never,
      );
      return finalizeResponse(res, out);
    });
    app.post(`${base}/:productId`, async (c) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId'));
      const out = await qnaController.createQuestion(productId, req.body as never, req as never);
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out, 201);
    });
    const handleAnswerQuestion = async (c: Context) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId') ?? '');
      const out = await qnaController.answerQuestion(
        productId,
        c.req.param('questionId') ?? '',
        req.body as never,
        req as never,
      );
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    };
    app.patch(`${base}/:productId/:questionId/answer`, handleAnswerQuestion);
    app.put(`${base}/:productId/:questionId/answer`, handleAnswerQuestion);

    const handleStatusQuestion = async (c: Context) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId') ?? '');
      const out = await qnaController.updateStatus(
        productId,
        c.req.param('questionId') ?? '',
        req.body as never,
        req as never,
      );
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    };
    app.patch(`${base}/:productId/:questionId/status`, handleStatusQuestion);
    app.put(`${base}/:productId/:questionId/status`, handleStatusQuestion);

    const handleUpdateQuestion = async (c: Context) => {
      const { req, res } = await buildExpressAdapters(c, { parseBody: true });
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId') ?? '');
      const out = await qnaController.updateQuestion(
        productId,
        c.req.param('questionId') ?? '',
        req.body as never,
        req as never,
      );
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    };
    app.patch(`${base}/:productId/:questionId`, handleUpdateQuestion);
    app.put(`${base}/:productId/:questionId`, handleUpdateQuestion);
    app.delete(`${base}/:productId/:questionId`, async (c) => {
      const { req, res } = await buildExpressAdapters(c);
      await requireShopAuth(req, res);
      const productId = numericIdPipe.transform(c.req.param('productId'));
      const out = await qnaController.deleteQuestion(productId, c.req.param('questionId'), req as never);
      if (req.storeDomain) await bumpStoreEdgeCache(req.storeDomain);
      return finalizeResponse(res, out);
    });
  }

  // Admin Products Routes
  app.get('/api/admin/products', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const out = await productsController.list(req as never, req.query.title, req.query.limit, req.query.page);
    return finalizeResponse(res, out);
  });
  app.get('/api/admin/products/:productId', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const productId = numericIdPipe.transform(c.req.param('productId'));
    const out = await productsController.get(req as never, productId);
    return finalizeResponse(res, out);
  });

  // Admin Dashboard Overview
  app.get('/api/admin/dashboard/overview', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const out = await dashboardController.overview(req as never);
    return finalizeResponse(res, out);
  });

  // Admin Ops Routes
  app.get('/api/admin/ops/health', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const out = await opsController.health(req as never);
    return finalizeResponse(res, out);
  });
  app.post('/api/admin/ops/resync-config', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await opsController.resyncConfig(req as never);
    return finalizeResponse(res, out);
  });
  app.post('/api/admin/ops/resync-webhooks', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await opsController.resyncWebhooks(req as never);
    return finalizeResponse(res, out);
  });
  app.post('/api/admin/ops/backfill-catalog', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await opsController.backfillCatalog(req as never);
    return finalizeResponse(res, out);
  });
  app.post('/api/admin/ops/orders/sync', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await opsController.syncOrders(req.body as never, req as never);
    return finalizeResponse(res, out);
  });
  app.post('/api/admin/ops/metafields/sync-all', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await opsController.syncMetafields(req as never);
    return finalizeResponse(res, out);
  });
  app.get('/api/admin/ops/diagnostics/export', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const out = await opsController.exportDiagnostics(req as never);
    return finalizeResponse(res, out);
  });

  // Admin Media Route
  app.post('/api/admin/media/upload-ticket', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await mediaController.createTicket(req as never, req.body as never);
    return finalizeResponse(res, out, 201);
  });

  // Admin Outbound Webhooks Routes
  app.get('/api/admin/outbound-webhooks/events', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const out = outboundWebhookController.listEvents();
    return finalizeResponse(res, out);
  });
  app.get('/api/admin/outbound-webhooks', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const out = await outboundWebhookController.list(req as never);
    return finalizeResponse(res, out);
  });
  app.post('/api/admin/outbound-webhooks', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await outboundWebhookController.create(req.body as never, req as never);
    return finalizeResponse(res, out, 201);
  });
  app.put('/api/admin/outbound-webhooks/:id', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await outboundWebhookController.update(c.req.param('id'), req.body as never, req as never);
    return finalizeResponse(res, out);
  });
  app.patch('/api/admin/outbound-webhooks/:id', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await outboundWebhookController.update(c.req.param('id'), req.body as never, req as never);
    return finalizeResponse(res, out);
  });
  app.delete('/api/admin/outbound-webhooks/:id', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const out = await outboundWebhookController.remove(c.req.param('id'), req as never);
    return finalizeResponse(res, out);
  });
  app.post('/api/admin/outbound-webhooks/:id/rotate-secret', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await outboundWebhookController.rotate(c.req.param('id'), req as never);
    return finalizeResponse(res, out);
  });
  app.post('/api/admin/outbound-webhooks/:id/test', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await outboundWebhookController.test(c.req.param('id'), req as never);
    return finalizeResponse(res, out);
  });
  app.get('/api/admin/outbound-webhooks/:id/deliveries', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const query = {
      page: parseOptionalInt(req.query.page),
      size: parseOptionalInt(req.query.size ?? req.query.limit),
    };
    const out = await outboundWebhookController.deliveries(c.req.param('id'), query, req as never);
    return finalizeResponse(res, out);
  });

  // Admin AI Routes
  app.get('/api/admin/ai/status', async (c) => {
    const { req, res } = await buildExpressAdapters(c);
    await requireShopAuth(req, res);
    const out = await aiController.status();
    return finalizeResponse(res, out);
  });
  app.post('/api/admin/ai/reply-suggestion', async (c) => {
    const { req, res } = await buildExpressAdapters(c, { parseBody: true });
    await requireShopAuth(req, res);
    const out = await aiController.replySuggestion(req.body as never, req as never);
    return finalizeResponse(res, out);
  });

  return {
    app,
    container: {
      prisma,
      redis,
      env,
      workerEnv,
      sapoService,
      webhookService,
      durabilitySweep,
      mediaService,
    },
  };
};
