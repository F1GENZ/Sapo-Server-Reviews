// @ts-nocheck
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, sign } from 'crypto';
import { loadEnv, type AppEnv } from '../src/config/env.schema';
import { IngressRateLimitService } from '../src/common/security/ingress-rate-limit.service';
import { isTrustedUnsafeOrigin } from '../src/common/security/origin-policy';
import { HaravanController } from '../src/haravan/haravan.controller';
import { HaravanService } from '../src/haravan/haravan.service';
import { HmacVerifierService } from '../src/haravan/hmac-verifier.service';
import { LifecycleLockService } from '../src/haravan/lifecycle-lock.service';
import { OAuthStateService, isSafeRedirect } from '../src/haravan/oauth-state.service';
import { OidcVerifierService } from '../src/haravan/oidc-verifier.service';
import { RedisService } from '../src/redis/redis.service';
import { SessionService } from '../src/haravan/session.service';
import { ShopDomainService } from '../src/haravan/shop-domain.service';
import { SubscriptionService } from '../src/haravan/subscription.service';
import { TokenEncryptionService } from '../src/haravan/token-encryption.service';
import { UninstallService } from '../src/haravan/uninstall.service';
import { WebhookService } from '../src/haravan/webhook.service';
import { normalizeWebhookTopic } from '../src/haravan/webhook-topic-normalizer';

const originalFetch = globalThis.fetch;

after(() => {
  globalThis.fetch = originalFetch;
});

const makeEnv = (overrides: Partial<AppEnv> = {}): AppEnv => ({
  NODE_ENV: 'test',
  PORT: 3333,
  FRONTEND_URL: 'http://localhost:5173',
  API_BASE_URL: 'http://localhost:3333',
  CORS_ALLOWED_ORIGINS: ['http://localhost:5173'],
  TRUST_PROXY: false,
  REQUEST_BODY_LIMIT: '1mb',
  WEBHOOK_BODY_LIMIT: '256kb',
  HRV_CLIENT_ID: 'client-id',
  HRV_CLIENT_SECRET: 'client-secret-for-tests',
  HRV_URL_AUTHORIZE: 'https://accounts.haravan.test/connect/authorize',
  HRV_URL_CONNECT_TOKEN: 'https://accounts.haravan.test/connect/token',
  HRV_SCOPE_LOGIN: 'openid profile email org userinfo',
  HRV_SCOPE_INSTALL: 'openid profile email org userinfo grant_service wh_api',
  HRV_LOGIN_CALLBACK_URL: 'https://app.test/api/oauth/install/login/callback',
  HRV_INSTALL_CALLBACK_URL: 'https://app.test/api/oauth/install/grandservice',
  HRV_GRANT_TYPE_INSTALL: 'authorization_code',
  HRV_GRANT_TYPE_REFRESH: 'refresh_token',
  HRV_RESPONSE_TYPE: 'code',
  HRV_RESPONSE_MODE: 'query',
  HRV_ISSUER_URL: 'https://accounts.haravan.test',
  HRV_OIDC_DISCOVERY_URL: '',
  HRV_JWKS_URL: 'https://accounts.haravan.test/.well-known/jwks.json',
  HRV_WEBHOOK_URL: 'https://app.test/api/oauth/install/webhooks',
  HRV_WEBHOOK_SECRET: 'webhook-secret-for-tests',
  HRV_WEBHOOK_VERIFY_TOKEN: 'webhook-verify-token-for-tests',
  HRV_WEBHOOK_AUTO_SUBSCRIBE: true,
  APP_SESSION_SECRET: 'test-session-secret-with-at-least-32-bytes',
  APP_SESSION_TTL_SECONDS: 3600,
  SESSION_HANDOFF_TTL_SECONDS: 60,
  SESSION_COOKIE_NAME: 'haravan_app_session',
  SESSION_COOKIE_DOMAIN: '',
  REDIS_HOST: '',
  REDIS_PORT: 6379,
  REDIS_USERNAME: '',
  REDIS_PASSWORD: '',
  REDIS_TLS: false,
  REDIS_KEY_PREFIX: 'haravan-app-base-test',
  DATABASE_URL: 'postgresql://placeholder',
  DIRECT_URL: 'postgresql://placeholder',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: 60,
  AUTH_RATE_LIMIT_MAX: 100,
  WEBHOOK_RATE_LIMIT_WINDOW_SECONDS: 60,
  WEBHOOK_RATE_LIMIT_MAX: 100,
  SESSION_EXCHANGE_RATE_LIMIT_MAX: 100,
  READINESS_TOKEN: 'readiness-token',
  BUILD_SHA: 'test',
  ...overrides,
});

