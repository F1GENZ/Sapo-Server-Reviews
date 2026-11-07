import { createHmac } from 'node:crypto';
import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { SessionService } from '../src/core/sapo/session.service';
import { TokenEncryptionService } from '../src/core/sapo/token-encryption.service';
import { SqliteRedisService } from '../src/db/sqlite-redis';
import type { WorkerEnv } from '../src/env';
import { buildAppEnv } from '../src/env';

const testEnv = env as unknown as WorkerEnv & { SAPO_DB_SNAPSHOT_JSON?: string };

describe('f1genz-sapo-reviews-api Cloudflare Worker (StoreDO SQLite + Edge Cache + RateLimit)', () => {
  it('serves /livez, /healthz, /api/healthz at edge and /readyz via StoreDO', async () => {
    const liveRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/livez');
    expect(liveRes.status).toBe(200);
    expect(await liveRes.json()).toEqual({ ok: true });

    const healthRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/healthz');
    expect(healthRes.status).toBe(200);
    expect(await healthRes.json()).toEqual({ ok: true });

    const apiHealthRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/healthz');
    expect(apiHealthRes.status).toBe(200);
    expect(await apiHealthRes.json()).toEqual({ ok: true });

    const unauthReady = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/readyz');
    expect(unauthReady.status).toBe(401);

    const readyRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/readyz', {
      headers: { Authorization: `Bearer ${testEnv.READINESS_TOKEN}` },
    });
    expect(readyRes.status).toBe(200);
    const readyBody = (await readyRes.json()) as { ok: boolean; db: string; redis: string };
    expect(readyBody.ok).toBe(true);
    expect(readyBody.db).toBe('ok');
    expect(readyBody.redis).toBe('ok');
  });

  it('encrypts and decrypts Sapo tokens with AES-256-GCM and decrypts real sapo_reviews_db AppInstall token', async () => {
    const appEnv = buildAppEnv(testEnv);
    const tokenCrypto = new TokenEncryptionService(appEnv);

    // 1. Round-trip encryption/decryption test for f1genz-babymart.mysapo.net
    const babymartPlain = 'sapo_live_token_f1genz_babymart_99887766554433221100';
    const encrypted = tokenCrypto.encrypt(babymartPlain);
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.tag).toBeTruthy();
    expect(tokenCrypto.decrypt(encrypted)).toBe(babymartPlain);

    // 2. If real sapo_reviews_db snapshot is loaded, verify decrypting real AppInstall token
    if (testEnv.SAPO_DB_SNAPSHOT_JSON) {
      const snapshot = JSON.parse(testEnv.SAPO_DB_SNAPSHOT_JSON) as {
        AppInstall: Array<{
          storeDomain: string;
          accessTokenCiphertext: string;
          accessTokenIv: string;
          accessTokenTag: string;
        }>;
      };
      expect(snapshot.AppInstall.length).toBeGreaterThan(0);
      for (const install of snapshot.AppInstall) {
        const decrypted = tokenCrypto.decrypt({
          ciphertext: install.accessTokenCiphertext,
          iv: install.accessTokenIv,
          tag: install.accessTokenTag,
        });
        expect(typeof decrypted).toBe('string');
        expect(decrypted.length).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it('imports sapo_reviews_db into StoreDO, serves Storefront Widget API with Edge Cache (MISS -> HIT -> invalidation), and serves Admin API', async () => {
    const importToken = testEnv.MIGRATION_IMPORT_TOKEN || '';
    expect(importToken.length).toBeGreaterThanOrEqual(24);

    // Reset StoreDO
    const resetRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/internal/import/reset', {
      method: 'POST',
      headers: { Authorization: `Bearer ${importToken}` },
    });
    expect(resetRes.status).toBe(200);

    const appEnv = buildAppEnv(testEnv);
    const tokenCrypto = new TokenEncryptionService(appEnv);
    const encToken = tokenCrypto.encrypt('sapo_access_token_babymart_verified_123456');

    // Load real snapshot if available, plus ensure f1genz-babymart.mysapo.net is also tested
    if (testEnv.SAPO_DB_SNAPSHOT_JSON) {
      const snapshot = JSON.parse(testEnv.SAPO_DB_SNAPSHOT_JSON) as Record<string, unknown[]>;
      for (const [table, rows] of Object.entries(snapshot)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const batchRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/internal/import/batch', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${importToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ table, rows }),
        });
        expect(batchRes.status).toBe(200);
      }
    }

    // Also seed f1genz-babymart.mysapo.net so both f1genz-purity.mysapo.net and f1genz-babymart.mysapo.net have full data in test
    const nowIso = new Date().toISOString();
    const babymartShopId = 'shop_babymart_test_01';
    await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/internal/import/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${importToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        table: 'Shop',
        rows: [{ id: babymartShopId, storeDomain: 'f1genz-babymart.mysapo.net', createdAt: nowIso, updatedAt: nowIso }],
      }),
    });
    await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/internal/import/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${importToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        table: 'ShopDomain',
        rows: [
          {
            id: 'f1genz-babymart.mysapo.net:f1genz-babymart.mysapo.net',
            shopId: babymartShopId,
            storeDomain: 'f1genz-babymart.mysapo.net',
            domain: 'f1genz-babymart.mysapo.net',
            kind: 'primary',
            active: true,
            tombstonedAt: null,
            source: 'install',
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        ],
      }),
    });
    await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/internal/import/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${importToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        table: 'AppInstall',
        rows: [
          {
            id: 'install_babymart_test_01',
            shopId: babymartShopId,
            storeDomain: 'f1genz-babymart.mysapo.net',
            status: 'active',
            accessTokenCiphertext: encToken.ciphertext,
            accessTokenIv: encToken.iv,
            accessTokenTag: encToken.tag,
            featuresUnlocked: true,
            tokenVersion: 1,
            lifecycleGeneration: 1,
            installedAt: nowIso,
            uninstalledAt: null,
            dataPreserved: true,
            webhookRegistrationStatus: 'registered',
            webhookRegisteredAt: nowIso,
            webhookRegistrationError: null,
            metadata: {},
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        ],
      }),
    });
    await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/internal/import/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${importToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        table: 'review_products',
        rows: [
          {
            id: 'rev_babymart_1',
            shopId: babymartShopId,
            productId: '95252031',
            reviewId: 'imp-babymart-1',
            star: 5,
            rating: 5,
            reviewTitle: 'San pham tot',
            reviewContent: 'Chat luong tuyet voi, giao hang nhanh',
            content: 'Chat luong tuyet voi, giao hang nhanh',
            reviewDate: nowIso,
            reviewerName: 'Nguyen Van A',
            author: 'Nguyen Van A',
            reviewerEmail: 'a@example.com',
            email: 'a@example.com',
            reviewerPhone: null,
            phone: null,
            reply: null,
            repliedAt: null,
            status: 'approved',
            verified: true,
            pinned: false,
            pinnedAt: null,
            media: [],
            source: 'storefront',
            sourceUpdatedAt: Date.now(),
            rawPayload: null,
            productTitle: 'Sua bot cho be',
            productHandle: 'sua-bot-cho-be',
            productImage: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      }),
    });
    await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/internal/import/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${importToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        table: 'qna_questions',
        rows: [
          {
            id: 'qna_babymart_1',
            shopId: babymartShopId,
            productId: '95252031',
            questionId: 'q-babymart-1',
            productTitle: 'Sua bot cho be',
            productHandle: 'sua-bot-cho-be',
            productImage: null,
            question: 'San pham nay danh cho be may thang?',
            author: 'Tran Thi B',
            email: 'b@example.com',
            phone: null,
            answer: 'Danh cho be tu 6 thang tuoi tro len a.',
            answeredBy: 'Shop',
            status: 'approved',
            answeredAt: Date.now(),
            sourceRaw: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      }),
    });

    // Test Storefront GET + Edge Cache (MISS -> HIT)
    const sfUrl = 'https://api-sapo-reviews.f1genz.dev/api/public/reviews/95252031/summary?storeDomain=f1genz-babymart.mysapo.net';
    const sfRes1 = await SELF.fetch(sfUrl);
    expect(sfRes1.status).toBe(200);
    expect(sfRes1.headers.get('X-Edge-Cache')).toBe('MISS');
    const summary1 = (await sfRes1.json()) as { data: { avg: number; count: number } };
    expect(summary1.data.count).toBe(1);
    expect(summary1.data.avg).toBe(5);

    const sfRes2 = await SELF.fetch(sfUrl);
    expect(sfRes2.status).toBe(200);
    expect(sfRes2.headers.get('X-Edge-Cache')).toBe('HIT');

    // Test Storefront QnA GET
    const qnaRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/public/qna/95252031?storeDomain=f1genz-babymart.mysapo.net');
    expect(qnaRes.status).toBe(200);
    const qnaBody = (await qnaRes.json()) as { data: { total: number; items: Array<{ question: string }> } };
    expect(qnaBody.data.total).toBe(1);

    // Test Admin API with signed Session cookie & verify Edge Cache invalidation on mutation
    const dummyRedis = {
      get: async () => null,
      set: async () => 'OK',
      del: async () => 0,
      getdel: async () => null,
      incrWithTtl: async () => 1,
    } as unknown as SqliteRedisService;
    const sessionService = new SessionService(appEnv, dummyRedis as never);
    const sessionToken = sessionService.createSessionToken('f1genz-babymart.mysapo.net', 1);
    const cookieHeader = `${appEnv.SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;

    const adminListRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/reviews?page=1&limit=10', {
      headers: {
        Cookie: cookieHeader,
        Origin: appEnv.FRONTEND_URL,
      },
    });
    expect(adminListRes.status).toBe(200);
    const adminListBody = (await adminListRes.json()) as { data: { total: number } };
    expect(adminListBody.data.total).toBe(1);

    // Admin updates widget config -> bumps Edge Cache epoch -> next storefront GET is MISS
    const updateCfgRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/settings/widget-config', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        Cookie: cookieHeader,
        Origin: appEnv.FRONTEND_URL,
        Referer: `${appEnv.FRONTEND_URL}/`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ primaryColor: '#ff5500' }),
    });
    expect(updateCfgRes.status).toBe(200);

    const sfResAfterBump = await SELF.fetch(sfUrl);
    expect(sfResAfterBump.status).toBe(200);
    expect(sfResAfterBump.headers.get('X-Edge-Cache')).toBe('MISS');
  });

  it('verifies Sapo Webhook HMAC (X-Sapo-Hmac-Sha256 base64) and OAuth login start', async () => {
    const appEnv = buildAppEnv(testEnv);

    // 1. OAuth login start
    const oauthRes = await SELF.fetch(
      'https://api-sapo-reviews.f1genz.dev/api/oauth/install/login/entry?storeDomain=f1genz-babymart.mysapo.net',
    );
    expect(oauthRes.status).toBe(200);
    const oauthBody = (await oauthRes.json()) as { url: string };
    expect(oauthBody.url).toContain('f1genz-babymart.mysapo.net/admin/oauth/authorize');

    const oauthRawRes = await SELF.fetch(
      'https://api-sapo-reviews.f1genz.dev/api/oauth/install/login?storeDomain=f1genz-babymart.mysapo.net',
    );
    expect(oauthRawRes.status).toBe(200);
    expect(await oauthRawRes.text()).toContain('f1genz-babymart.mysapo.net/admin/oauth/authorize');

    // 2. Webhook with invalid HMAC -> 401
    const payload = JSON.stringify({ id: 95252031, name: 'Sua bot cho be cap nhat' });
    const badWebhookRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/webhooks/sapo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sapo-Topic': 'products/update',
        'X-Sapo-Shop-Domain': 'f1genz-babymart.mysapo.net',
        'X-Sapo-Hmac-Sha256': 'aW52YWxpZF9obWFjX3NpZ25hdHVyZQ==',
      },
      body: payload,
    });
    expect(badWebhookRes.status).toBe(401);

    // 3. Webhook with valid base64 HMAC-SHA256 -> 200 { ok: true }
    const validHmac = createHmac('sha256', appEnv.SAPO_CLIENT_SECRET).update(payload, 'utf8').digest('base64');
    const goodWebhookRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/webhooks/sapo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sapo-Topic': 'products/update',
        'X-Sapo-Shop-Domain': 'f1genz-babymart.mysapo.net',
        'X-Sapo-Hmac-Sha256': validHmac,
      },
      body: payload,
    });
    expect(goodWebhookRes.status).toBe(200);
    expect(await goodWebhookRes.json()).toMatchObject({
      ok: true,
      queued: true,
      storeDomain: 'f1genz-babymart.mysapo.net',
      topic: 'products/update',
    });
  });
});
