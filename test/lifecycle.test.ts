// @ts-nocheck
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';

import { loadEnv, type AppEnv } from '../src/config/env.schema';
import { RedisService } from '../src/redis/redis.service';

import { OAuthStateService, isSafeRedirect } from '../src/sapo/oauth-state.service';
import { SessionService } from '../src/sapo/session.service';
import { HmacVerifierService } from '../src/sapo/hmac-verifier.service';
import { ShopDomainService, normalizeShopDomain } from '../src/sapo/shop-domain.service';
import { SubscriptionService, installStatusFromSnapshot } from '../src/sapo/subscription.service';
import { normalizeWebhookTopic, isKnownWebhookTopic, WEBHOOK_SUBSCRIBE_TOPICS } from '../src/sapo/webhook-topic-normalizer';
import { WebhookService } from '../src/sapo/webhook.service';
import { LifecycleLockService } from '../src/sapo/lifecycle-lock.service';
import { TokenEncryptionService } from '../src/sapo/token-encryption.service';
import { SapoService } from '../src/sapo/sapo.service';

import { IngressRateLimitService } from '../src/common/security/ingress-rate-limit.service';
import { clientFingerprint } from '../src/common/security/client-fingerprint';
import { isTrustedUnsafeOrigin } from '../src/common/security/origin-policy';

import { toPublicReview } from '../src/review/review.service';
import { toPublicQuestion } from '../src/qna/qna.service';

const makeEnv = (overrides: Partial<AppEnv> = {}): AppEnv => ({
  NODE_ENV: 'test',
  PORT: 3333,
  FRONTEND_URL: 'http://localhost:5173',
  API_BASE_URL: 'http://localhost:3333',
  CORS_ALLOWED_ORIGINS: ['http://localhost:5173'],
  TRUST_PROXY: false,
  REQUEST_BODY_LIMIT: '1mb',
  WEBHOOK_BODY_LIMIT: '256kb',
  SAPO_CLIENT_ID: 'sapo-client-id',
  SAPO_CLIENT_SECRET: 'sapo-client-secret-for-tests',
  SAPO_SCOPE: 'read_products write_products read_orders write_orders read_customers write_customers read_script_tags write_script_tags read_themes write_themes',
  SAPO_INSTALL_CALLBACK_URL: 'https://app.test/api/oauth/install/callback',
  SAPO_LOGIN_CALLBACK_URL: 'https://app.test/api/oauth/install/login/callback',
  SAPO_WEBHOOK_SECRET: 'sapo-webhook-secret-for-tests',
  SAPO_API_MAX_CONCURRENT: 4,
  SAPO_API_MIN_INTERVAL_MS: 0,
  R2_WORKER_URL: '',
  R2_UPLOAD_SECRET: '',
  R2_PUBLIC_DOMAIN: '',
  APP_SESSION_SECRET: 'test-session-secret-with-at-least-32-bytes',
  APP_SESSION_TTL_SECONDS: 3600,
  SESSION_HANDOFF_TTL_SECONDS: 60,
  SESSION_COOKIE_NAME: 'sapo_app_session',
  SESSION_COOKIE_DOMAIN: '',
  REDIS_HOST: '',
  REDIS_PORT: 6379,
  REDIS_USERNAME: '',
  REDIS_PASSWORD: '',
  REDIS_TLS: false,
  REDIS_KEY_PREFIX: 'sapo-app-base-test',
  DATABASE_URL: 'postgresql://placeholder',
  DIRECT_URL: 'postgresql://placeholder',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: 60,
  AUTH_RATE_LIMIT_MAX: 100,
  WEBHOOK_RATE_LIMIT_WINDOW_SECONDS: 60,
  WEBHOOK_RATE_LIMIT_MAX: 100,
  SESSION_EXCHANGE_RATE_LIMIT_MAX: 100,
  PUBLIC_WRITE_RATE_LIMIT_WINDOW_SECONDS: 60,
  PUBLIC_WRITE_RATE_LIMIT_MAX: 3,
  READINESS_TOKEN: 'readiness-token',
  BUILD_SHA: 'test',
  ...overrides,
});