const jsonBase64Url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

const signJwt = (input: {
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
  kid: string;
  claims: Record<string, unknown>;
}): string => {
  const header = jsonBase64Url({ alg: 'RS256', typ: 'JWT', kid: input.kid });
  const payload = jsonBase64Url(input.claims);
  const data = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(data), input.privateKey).toString('base64url');
  return `${data}.${signature}`;
};

test('OAuth state and session handoff are atomic one-time credentials', async () => {
  const env = makeEnv();
  const redis = new RedisService({ keyPrefix: 'test-atomic' });
  const oauthState = new OAuthStateService(redis);
  const sessions = new SessionService(env, redis);

  const createdState = await oauthState.create('login', { orgid: 'org_1', redirectTo: '/dashboard?tab=home' });
  const consumedState = await oauthState.consume(createdState.state, 'login');
  assert.equal(consumedState.orgid, 'org_1');
  assert.equal(consumedState.redirectTo, '/dashboard?tab=home');
  await assert.rejects(() => oauthState.consume(createdState.state, 'login'), /Invalid or expired OAuth state/);

  const handoff = await sessions.createHandoff('org_1', '/dashboard');
  const consumedHandoff = await sessions.consumeHandoff(handoff.handoffCode);
  assert.equal(consumedHandoff.orgid, 'org_1');
  await assert.rejects(() => sessions.consumeHandoff(handoff.handoffCode), /Invalid or expired session handoff/);

  const raceState = await oauthState.create('login', { orgid: 'org_1' });
  const stateRace = await Promise.allSettled([
    oauthState.consume(raceState.state, 'login'),
    oauthState.consume(raceState.state, 'login'),
  ]);
  assert.equal(stateRace.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(stateRace.filter((result) => result.status === 'rejected').length, 1);

  const raceHandoff = await sessions.createHandoff('org_1', '/dashboard');
  const handoffRace = await Promise.allSettled([
    sessions.consumeHandoff(raceHandoff.handoffCode),
    sessions.consumeHandoff(raceHandoff.handoffCode),
  ]);
  assert.equal(handoffRace.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(handoffRace.filter((result) => result.status === 'rejected').length, 1);

  const headers: Record<string, string> = {};
  sessions.setSessionCookie({ setHeader: (name: string, value: string) => { headers[name.toLowerCase()] = value; } } as never, 'org_1');
  assert.match(headers['set-cookie'], /HttpOnly/i);
  assert.doesNotMatch(headers['set-cookie'], /access_token/i);
});

test('session cookie uses Lax for same-site subdomains and None only for cross-site deployment', () => {
  const sameSiteSessions = new SessionService(makeEnv({
    FRONTEND_URL: 'https://app.example.com',
    API_BASE_URL: 'https://api.example.com',
  }), new RedisService({ keyPrefix: 'test-cookie-samesite' }));
  const sameSiteHeaders: Record<string, string> = {};
  sameSiteSessions.setSessionCookie({ setHeader: (name: string, value: string) => { sameSiteHeaders[name.toLowerCase()] = value; } } as never, 'org_1');
  assert.match(sameSiteHeaders['set-cookie'], /SameSite=Lax/i);

  const crossSiteSessions = new SessionService(makeEnv({
    FRONTEND_URL: 'https://app.example.com',
    API_BASE_URL: 'https://api.other-example.com',
  }), new RedisService({ keyPrefix: 'test-cookie-crosssite' }));
  const crossSiteHeaders: Record<string, string> = {};
  crossSiteSessions.setSessionCookie({ setHeader: (name: string, value: string) => { crossSiteHeaders[name.toLowerCase()] = value; } } as never, 'org_1');
  assert.match(crossSiteHeaders['set-cookie'], /SameSite=None/i);
  assert.match(crossSiteHeaders['set-cookie'], /Secure/i);
});

test('safe redirects reject auth route prefixes after decoding and URL normalization', () => {
  assert.equal(isSafeRedirect('/dashboard'), true);
  assert.equal(isSafeRedirect('/dashboard?tab=home'), true);
  assert.equal(isSafeRedirect('//evil.test/dashboard'), false);
  assert.equal(isSafeRedirect('https://evil.test/dashboard'), false);
  assert.equal(isSafeRedirect('/install/login'), false);
  assert.equal(isSafeRedirect('/installation/start'), false);
  assert.equal(isSafeRedirect('/oauth/start'), false);
  assert.equal(isSafeRedirect('/api/oauth/start'), false);
  assert.equal(isSafeRedirect('/foo/../install/login'), false);
  assert.equal(isSafeRedirect('/foo/../oauth/start'), false);
  assert.equal(isSafeRedirect('/foo/../api/oauth/start'), false);
  assert.equal(isSafeRedirect('/dashboard%5Cinstall'), false);
});

test('missing Haravan launch HMAC starts OAuth SSO instead of direct session', async () => {
  const env = makeEnv();
  const controller = new HaravanController(
    env,
    { startLogin: async (input: unknown) => ({ url: `https://accounts.haravan.test/start?${JSON.stringify(input)}`, reason: 'sso_required' }) } as never,
    new HmacVerifierService(env),
    { createHandoff: async () => { throw new Error('direct session must not be created without HMAC'); } } as never,
    {} as never,
    new IngressRateLimitService(),
  );

  const result = await controller.verifyHmac({
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    originalUrl: '/api/oauth/install/login/verify-hmac?orgid=org_1&shop=demo.myharavan.com',
    query: { orgid: 'org_1' },
  } as never);

  const authStart = result as { reason?: string; url: string };
  assert.equal(authStart.reason, 'sso_required');
  assert.match(authStart.url, /accounts\.haravan\.test/);
});

test('HMAC verifier preserves raw query semantics and rejects tampering', () => {
  const env = makeEnv();
  const verifier = new HmacVerifierService(env);
  const timestamp = Math.floor(Date.now() / 1000);
  const rawWithoutHmac = `orgid=org_1&shop=demo.myharavan.com&timestamp=${timestamp}`;
  const hmac = createHmac('sha256', env.HRV_CLIENT_SECRET).update(rawWithoutHmac).digest('hex');

  const params = verifier.verifyLaunchQuery(`${rawWithoutHmac}&hmac=${hmac}`);
  assert.equal(params.get('orgid'), 'org_1');
  assert.throws(() => verifier.verifyLaunchQuery(`${rawWithoutHmac}&hmac=${'0'.repeat(64)}`), /Invalid hmac/);
  const hmacWithoutTimestamp = createHmac('sha256', env.HRV_CLIENT_SECRET).update('orgid=org_1').digest('hex');
  assert.throws(() => verifier.verifyLaunchQuery(`orgid=org_1&hmac=${hmacWithoutTimestamp}`), /Missing HMAC timestamp/);
});

test('invalid Haravan launch HMAC is rejected instead of downgraded to SSO', async () => {
  const env = makeEnv();
  const controller = new HaravanController(
    env,
    { startLogin: async () => ({ url: 'https://accounts.haravan.test/start', reason: 'sso_required' }) } as never,
    new HmacVerifierService(env),
    { createHandoff: async () => ({ handoffCode: 'handoff', orgid: 'org_1', redirectTo: '/dashboard' }) } as never,
    {} as never,
    new IngressRateLimitService(),
  );

  await assert.rejects(
    () => controller.verifyHmac({
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      originalUrl: `/api/oauth/install/login/verify-hmac?orgid=org_1&timestamp=${Math.floor(Date.now() / 1000)}&hmac=${'0'.repeat(64)}`,
      query: { orgid: 'org_1' },
    } as never),
    /Invalid hmac/,
  );
});

test('OIDC verifier validates JWKS signature, audience, expiry, and nonce', async () => {
  const env = makeEnv();
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  const verifier = new OidcVerifierService(env);
  const now = Math.floor(Date.now() / 1000);
  const baseClaims = {
    iss: env.HRV_ISSUER_URL,
    aud: env.HRV_CLIENT_ID,
    exp: now + 600,
    iat: now,
    nonce: 'expected-nonce',
    orgid: 'org_1',
  };
  const validToken = signJwt({ privateKey, kid: 'test-key', claims: baseClaims });
  const claims = await verifier.verifyIdToken(validToken, 'expected-nonce');
  assert.equal(claims.orgid, 'org_1');

  await assert.rejects(() => verifier.verifyIdToken(validToken, 'wrong-nonce'), /Invalid id_token nonce/);
  await assert.rejects(
    () => verifier.verifyIdToken(signJwt({ privateKey, kid: 'test-key', claims: { ...baseClaims, aud: 'other-client' } }), 'expected-nonce'),
    /Invalid id_token audience/,
  );
  await assert.rejects(
    () => verifier.verifyIdToken(signJwt({ privateKey, kid: 'test-key', claims: { ...baseClaims, exp: now - 120 } }), 'expected-nonce'),
    /Expired id_token/,
  );
  const tokenParts = validToken.split('.');
  const corruptedSignature = `${tokenParts[2][0] === 'A' ? 'B' : 'A'}${tokenParts[2].slice(1)}`;
  await assert.rejects(
    () => verifier.verifyIdToken(`${tokenParts[0]}.${tokenParts[1]}.${corruptedSignature}`, 'expected-nonce'),
    /Invalid id_token signature/,
  );
});

test('install callback rejects consumed state orgid mismatch', async () => {
  const env = makeEnv();
  const service = new HaravanService(
    env,
    {
      shop: { upsert: async () => ({ id: 'shop_1' }) },
      appInstall: { upsert: async () => undefined },
      shopDomain: { upsert: async () => undefined },
    } as never,
    { consume: async () => ({ flow: 'install', nonce: 'expected-nonce', createdAt: Date.now(), orgid: 'org_expected' }) } as never,
    { verifyIdToken: async () => ({ orgid: 'org_other' }) } as never,
    {
      exchangeCode: async () => ({ id_token: 'id-token', access_token: 'access-token', expires_in: 3600 }),
      getShop: async () => ({}),
    } as never,
    { createHandoff: async () => ({ handoffCode: 'handoff', orgid: 'org_other', redirectTo: '/dashboard' }) } as never,
    { encrypt: () => ({ ciphertext: 'ciphertext', iv: 'iv', tag: 'tag' }) } as never,
    { collectDomains: () => [], saveMapping: async () => undefined } as never,
    {} as never,
    { registerForInstall: async () => ({ status: 'registered' }) } as never,
    { findBestSnapshot: async () => null } as never,
  );

  await assert.rejects(
    () => service.processInstallCallback('code', 'state'),
    /OAuth orgid mismatch/,
  );
});

test('subscription snapshots can be stored before install and found by domain', async () => {
  const redis = new RedisService({ keyPrefix: 'test-subscription' });
  const subscriptions = new SubscriptionService(redis);
  const snapshot = subscriptions.buildSnapshot(
    { app_subscription: { status: 'active', id: 'sub_1', plan_name: 'Pro monthly', amount_paid: 99000 } },
    { domain: 'Demo.MyHaravan.com' },
  );

  await subscriptions.saveSnapshot(snapshot);
  const found = await subscriptions.findBestSnapshot({ domain: 'demo.myharavan.com' });
  const byHash = await subscriptions.findBestSnapshot({ payloadHash: snapshot.payloadHash });
  assert.equal(found?.domain, 'demo.myharavan.com');
  assert.equal(byHash?.payloadHash, snapshot.payloadHash);
  assert.equal(found?.status, 'active');
  assert.equal(found?.plan, 'Pro');
  assert.equal(found?.isActive, true);
});

test('subscription snapshots update existing installs but preserve uninstalled state', async () => {
  const redis = new RedisService({ keyPrefix: 'test-subscription-apply' });
  const updates: Record<string, unknown>[] = [];
  const fakePrisma = {
    appInstall: {
      updateMany: async (args: Record<string, unknown>) => { updates.push(args); return { count: 1 }; },
      findFirst: async () => null,
    },
    shopDomain: { findFirst: async () => null },
  };
  const subscriptions = new SubscriptionService(redis, fakePrisma as never);
  const snapshot = subscriptions.buildSnapshot(
    { app_subscription: { status: 'cancelled', id: 'sub_1' } },
    { orgid: 'org_1' },
  );

  const result = await subscriptions.applySnapshotToInstall(snapshot);
  assert.equal(result.updated, true);
  assert.deepEqual(updates[0].where, { orgid: 'org_1', status: { not: 'uninstalled' } });
  assert.deepEqual(updates[0].data, {
    status: 'canceled',
    plan: 'Free',
    subscriptionId: 'sub_1',
    subscriptionStatus: 'canceled',
    expiresAt: undefined,
  });
});

test('webhook delivery verifies raw HMAC, records idempotently, and normalizes topics', async () => {
  const env = makeEnv();
  const redis = new RedisService({ keyPrefix: 'test-webhook' });
  const events = new Map<string, Record<string, unknown>>();
  const fakePrisma = {
    appInstall: { updateMany: async () => ({ count: 1 }) },
    subscriptionSnapshot: { upsert: async () => undefined },
    shopDomain: { findFirst: async () => ({ orgid: 'org_1' }) },
    webhookEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (events.has(String(data.idempotencyKey))) throw new Error('Unique constraint failed');
        const event: Record<string, unknown> = { ...data, id: `evt_${events.size + 1}` };
        events.set(String(data.idempotencyKey), event);
        return { id: String(event.id), status: String(event.status || 'received') };
      },
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) => {
        const event = events.get(where.idempotencyKey);
        return event ? { id: event.id, status: event.status } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const event = Array.from(events.values()).find((item) => item.id === where.id);
        if (event) Object.assign(event, data);
        return event;
      },
    },
  };
  const shopDomains = new ShopDomainService(redis, fakePrisma as never);
  await shopDomains.saveMapping('org_1', 'demo.myharavan.com');
  const service = new WebhookService(
    fakePrisma as never,
    new HmacVerifierService(env),
    shopDomains,
    new SubscriptionService(redis, fakePrisma as never),
    {} as never,
  );

  const body = { org_id: 'org_1', shop_domain: 'demo.myharavan.com', app_subscription: { status: 'active', id: 'sub_1' } };
  const rawBody = Buffer.from(JSON.stringify(body));
  const hmac = createHmac('sha256', env.HRV_WEBHOOK_SECRET).update(rawBody).digest('base64');
  const input = {
    headers: { 'x-haravan-topic': 'app_subscriptions/update', 'x-haravan-hmacsha256': hmac },
    query: {},
    body,
    rawBody,
  };

  const first = await service.handle(input);
  const second = await service.handle(input);
  assert.equal(first.ok, true);
  assert.equal(first.topic, 'app_subscriptions/update');
  assert.equal(second.duplicate, true);
  assert.equal(events.size, 1);
  assert.equal(normalizeWebhookTopic('app_uninstall_webhook'), 'app/uninstalled');
  await assert.rejects(() => service.handle({ ...input, headers: { ...input.headers, 'x-haravan-hmacsha256': 'bad' } }), /Invalid webhook HMAC/);
  const clientSecretHmac = createHmac('sha256', env.HRV_CLIENT_SECRET).update(rawBody).digest('base64');
  await assert.rejects(
    () => service.handle({ ...input, headers: { ...input.headers, 'x-haravan-hmacsha256': clientSecretHmac } }),
    /Invalid webhook HMAC/,
  );
  await assert.rejects(
    () => service.handle({ ...input, headers: { ...input.headers, 'x-haravan-orgid': 'org_2' } }),
    /Webhook compatibility orgid mismatch/,
  );
});

test('webhook query or header orgid alone is not authoritative identity', async () => {
  const env = makeEnv();
  const body = { note: 'no signed org or domain identity' };
  const rawBody = Buffer.from(JSON.stringify(body));
  const hmac = createHmac('sha256', env.HRV_WEBHOOK_SECRET).update(rawBody).digest('base64');
  const service = new WebhookService(
    {} as never,
    new HmacVerifierService(env),
    new ShopDomainService(new RedisService({ keyPrefix: 'test-query-orgid' })),
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => service.handle({
      headers: { 'x-haravan-topic': 'app_uninstall_webhook', 'x-haravan-hmacsha256': hmac, 'x-haravan-orgid': 'org_1' },
      query: { orgid: 'org_1' },
      body,
      rawBody,
    }),
    /Missing webhook orgid/,
  );
});

test('unsafe origin policy ignores forged forwarded host', () => {
  const trustedRequest = {
    method: 'POST',
    headers: { origin: 'http://localhost:5173', 'x-forwarded-host': 'evil.test' },
  };
  assert.equal(isTrustedUnsafeOrigin(trustedRequest as never, { frontendUrl: 'http://localhost:5173' }), true);

  const forgedRequest = {
    method: 'POST',
    headers: { origin: 'https://evil.test', 'x-forwarded-host': 'evil.test', host: 'localhost:3333' },
  };
  assert.equal(isTrustedUnsafeOrigin(forgedRequest as never, { frontendUrl: 'http://localhost:5173' }), false);
});