const rawFrom = (env: AppEnv): Record<string, string> => {
  const raw: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || value === null) continue;
    raw[key] = Array.isArray(value) ? value.join(',') : String(value);
  }
  return raw;
};

// ---------------------------------------------------------------------------
// Env contract
// ---------------------------------------------------------------------------

test('loadEnv parses the new public-write rate-limit vars', () => {
  const env = loadEnv(rawFrom(makeEnv()));
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.PUBLIC_WRITE_RATE_LIMIT_WINDOW_SECONDS, 60);
  assert.equal(env.PUBLIC_WRITE_RATE_LIMIT_MAX, 3);
});

test('loadEnv rejects identical secrets', () => {
  const raw = rawFrom(makeEnv());
  assert.throws(
    () => loadEnv({ ...raw, SAPO_WEBHOOK_SECRET: raw.SAPO_CLIENT_SECRET }),
    /must be distinct/,
  );
});

// ---------------------------------------------------------------------------
// OAuth state + session handoff
// ---------------------------------------------------------------------------

test('OAuth state and session handoff are atomic one-time credentials', async () => {
  const env = makeEnv();
  const redis = new RedisService({ keyPrefix: 'test-atomic' });
  const oauthState = new OAuthStateService(redis);
  const sessions = new SessionService(env, redis);

  const created = await oauthState.create('login', { storeDomain: 'demo.mysapo.net', redirectTo: '/dashboard?tab=home' });
  const consumed = await oauthState.consume(created.state, 'login');
  assert.equal(consumed.storeDomain, 'demo.mysapo.net');
  assert.equal(consumed.redirectTo, '/dashboard?tab=home');
  await assert.rejects(() => oauthState.consume(created.state, 'login'), /Invalid or expired OAuth state/);

  const installState = await oauthState.create('install', { storeDomain: 'demo.mysapo.net' });
  await assert.rejects(() => oauthState.consume(installState.state, 'login'), /Invalid or expired OAuth state/);

  const raceState = await oauthState.create('login', { storeDomain: 'demo.mysapo.net' });
  const settled = await Promise.allSettled([
    oauthState.consume(raceState.state, 'login'),
    oauthState.consume(raceState.state, 'login'),
  ]);
  assert.equal(settled.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(settled.filter((r) => r.status === 'rejected').length, 1);

  const handoff = await sessions.createHandoff('demo.mysapo.net', '/dashboard');
  const used = await sessions.consumeHandoff(handoff.handoffCode);
  assert.equal(used.storeDomain, 'demo.mysapo.net');
  await assert.rejects(() => sessions.consumeHandoff(handoff.handoffCode), /Invalid or expired session handoff/);
});

test('isSafeRedirect rejects absolute, external, and blocked-prefix paths', () => {
  assert.equal(isSafeRedirect('/dashboard'), true);
  assert.equal(isSafeRedirect('/dashboard?tab=home'), true);
  assert.equal(isSafeRedirect('https://evil.example'), false);
  assert.equal(isSafeRedirect('//evil.example'), false);
  assert.equal(isSafeRedirect('/api/oauth/install/callback'), false);
  assert.equal(isSafeRedirect('/install'), false);
  assert.equal(isSafeRedirect('javascript:alert(1)'), false);
  assert.equal(isSafeRedirect(''), false);
  assert.equal(isSafeRedirect(undefined), false);
});

test('session token signs, verifies, and rejects tampering and expiry', () => {
  const env = makeEnv();
  const sessions = new SessionService(env, new RedisService({ keyPrefix: 'test-session' }));

  const token = sessions.createSessionToken('demo.mysapo.net');
  const payload = sessions.verifySessionToken(token);
  assert.equal(payload.storeDomain, 'demo.mysapo.net');
  assert.equal(payload.type, 'sapo_app_session');

  const [h, b, s] = token.split('.');
  assert.throws(() => sessions.verifySessionToken(`${h}.${b}.${'a'.repeat(s.length)}`), /Invalid auth session/);
  assert.throws(() => sessions.verifySessionToken('not-a-jwt'), /Invalid auth session/);

  const [eh, eb] = token.split('.');
  const decoded = JSON.parse(Buffer.from(eb, 'base64url').toString('utf8'));
  decoded.exp = Math.floor(Date.now() / 1000) - 10;
  const newBody = Buffer.from(JSON.stringify(decoded)).toString('base64url');
  const newSig = sessions['sign'](`${eh}.${newBody}`);
  assert.throws(() => sessions.verifySessionToken(`${eh}.${newBody}.${newSig}`), /Expired auth session/);
});

// ---------------------------------------------------------------------------
// HMAC verification (Sapo: sorted A-Z launch query, raw-body webhook)
// ---------------------------------------------------------------------------

test('launch HMAC verifier accepts sorted A-Z signature and rejects bad/missing/expired', () => {
  const env = makeEnv();
  const verifier = new HmacVerifierService(env);
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `shop=demo.mysapo.net&timestamp=${timestamp}`;
  const hmac = createHmac('sha256', env.SAPO_CLIENT_SECRET).update(message).digest('hex');

  const parsed = verifier.verifyLaunchQuery(`${message}&hmac=${hmac}`);
  assert.equal(parsed.get('shop'), 'demo.mysapo.net');

  assert.throws(() => verifier.verifyLaunchQuery(`${message}&hmac=deadbeef`), /Invalid hmac/);
  assert.throws(() => verifier.verifyLaunchQuery(message), /Missing hmac/);

  const stale = Math.floor(Date.now() / 1000) - 600;
  const staleHmac = createHmac('sha256', env.SAPO_CLIENT_SECRET).update(`shop=demo.mysapo.net&timestamp=${stale}`).digest('hex');
  assert.throws(() => verifier.verifyLaunchQuery(`shop=demo.mysapo.net&timestamp=${stale}&hmac=${staleHmac}`), /HMAC timestamp expired/);
});

test('webhook body HMAC verifies with Sapo signature and rejects tampering', () => {
  const env = makeEnv();
  const verifier = new HmacVerifierService(env);
  const body = Buffer.from(JSON.stringify({ id: 1, title: 'x' }));
  const signature = createHmac('sha256', env.SAPO_WEBHOOK_SECRET).update(body).digest('hex');

  verifier.verifyWebhookBody(body, signature);
  assert.throws(() => verifier.verifyWebhookBody(body, 'deadbeef'), /Invalid webhook HMAC/);
  assert.throws(() => verifier.verifyWebhookBody(Buffer.from(''), signature), /Missing raw webhook body/);
  assert.throws(() => verifier.verifyWebhookBody(body, undefined), /Missing webhook HMAC/);
});

// ---------------------------------------------------------------------------
// Shop domain identity
// ---------------------------------------------------------------------------

test('shop domain normalization and store-domain mapping', async () => {
  const redis = new RedisService({ keyPrefix: 'test-domain' });
  const service = new ShopDomainService(redis);

  assert.equal(normalizeShopDomain('Demo.MySapo.net'), 'demo.mysapo.net');
  assert.equal(normalizeShopDomain('https://demo.mysapo.net/'), 'demo.mysapo.net');
  assert.equal(normalizeShopDomain('www.demo.com'), 'demo.com');

  await service.saveMapping('shop_1', 'demo.mysapo.net');
  assert.equal(await service.resolveStoreDomain('https://demo.mysapo.net/'), 'shop_1');
  await service.removeMapping('demo.mysapo.net');
  assert.equal(await service.resolveStoreDomain('demo.mysapo.net'), null);
});

// ---------------------------------------------------------------------------
// Webhook topics
// ---------------------------------------------------------------------------

test('app/uninstalled re-delivery after domain tombstone resolves via payload storeDomain', async () => {
  const env = makeEnv();
  const redis = new RedisService({ keyPrefix: 'test-ws-uninstall' });
  const prisma = {
    appInstall: { findUnique: async () => null },
    shopDomain: { findFirst: async () => null },
    webhookEvent: {
      create: async () => ({ id: 'evt_1', status: 'received' }),
      findUnique: async () => null,
      update: async () => ({}),
    },
  };
  const shopDomains = new ShopDomainService(redis, prisma);
  const service = new WebhookService(
    prisma,
    new HmacVerifierService(env),
    shopDomains,
    { buildSnapshot: () => ({}), saveSnapshot: async () => {}, applySnapshotToInstall: async () => ({ updated: false }) },
    { uninstall: async (storeDomain) => ({ storeDomain, uninstalled: true, domainsCleared: 0 }) },
  );

  const payload = { store_domain: 'demo.mysapo.net', id: 'shop_1' };
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = createHmac('sha256', env.SAPO_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const result = await service.handle({
    headers: { 'x-sapo-topic': 'app_uninstall_webhook', 'x-sapo-hmacsha256': signature },
    query: {},
    body: payload,
    rawBody,
  });
  assert.equal(result.storeDomain, 'demo.mysapo.net');
  assert.equal(result.uninstalled, true);
});

test('concurrent duplicate webhook with same idempotency key returns inProgress instead of running twice', async () => {
  const env = makeEnv();
  const redis = new RedisService({ keyPrefix: 'test-ws-race' });
  let createCalls = 0;
  const prisma = {
    appInstall: { findUnique: async () => null },
    shopDomain: { findFirst: async () => null },
    webhookEvent: {
      create: async () => { createCalls += 1; if (createCalls > 1) throw new Error('P2002 unique constraint'); return { id: 'evt_1', status: 'received' }; },
      findUnique: async () => ({ id: 'evt_1', status: 'processing' }),
      update: async () => ({}),
    },
  };
  const shopDomains = new ShopDomainService(redis, prisma);
  const service = new WebhookService(
    prisma,
    new HmacVerifierService(env),
    shopDomains,
    { buildSnapshot: () => ({}), saveSnapshot: async () => {}, applySnapshotToInstall: async () => ({ updated: false }) },
    { uninstall: async () => ({ uninstalled: true, domainsCleared: 0 }) },
  );

  const makeInput = () => {
    const payload = { id: 100, title: 'x', store_domain: 'demo.mysapo.net' };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = createHmac('sha256', env.SAPO_WEBHOOK_SECRET).update(rawBody).digest('hex');
    return {
      headers: { 'x-sapo-topic': 'products/create', 'x-sapo-hmacsha256': signature },
      query: {},
      body: payload,
      rawBody,
    };
  };

  const first = await service.handle(makeInput());
  assert.equal(first.ok, true);
  // Second delivery hits the unique violation on insert; existing row is processing -> inProgress, not re-run
  const second = await service.handle(makeInput());
  assert.equal(second.inProgress, true);
  assert.equal(createCalls, 2);
});

test('webhook topic normalization covers charge/uninstall/product/order and unknown', () => {
  assert.equal(normalizeWebhookTopic('app_charge_update'), 'app/charge');
  assert.equal(normalizeWebhookTopic('app_uninstall_webhook'), 'app/uninstalled');
  assert.equal(normalizeWebhookTopic('shop/update'), 'shop/update');
  assert.equal(normalizeWebhookTopic('products/create'), 'products/create');
  assert.equal(normalizeWebhookTopic('orders/updated'), 'orders/updated');
  assert.equal(normalizeWebhookTopic('orders/cancelled'), 'orders/cancelled');
  assert.equal(normalizeWebhookTopic('mystery/topic'), 'unknown');
  assert.equal(isKnownWebhookTopic('app/charge'), true);
  assert.equal(isKnownWebhookTopic('nope/nope'), false);
  assert.ok(WEBHOOK_SUBSCRIBE_TOPICS.length >= 11);
});

// ---------------------------------------------------------------------------
// Security layer
// ---------------------------------------------------------------------------

test('public-write rate limit throttles per store + client fingerprint', async () => {
  const env = makeEnv();
  const rateLimit = new IngressRateLimitService();
  const bucket = 'public-review:submit';
  const fingerprint = 'demo.mysapo.net|1.2.3.4';

  for (let i = 0; i < env.PUBLIC_WRITE_RATE_LIMIT_MAX; i += 1) {
    await rateLimit.assertAllowed(bucket, fingerprint, env.PUBLIC_WRITE_RATE_LIMIT_WINDOW_SECONDS, env.PUBLIC_WRITE_RATE_LIMIT_MAX);
  }
  await assert.rejects(
    () => rateLimit.assertAllowed(bucket, fingerprint, env.PUBLIC_WRITE_RATE_LIMIT_WINDOW_SECONDS, env.PUBLIC_WRITE_RATE_LIMIT_MAX),
    /Rate limit exceeded/,
  );
  await rateLimit.assertAllowed(bucket, 'demo.mysapo.net|9.9.9.9', env.PUBLIC_WRITE_RATE_LIMIT_WINDOW_SECONDS, env.PUBLIC_WRITE_RATE_LIMIT_MAX);
});

test('clientFingerprint extracts the first IP from the request', () => {
  assert.equal(clientFingerprint({ ip: '203.0.113.5, 10.0.0.1', socket: { remoteAddress: '10.0.0.1' } }), '203.0.113.5');
  assert.equal(clientFingerprint({ socket: { remoteAddress: '10.0.0.1' } }), '10.0.0.1');
  assert.equal(clientFingerprint({}), 'unknown');
});

test('origin policy trusts safe methods and allowed origins for unsafe ones', () => {
  const env = makeEnv();
  const options = { frontendUrl: env.FRONTEND_URL, apiBaseUrl: env.API_BASE_URL, allowedOrigins: env.CORS_ALLOWED_ORIGINS };
  assert.equal(isTrustedUnsafeOrigin({ method: 'GET', headers: { origin: 'http://evil.example' } }, options), true);
  assert.equal(isTrustedUnsafeOrigin({ method: 'POST', headers: { origin: 'http://evil.example' } }, options), false);
  assert.equal(isTrustedUnsafeOrigin({ method: 'POST', headers: { origin: 'http://localhost:5173' } }, options), true);
});

// ---------------------------------------------------------------------------
// Subscription persistence (F4 regression: no nonexistent AppInstall columns)
// ---------------------------------------------------------------------------

test('subscription snapshot parses charge payloads and maps install status', () => {
  const service = new SubscriptionService(new RedisService({ keyPrefix: 'test-sub' }));
  const snapshot = service.buildSnapshot(
    { app_subscription: { id: 'sub_1', status: 'active', amount_paid: '150000', plan: 'Pro', billing_on: '2026-12-31T00:00:00.000Z' } },
    { storeDomain: 'demo.mysapo.net' },
  );
  assert.equal(snapshot.isActive, true);
  assert.equal(snapshot.isPaid, true);
  assert.equal(snapshot.plan, 'Pro');
  assert.equal(snapshot.subscriptionId, 'sub_1');
  assert.equal(snapshot.status, 'active');
  assert.equal(installStatusFromSnapshot(snapshot), 'active');

  const free = service.buildSnapshot({ app_subscription: { status: 'free' } }, { storeDomain: 'demo.mysapo.net' });
  assert.equal(free.isActive, false);
  assert.equal(free.plan, 'Free');
});

test('applySnapshotToInstall writes only status + metadata, never nonexistent AppInstall columns', async () => {
  let capturedData;
  const fakePrisma = {
    shopDomain: { findFirst: async () => null },
    appInstall: {
      findFirst: async () => null,
      findUnique: async () => ({ metadata: { reviewWidgetConfig: { accentColor: '#fff' }, reviewSpamConfig: { blockedWords: [] } } }),
      updateMany: async ({ data }) => { capturedData = data; return { count: 1 }; },
    },
  };
  const service = new SubscriptionService(new RedisService({ keyPrefix: 'test-sub2' }), fakePrisma);
  const snapshot = service.buildSnapshot(
    { app_subscription: { id: 'sub_9', status: 'active', plan: 'Pro', billing_on: '2026-12-31T00:00:00.000Z' } },
    { storeDomain: 'demo.mysapo.net' },
  );

  const result = await service.applySnapshotToInstall(snapshot);
  assert.equal(result.updated, true);
  assert.ok(capturedData, 'updateMany must be called');
  assert.equal(capturedData.status, 'active');
  assert.equal(capturedData.plan, undefined);
  assert.equal(capturedData.subscriptionId, undefined);
  assert.equal(capturedData.subscriptionStatus, undefined);
  assert.equal(capturedData.expiresAt, undefined);
  assert.equal(capturedData.metadata.subscription.subscriptionId, 'sub_9');
  // C5: subscription must be merged into existing metadata, not replace it
  assert.equal(capturedData.metadata.reviewWidgetConfig.accentColor, '#fff');
  assert.equal(capturedData.metadata.reviewSpamConfig.blockedWords.length, 0);
  assert.equal(capturedData.metadata.subscription.plan, 'Pro');
  assert.equal(capturedData.metadata.subscription.subscriptionStatus, 'active');
});

// ---------------------------------------------------------------------------
// Sapo OAuth authorize URL (Batch A regression: shop-domain validation)
// ---------------------------------------------------------------------------

test('SapoService startLogin validates mysapo.net shop domain and builds authorize URL', async () => {
  const env = makeEnv();
  const redis = new RedisService({ keyPrefix: 'test-sapo-svc' });
  const service = new SapoService(
    env,
    {},
    new OAuthStateService(redis),
    {},
    new SessionService(env, redis),
    new TokenEncryptionService(env),
    new ShopDomainService(redis),
    new LifecycleLockService(redis),
    {},
    {},
  );

  const result = await service.startLogin({ storeDomain: 'demo.mysapo.net', redirectTo: '/dashboard' });
  assert.match(result.url, /^https:\/\/demo\.mysapo\.net\/admin\/oauth\/authorize\?/);
  assert.match(result.url, /client_id=sapo-client-id/);

  await assert.rejects(() => service.startLogin({ storeDomain: 'evil.example' }), /valid Sapo shop domain/);
  await assert.rejects(() => service.startLogin({}), /storeDomain is required/);
});

// ---------------------------------------------------------------------------
// PII scrub (Batch A regression: public responses must not leak email/phone)
// ---------------------------------------------------------------------------

test('public review mapper strips contact PII (email/phone)', () => {
  const review = toPublicReview({
    reviewId: 'rev_1', rating: 5, content: 'Great', author: 'Nguyen A',
    email: 'a@example.com', phone: '0901234567', title: 'T', media: [],
    status: 'approved', verified: true, pinned: false, reply: null, repliedAt: null,
    sourceRawJson: null, createdAt: 1, updatedAt: 2,
  });
  assert.equal(review.email, undefined);
  assert.equal(review.phone, undefined);
  assert.equal(review.rating, 5);
  assert.equal(review.author, 'Nguyen A');
});

test('public question mapper strips contact PII (email/phone)', () => {
  const question = toPublicQuestion({
    questionId: 'q_1', question: 'Hỏi?', author: 'Nguyen B',
    email: 'b@example.com', phone: '0987654321', answer: null, answeredBy: null,
    status: 'answered', createdAt: new Date(0), updatedAt: new Date(0), answeredAt: new Date(0),
    sourceRawJson: null, productId: 'p_1', productTitle: 'T', productName: 'T',
  });
  assert.equal(question.email, undefined);
  assert.equal(question.phone, undefined);
  assert.equal(question.question, 'Hỏi?');
});