test('uninstall clears token material, Redis mappings, and tombstones domains', async () => {
  const redis = new RedisService({ keyPrefix: 'test-uninstall' });
  const writes: Record<string, unknown>[] = [];
  const fakePrisma = {
    appInstall: {
      findUnique: async () => ({ orgid: 'org_1', subscriptionId: 'sub_1' }),
      updateMany: async (args: Record<string, unknown>) => { writes.push(args); return { count: 1 }; },
    },
    shopDomain: {
      findMany: async () => [{ domain: 'demo.myharavan.com' }],
      updateMany: async (args: Record<string, unknown>) => { writes.push(args); return { count: 1 }; },
      findFirst: async () => null,
    },
    subscriptionSnapshot: {
      updateMany: async () => ({ count: 1 }),
    },
  };
  const shopDomains = new ShopDomainService(redis, fakePrisma as never);
  const sessions = new SessionService(makeEnv(), redis);
  const staleHandoff = await sessions.createHandoff('org_1', '/dashboard');
  const subscriptions = new SubscriptionService(redis, fakePrisma as never);
  await redis.set('install:org_1', { status: 'active' });
  await redis.set('subscription:domain:demo.myharavan.com', { status: 'active' });
  await redis.set('subscription:subscription:sub_1', { status: 'active' });
  await shopDomains.saveMapping('org_1', 'demo.myharavan.com');

  const service = new UninstallService(
    fakePrisma as never,
    redis,
    shopDomains,
    new LifecycleLockService(redis),
    sessions,
    subscriptions,
  );
  const result = await service.uninstall('org_1', { shop_domain: 'demo.myharavan.com' });

  assert.equal(result.uninstalled, true);
  assert.equal(await redis.get('install:org_1'), null);
  assert.equal(await redis.get(shopDomains.domainKey('demo.myharavan.com')), null);
  assert.equal(await redis.get('subscription:domain:demo.myharavan.com'), null);
  assert.equal(await redis.get('subscription:subscription:sub_1'), null);
  await assert.rejects(() => sessions.consumeHandoff(staleHandoff.handoffCode), /Invalid or expired session handoff/);
  assert.deepEqual(writes[0], {
    where: { orgid: 'org_1' },
    data: {
      status: 'uninstalled',
      plan: 'Free',
      accessTokenCiphertext: null,
      accessTokenIv: null,
      accessTokenTag: null,
      refreshTokenCiphertext: null,
      refreshTokenIv: null,
      refreshTokenTag: null,
      tokenExpiresAt: null,
      uninstalledAt: (writes[0].data as Record<string, unknown>).uninstalledAt,
      dataPreserved: true,
      lifecycleGeneration: { increment: 1 },
      tokenVersion: { increment: 1 },
    },
  });
  assert.deepEqual(writes[1], {
    where: { orgid: 'org_1', active: true },
    data: { active: false, tombstonedAt: (writes[1].data as Record<string, unknown>).tombstonedAt },
  });
});

test('token refresh uses lifecycle generation guard so uninstall cannot be revived', async () => {
  const env = makeEnv();
  const encryption = new TokenEncryptionService(env);
  const install = {
    orgid: 'org_1',
    status: 'active',
    lifecycleGeneration: 7,
    tokenExpiresAt: new Date(Date.now() - 60_000),
    ...Object.fromEntries(Object.entries(encryption.encrypt('old-access-token')).map(([key, value]) => [`accessToken${key[0].toUpperCase()}${key.slice(1)}`, value])),
    ...Object.fromEntries(Object.entries(encryption.encrypt('refresh-token')).map(([key, value]) => [`refreshToken${key[0].toUpperCase()}${key.slice(1)}`, value])),
  };
  const updateCalls: Record<string, unknown>[] = [];
  const fakePrisma = {
    appInstall: {
      findUnique: async () => install,
      updateMany: async (args: Record<string, unknown>) => { updateCalls.push(args); return { count: 0 }; },
    },
  };
  const service = new HaravanService(
    env,
    fakePrisma as never,
    {} as never,
    {} as never,
    { refreshToken: async () => ({ access_token: 'new-access-token', expires_in: 3600 }) } as never,
    {} as never,
    encryption,
    {} as never,
    { acquireRefreshLock: async () => ({ key: 'lock:refresh:org_1', owner: 'owner' }), release: async () => undefined, waitFor: async () => null } as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(() => service.resolveAccessToken('org_1'), /Install changed during token refresh/);
  assert.deepEqual(updateCalls[0].where, { orgid: 'org_1', lifecycleGeneration: 7, status: 'active' });
});

test('webhook challenge accepts valid token and rejects invalid or empty challenge', () => {
  const service = new WebhookService(
    {} as never,
    new HmacVerifierService(makeEnv()),
    new ShopDomainService(new RedisService({ keyPrefix: 'test-challenge' })),
    {} as never,
    {} as never,
  );

  assert.equal(
    service.verifyChallenge({ 'hub.verify_token': 'secret', 'hub.challenge': 'challenge-text' }, 'secret'),
    'challenge-text',
  );
  assert.throws(
    () => service.verifyChallenge({ 'hub.verify_token': 'wrong', 'hub.challenge': 'challenge-text' }, 'secret'),
    /Invalid webhook challenge/,
  );
  assert.throws(
    () => service.verifyChallenge({ 'hub.verify_token': 'secret' }, 'secret'),
    /Invalid webhook challenge/,
  );
});

test('public ingress rate limit rejects floods before expensive work', async () => {
  const limiter = new IngressRateLimitService();
  await limiter.assertAllowed('oauth', '127.0.0.1', 60, 2);
  await limiter.assertAllowed('oauth', '127.0.0.1', 60, 2);
  await assert.rejects(
    () => limiter.assertAllowed('oauth', '127.0.0.1', 60, 2),
    /Rate limit exceeded/,
  );
});

test('public route rate limit cannot be bypassed by spoofing x-forwarded-for', async () => {
  const env = makeEnv({ AUTH_RATE_LIMIT_MAX: 2 });
  const controller = new HaravanController(
    env,
    { startLogin: async () => ({ url: 'https://accounts.haravan.test/start', reason: 'sso_required' }) } as never,
    new HmacVerifierService(env),
    { createHandoff: async () => { throw new Error('not expected'); } } as never,
    {} as never,
    new IngressRateLimitService(),
  );
  const makeRequest = (spoofedIp: string) => ({
    headers: { 'x-forwarded-for': spoofedIp },
    ip: '10.0.0.10',
    socket: { remoteAddress: '10.0.0.10' },
    originalUrl: '/api/oauth/install/login/verify-hmac?orgid=org_1&shop=demo.myharavan.com',
    query: { orgid: 'org_1' },
  }) as never;

  await controller.verifyHmac(makeRequest('198.51.100.1'));
  await controller.verifyHmac(makeRequest('198.51.100.2'));
  await assert.rejects(
    () => controller.verifyHmac(makeRequest('198.51.100.3')),
    /Rate limit exceeded/,
  );
});

test('production env validation fails closed for placeholders and missing OIDC config', () => {
  const productionEnv = {
    NODE_ENV: 'production',
    PORT: '3333',
    FRONTEND_URL: 'https://app.example.com',
    API_BASE_URL: 'https://api.example.com',
    CORS_ALLOWED_ORIGINS: 'https://app.example.com',
    TRUST_PROXY: '1',
    REQUEST_BODY_LIMIT: '1mb',
    WEBHOOK_BODY_LIMIT: '256kb',
    HRV_CLIENT_ID: 'replace-with-client-id',
    HRV_CLIENT_SECRET: 'replace-with-client-secret',
    HRV_URL_AUTHORIZE: 'https://accounts.haravan.com/connect/authorize',
    HRV_URL_CONNECT_TOKEN: 'https://accounts.haravan.com/connect/token',
    HRV_SCOPE_LOGIN: 'openid profile email org userinfo',
    HRV_SCOPE_INSTALL: 'openid profile email org userinfo grant_service wh_api',
    HRV_LOGIN_CALLBACK_URL: 'https://api.example.com/api/oauth/install/login/callback',
    HRV_INSTALL_CALLBACK_URL: 'https://api.example.com/api/oauth/install/grandservice',
    HRV_GRANT_TYPE_INSTALL: 'authorization_code',
    HRV_GRANT_TYPE_REFRESH: 'refresh_token',
    HRV_RESPONSE_TYPE: 'code',
    HRV_RESPONSE_MODE: 'query',
    HRV_ISSUER_URL: 'https://accounts.haravan.com',
    HRV_WEBHOOK_URL: 'https://api.example.com/api/oauth/install/webhooks',
    HRV_WEBHOOK_SECRET: 'replace-with-webhook-secret',
    HRV_WEBHOOK_VERIFY_TOKEN: 'replace-with-webhook-verify-token',
    HRV_WEBHOOK_AUTO_SUBSCRIBE: 'true',
    APP_SESSION_SECRET: 'replace-with-32-byte-random-secret-value',
    APP_SESSION_TTL_SECONDS: '43200',
    SESSION_HANDOFF_TTL_SECONDS: '120',
    REDIS_HOST: 'redis.example.internal',
    REDIS_PORT: '6379',
    REDIS_KEY_PREFIX: 'haravan-app-base',
    DATABASE_URL: 'postgresql://user:password@db.example.internal:5432/app?schema=public',
    DIRECT_URL: 'postgresql://user:password@db.example.internal:5432/app?schema=public',
    DATA_ENCRYPTION_KEY: 'replace-with-base64-32-byte-key',
    AUTH_RATE_LIMIT_WINDOW_SECONDS: '60',
    AUTH_RATE_LIMIT_MAX: '60',
    WEBHOOK_RATE_LIMIT_WINDOW_SECONDS: '60',
    WEBHOOK_RATE_LIMIT_MAX: '300',
    SESSION_EXCHANGE_RATE_LIMIT_MAX: '60',
    READINESS_TOKEN: 'replace-with-monitoring-token',
  };

  assert.throws(
    () => loadEnv(productionEnv),
    /HRV_OIDC_DISCOVERY_URL or HRV_JWKS_URL is required in production/,
  );
  assert.throws(
    () => loadEnv({
      ...productionEnv,
      HRV_JWKS_URL: 'https://accounts.haravan.com/.well-known/openid-configuration/jwks',
      HRV_CLIENT_ID: 'real-client-id',
      HRV_CLIENT_SECRET: 'real-client-secret',
      HRV_WEBHOOK_SECRET: 'real-webhook-secret',
      HRV_WEBHOOK_VERIFY_TOKEN: 'real-webhook-verify-token',
      APP_SESSION_SECRET: 'a-real-session-secret-with-more-than-32-bytes',
      DATABASE_URL: 'postgresql://user:password@db.example.internal:5432/app?schema=public',
      DIRECT_URL: 'postgresql://user:password@db.example.internal:5432/app?schema=public',
      DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    }),
    /READINESS_TOKEN must not be a placeholder in production/,
  );

  const validProductionEnv = {
    ...productionEnv,
    HRV_JWKS_URL: 'https://accounts.haravan.com/.well-known/openid-configuration/jwks',
    HRV_CLIENT_ID: 'real-client-id',
    HRV_CLIENT_SECRET: 'real-client-secret',
    HRV_WEBHOOK_SECRET: 'real-webhook-secret',
    HRV_WEBHOOK_VERIFY_TOKEN: 'real-webhook-verify-token',
    APP_SESSION_SECRET: 'a-real-session-secret-with-more-than-32-bytes',
    DATABASE_URL: 'postgresql://user:password@db.example.internal:5432/app?schema=public',
    DIRECT_URL: 'postgresql://user:password@db.example.internal:5432/app?schema=public',
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    READINESS_TOKEN: 'real-readiness-token',
  };
  assert.doesNotThrow(() => loadEnv(validProductionEnv));
  assert.throws(
    () => loadEnv({ ...validProductionEnv, HRV_SCOPE_INSTALL: 'openid profile email org userinfo wh_api' }),
    /HRV_SCOPE_INSTALL must include grant_service/,
  );
  assert.throws(
    () => loadEnv({ ...validProductionEnv, REDIS_KEY_PREFIX: 'Bad Prefix' }),
    /REDIS_KEY_PREFIX must be lowercase kebab-case without spaces/,
  );
  assert.throws(
    () => loadEnv({ ...validProductionEnv, REQUEST_BODY_LIMIT: 'not-a-limit' }),
    /REQUEST_BODY_LIMIT must be a finite byte\/kb\/mb value/,
  );
});
