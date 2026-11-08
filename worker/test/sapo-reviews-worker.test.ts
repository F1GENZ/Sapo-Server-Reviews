import { createHmac } from 'node:crypto';
import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { SessionService } from '../src/core/sapo/session.service';
import { TokenEncryptionService } from '../src/core/sapo/token-encryption.service';
import { SqliteRedisService } from '../src/db/sqlite-redis';
import type { WorkerEnv } from '../src/env';
import { buildAppEnv } from '../src/env';
import { handleSapoQueue } from '../src/index';
const testEnv = env as unknown as WorkerEnv & { SAPO_DB_SNAPSHOT_JSON?: string };
const STORE_DOMAIN = 'f1genz-babymart.mysapo.net';
const SHOP_ID = 'shop_babymart_test_01';
const PRODUCT_ID = '95252031';
const PRODUCT_ID_2 = '95252032';

// Valid 1x1 transparent PNG bytes
const VALID_PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
);


const readData = async <T>(res: Response): Promise<T> => {
  const json = (await res.json()) as { data: T };
  return json.data;
};
const buildAdminHeaders = (extra: Record<string, string> = {}) => {
  const appEnv = buildAppEnv(testEnv);
  const dummyRedis = {
    get: async () => null,
    set: async () => 'OK',
    del: async () => 0,
    getdel: async () => null,
    incrWithTtl: async () => 1,
  } as unknown as SqliteRedisService;
  const sessionService = new SessionService(appEnv, dummyRedis as never);
  const sessionToken = sessionService.createSessionToken(STORE_DOMAIN, 1);
  const cookieHeader = `${appEnv.SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  return {
    Authorization: `Bearer ${sessionToken}`,
    Cookie: cookieHeader,
    Origin: appEnv.FRONTEND_URL,
    Referer: `${appEnv.FRONTEND_URL}/`,
    'Content-Type': 'application/json',
    ...extra,
  };
};

describe('f1genz-sapo-reviews-api Cloudflare Worker (StoreDO SQLite + Edge Cache + RateLimit)', () => {
  beforeEach(async () => {
    const importToken = testEnv.MIGRATION_IMPORT_TOKEN || '';
    expect(importToken.length).toBeGreaterThanOrEqual(24);

    const resetRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/internal/import/reset', {
      method: 'POST',
      headers: { Authorization: `Bearer ${importToken}` },
    });
    expect(resetRes.status).toBe(200);

    const appEnv = buildAppEnv(testEnv);
    const tokenCrypto = new TokenEncryptionService(appEnv);
    const encToken = tokenCrypto.encrypt('sapo_access_token_babymart_verified_123456');

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

    const nowIso = new Date().toISOString();
    const seedBatches: Array<{ table: string; rows: unknown[] }> = [
      {
        table: 'Shop',
        rows: [{ id: SHOP_ID, storeDomain: STORE_DOMAIN, createdAt: nowIso, updatedAt: nowIso }],
      },
      {
        table: 'ShopDomain',
        rows: [
          {
            id: `${STORE_DOMAIN}:${STORE_DOMAIN}`,
            shopId: SHOP_ID,
            storeDomain: STORE_DOMAIN,
            domain: STORE_DOMAIN,
            kind: 'primary',
            active: true,
            tombstonedAt: null,
            source: 'install',
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        ],
      },
      {
        table: 'AppInstall',
        rows: [
          {
            id: 'install_babymart_test_01',
            shopId: SHOP_ID,
            storeDomain: STORE_DOMAIN,
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
      },
      {
        table: 'catalog_products',
        rows: [
          {
            id: `${SHOP_ID}:${PRODUCT_ID}`,
            shopId: SHOP_ID,
            productId: PRODUCT_ID,
            title: 'Sua bot cho be',
            handle: 'sua-bot-cho-be',
            image: 'https://images-sapo.f1genz.dev/sample.png',
            vendor: 'Babymart',
            productType: 'Milk',
            tags: ['baby', 'milk'],
            status: 'active',
            published: true,
            deletedAt: null,
            source: 'sapo',
            sourceUpdatedAt: Date.now(),
            rawPayload: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: `${SHOP_ID}:${PRODUCT_ID_2}`,
            shopId: SHOP_ID,
            productId: PRODUCT_ID_2,
            title: 'Binh sua cao cap',
            handle: 'binh-sua-cao-cap',
            image: null,
            vendor: 'Babymart',
            productType: 'Bottle',
            tags: [],
            status: 'active',
            published: true,
            deletedAt: null,
            source: 'sapo',
            sourceUpdatedAt: Date.now(),
            rawPayload: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      },
      {
        table: 'review_products',
        rows: [
          {
            id: 'rev_babymart_1',
            shopId: SHOP_ID,
            productId: PRODUCT_ID,
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
      },
      {
        table: 'qna_questions',
        rows: [
          {
            id: 'qna_babymart_1',
            shopId: SHOP_ID,
            productId: PRODUCT_ID,
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
      },
    ];

    for (const batch of seedBatches) {
      const res = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/internal/import/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${importToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
      expect(res.status).toBe(200);
    }
  });

  it('serves /livez, /health, /healthz, /api/healthz, /readyz, storefront static assets, and CORS preflights', async () => {
    for (const path of ['/livez', '/health', '/healthz', '/api/healthz']) {
      const res = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev${path}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    }

    const unauthReady = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/readyz');
    expect(unauthReady.status).toBe(401);

    const readyRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/readyz', {
      headers: { Authorization: `Bearer ${testEnv.READINESS_TOKEN}` },
    });
    expect(readyRes.status).toBe(200);
    const readyBody = (await readyRes.json()) as { ok: boolean; db: string; redis: string };
    expect(readyBody).toMatchObject({ ok: true, db: 'ok', redis: 'ok' });

    const preflightPublic = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/public/reviews/config/widget', {
      method: 'OPTIONS',
      headers: { Origin: 'https://f1genz-purity.mysapo.net' },
    });
    expect(preflightPublic.status).toBe(204);
    expect(preflightPublic.headers.get('Access-Control-Allow-Origin')).toBe('https://f1genz-purity.mysapo.net');
    expect(preflightPublic.headers.get('Access-Control-Allow-Headers')).toContain('X-Shop-Domain');

    const preflightAdminEvil = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/reviews', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(preflightAdminEvil.status).toBe(204);
    expect(preflightAdminEvil.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('encrypts and decrypts Sapo tokens with AES-256-GCM and decrypts real sapo_reviews_db AppInstall token', async () => {
    const appEnv = buildAppEnv(testEnv);
    const tokenCrypto = new TokenEncryptionService(appEnv);

    const babymartPlain = 'sapo_live_token_f1genz_babymart_99887766554433221100';
    const encrypted = tokenCrypto.encrypt(babymartPlain);
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.tag).toBeTruthy();
    expect(tokenCrypto.decrypt(encrypted)).toBe(babymartPlain);

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

  it('supports all store domain query & header aliases (storeDomain, shopDomain, store, shop, domain, bare subdomain) across /api/public/*', async () => {
    const bareSubdomain = STORE_DOMAIN.replace(/\.mysapo\.net$/, '');
    const aliases = [
      `storeDomain=${STORE_DOMAIN}`,
      `shopDomain=${STORE_DOMAIN}`,
      `store=${STORE_DOMAIN}`,
      `shop=${STORE_DOMAIN}`,
      `domain=${STORE_DOMAIN}`,
      `shop=${bareSubdomain}`,
      `store=${bareSubdomain}`,
      `storeDomain=${bareSubdomain}`,
      `shopDomain=${bareSubdomain}`,
      `domain=${bareSubdomain}`,
      `shop=${encodeURIComponent(`https://${STORE_DOMAIN}/`)}`,
    ];
    for (const query of aliases) {
      const cfgRes = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/reviews/config/widget?${query}`);
      expect(cfgRes.status, query).toBe(200);
      const cfgBody = (await cfgRes.json()) as { data: { reviewQnaDisplayMode: string; formPhoneMode: string } };
      expect(cfgBody.data.reviewQnaDisplayMode).toBe('tabs');
      expect(cfgBody.data.formPhoneMode).toBe('optional');
    }

    // Verify bare subdomain across all 5 storefront GET endpoints + Edge Cache MISS -> HIT
    const bareEndpoints = [
      `/api/public/reviews/config/widget?shop=${bareSubdomain}`,
      `/api/public/reviews/${PRODUCT_ID}/summary?shop=${bareSubdomain}`,
      `/api/public/reviews/${PRODUCT_ID}?shop=${bareSubdomain}`,
      `/api/public/qna/${PRODUCT_ID}/summary?shop=${bareSubdomain}`,
      `/api/public/qna/${PRODUCT_ID}?shop=${bareSubdomain}`,
    ];
    for (const ep of bareEndpoints) {
      const res = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev${ep}`);
      expect(res.status, ep).toBe(200);
      expect(['MISS', 'HIT']).toContain(res.headers.get('X-Edge-Cache'));
    }

    for (const headerName of ['x-store-domain', 'x-shop-domain', 'x-sapo-shop-domain']) {
      for (const headerVal of [STORE_DOMAIN, bareSubdomain]) {
        const res = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/summary`, {
          headers: { [headerName]: headerVal },
        });
        expect(res.status, `${headerName}=${headerVal}`).toBe(200);
        const body = (await res.json()) as { data: { count: number; avg: number } };
        expect(body.data.count).toBeGreaterThanOrEqual(1);
      }
    }

    const missingRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/public/reviews/config/widget');
    expect(missingRes.status).toBe(400);
    expect(await missingRes.json()).toMatchObject({ message: 'Missing store domain', statusCode: 400 });

    for (const bad of ['bad%20domain!', '-invalid-subdomain-', 'bad..domain.com']) {
      const invalidRes = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/reviews/config/widget?shop=${bad}`);
      expect(invalidRes.status, bad).toBe(400);
      expect(await invalidRes.json()).toMatchObject({ message: 'Invalid store domain', statusCode: 400 });
    }
  });

  it('serves Storefront Reviews (list, summary, slider, batch summaries, purchase eligibility, submit review) and invalidates Edge Cache', async () => {
    // 1. Summary + Edge Cache MISS -> HIT
    const summaryUrl = `https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/summary?shop=${STORE_DOMAIN}`;
    const sumRes1 = await SELF.fetch(summaryUrl);
    expect(sumRes1.status).toBe(200);
    expect(sumRes1.headers.get('X-Edge-Cache')).toBe('MISS');
    expect(sumRes1.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    const sumBody1 = (await sumRes1.json()) as { data: { avg: number; count: number; distribution: Record<string, number> } };
    expect(sumBody1.data.count).toBe(1);
    expect(sumBody1.data.avg).toBe(5);

    const sumRes2 = await SELF.fetch(summaryUrl);
    expect(sumRes2.status).toBe(200);
    expect(sumRes2.headers.get('X-Edge-Cache')).toBe('HIT');
    expect(sumRes2.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    // 2. Batch summaries
    const batchRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/reviews/summaries?productIds=${PRODUCT_ID},${PRODUCT_ID_2}&store=${STORE_DOMAIN}`,
    );
    expect(batchRes.status).toBe(200);
    const batchBody = (await batchRes.json()) as { data: Record<string, { count: number; avg: number }> };
    expect(batchBody.data[PRODUCT_ID].count).toBe(1);
    expect(batchBody.data[PRODUCT_ID_2].count).toBe(0);

    // 3. Reviews list
    const listRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}?shopDomain=${STORE_DOMAIN}&page=1&limit=10`,
    );
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { data: { total: number; items: Array<{ id: string; author: string }> } };
    expect(listBody.data.total).toBe(1);
    expect(listBody.data.items[0].author).toBe('Nguyen Van A');

    // 4. Curated Slider
    const sliderRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/slider?shop=${STORE_DOMAIN}`,
    );
    expect(sliderRes.status).toBe(200);
    const sliderBody = (await sliderRes.json()) as { data: { v: number; items: Array<{ id: string; r: number }> } };
    expect(sliderBody.data.v).toBe(1);
    expect(sliderBody.data.items.length).toBeGreaterThanOrEqual(1);

    // 5. Purchase eligibility check
    const eligRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/purchase-eligibility?shop=${STORE_DOMAIN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'customer@example.com', phone: '0987654321' }),
      },
    );
    expect(eligRes.status).toBe(200);
    const eligBody = (await eligRes.json()) as { data: { eligible: boolean; reason: string } };
    expect(typeof eligBody.data.eligible).toBe('boolean');

    // 6. Storefront Submit Review (validation + creation + Edge Cache bump)
    const badSubmit = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}?shop=${STORE_DOMAIN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 6, author: 'Khach Hang' }),
      },
    );
    expect(badSubmit.status).toBe(400);

    const goodSubmit = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}?shop=${STORE_DOMAIN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 4,
          author: 'Le Thi C',
          title: 'Rat hai long',
          content: 'Dong goi can than, se ung ho tiep!',
          email: 'lethic@example.com',
          phone: '0912345678',
        }),
      },
    );
    expect(goodSubmit.status).toBe(201);
    const createdReview = (await goodSubmit.json()) as { data: { id: string; rating: number; author: string } };
    expect(createdReview.data.rating).toBe(4);
    expect(createdReview.data.author).toBe('Le Thi C');

    // Edge cache must be invalidated after submit
    const sumAfterSubmit = await SELF.fetch(summaryUrl);
    expect(sumAfterSubmit.status).toBe(200);
    expect(sumAfterSubmit.headers.get('X-Edge-Cache')).toBe('MISS');
  });

  it('serves Storefront QnA (list, summary, submit question, validation, and allowQnA gating)', async () => {
    const qnaSummaryRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/qna/${PRODUCT_ID}/summary?shop=${STORE_DOMAIN}`,
    );
    expect(qnaSummaryRes.status).toBe(200);
    const qnaSummary = (await qnaSummaryRes.json()) as { data: { total: number; answered: number } };
    expect(qnaSummary.data.total).toBe(1);
    expect(qnaSummary.data.answered).toBe(1);

    const qnaListRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/qna/${PRODUCT_ID}?store=${STORE_DOMAIN}`,
    );
    expect(qnaListRes.status).toBe(200);
    const qnaList = (await qnaListRes.json()) as { data: { total: number; items: Array<{ question: string }> } };
    expect(qnaList.data.total).toBe(1);

    // Validation error on short question
    const badQna = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/qna/${PRODUCT_ID}?shop=${STORE_DOMAIN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: 'Hoang', question: 'Ngan' }),
      },
    );
    expect(badQna.status).toBe(400);

    // Valid question submit
    const goodQna = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/qna/${PRODUCT_ID}?shop=${STORE_DOMAIN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: 'Pham Van D',
          question: 'Cho minh hoi han su dung cua lo sua nay den bao gio?',
          email: 'phamvand@example.com',
        }),
      },
    );
    expect(goodQna.status).toBe(201);
    const createdQna = (await goodQna.json()) as { data: { id: string; status: string } };
    expect(createdQna.data.id).toBeTruthy();
    expect(createdQna.data.status).toBe('pending');
  });

  it('issues media upload tickets (/api/public/media/ticket, /upload-ticket, /api/admin/media/upload-ticket) and uploads files to R2 MEDIA_BUCKET', async () => {
    // 1. Public media ticket via /api/public/media/ticket with ?shop= alias
    const ticketRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/media/ticket?shop=${STORE_DOMAIN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: PRODUCT_ID,
          contentType: 'image/png',
          fileSize: VALID_PNG_BYTES.byteLength,
        }),
      },
    );
    expect(ticketRes.status).toBe(200);
    const ticketBody = (await ticketRes.json()) as { data: { ticket: string; expiresAt: number } };
    expect(ticketBody.data.ticket).toBeTruthy();

    // 2. Upload PNG to /api/public/media/upload
    const form = new FormData();
    form.append('file', new Blob([VALID_PNG_BYTES], { type: 'image/png' }), 'review-photo.png');

    const uploadRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/media/upload?productId=${PRODUCT_ID}&ticket=${encodeURIComponent(ticketBody.data.ticket)}&shop=${STORE_DOMAIN}`,
      {
        method: 'POST',
        body: form,
      },
    );
    expect(uploadRes.status).toBe(200);
    const uploadBody = (await uploadRes.json()) as { data: { url: string; type: string } };
    expect(uploadBody.data.type).toBe('image');
    expect(uploadBody.data.url).toContain(`https://images-sapo.f1genz.dev/reviews/${STORE_DOMAIN}/${PRODUCT_ID}/`);

    // Verify object exists in R2 MEDIA_BUCKET
    const r2Key = new URL(uploadBody.data.url).pathname.slice(1);
    const r2Obj = await testEnv.MEDIA_BUCKET?.get(r2Key);
    expect(r2Obj).not.toBeNull();
    expect(r2Obj?.httpMetadata?.contentType).toBe('image/png');
    const r2Bytes = Buffer.from(await r2Obj!.arrayBuffer());
    expect(r2Bytes.equals(VALID_PNG_BYTES)).toBe(true);

    // 3. Reusing the same one-shot ticket must be rejected with 409 Conflict
    const replayForm = new FormData();
    replayForm.append('file', new Blob([VALID_PNG_BYTES], { type: 'image/png' }), 'review-photo.png');
    const replayRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/media/upload?productId=${PRODUCT_ID}&ticket=${encodeURIComponent(ticketBody.data.ticket)}&shop=${STORE_DOMAIN}`,
      {
        method: 'POST',
        body: replayForm,
      },
    );
    expect(replayRes.status).toBe(409);

    // 4. Admin media upload-ticket endpoint
    const adminTicketRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/media/upload-ticket', {
      method: 'POST',
      headers: buildAdminHeaders(),
      body: JSON.stringify({
        productId: PRODUCT_ID,
        contentType: 'image/png',
        fileSize: VALID_PNG_BYTES.byteLength,
      }),
    });
    expect(adminTicketRes.status).toBe(201);
    const adminTicket = (await adminTicketRes.json()) as { data: { ticket: string } };
    expect(adminTicket.data.ticket).toBeTruthy();
  });

  it('serves Admin Dashboard, Products, Reviews moderation, QnA moderation, Widget/Spam configs, CSV import/export, and Outbound Webhooks', async () => {
    const headers = buildAdminHeaders();

    // 1. Dashboard Overview & Products & AI Status & Ops Diagnostics
    const dashRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/dashboard/overview', { headers });
    expect(dashRes.status).toBe(200);
    const dashBody = (await dashRes.json()) as { data: { totalReviews: number; totalQuestions: number } };
    expect(dashBody.data.totalReviews).toBeGreaterThanOrEqual(1);
    expect(dashBody.data.totalQuestions).toBeGreaterThanOrEqual(1);
    const prodsRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/products', { headers });
    expect(prodsRes.status).toBe(200);
    const prodsBody = (await prodsRes.json()) as { data: { total: number; products: Array<{ id: string }> } };
    expect(prodsBody.data.total).toBe(2);

    const singleProdRes = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/admin/products/${PRODUCT_ID}`, { headers });
    expect(singleProdRes.status).toBe(200);

    const aiStatusRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/ai/status', { headers });
    expect(aiStatusRes.status).toBe(200);

    const opsHealthRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/ops/health', { headers });
    expect(opsHealthRes.status).toBe(200);

    const opsDiagRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/ops/diagnostics/export', { headers });
    expect(opsDiagRes.status).toBe(200);

    // 2. Admin Reviews Moderation (create -> reply -> pin -> status -> update -> stats -> bulk -> delete)
    const createRevRes = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/admin/reviews/${PRODUCT_ID}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        rating: 5,
        author: 'Admin Seeded Reviewer',
        title: 'Danh gia tu Admin',
        content: 'San pham chinh hang 100%',
        email: 'admin-seed@example.com',
        verified: true,
      }),
    });
    expect(createRevRes.status).toBe(201);
    const createdRev = await readData<{ id: string }>(createRevRes);

    const replyRevRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/reviews/${PRODUCT_ID}/${createdRev.id}/reply`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ reply: 'Cam on ban da tin tuong shop!' }),
      },
    );
    expect(replyRevRes.status).toBe(200);
    const repliedRev = await readData<{ reply: string }>(replyRevRes);
    expect(repliedRev.reply).toBe('Cam on ban da tin tuong shop!');

    const pinRevRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/reviews/${PRODUCT_ID}/${createdRev.id}/pin`,
      { method: 'PATCH', headers, body: '{}' },
    );
    expect(pinRevRes.status).toBe(200);
    const pinnedRev = await readData<{ pinned: boolean }>(pinRevRes);
    expect(pinnedRev.pinned).toBe(true);

    const statusRevRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/reviews/${PRODUCT_ID}/${createdRev.id}/status`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'hidden' }),
      },
    );
    expect(statusRevRes.status).toBe(200);
    const hiddenRev = await readData<{ status: string }>(statusRevRes);
    expect(hiddenRev.status).toBe('hidden');

    const editRevRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/reviews/${PRODUCT_ID}/${createdRev.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ rating: 5, content: 'San pham chinh hang 100% (da cap nhat)' }),
      },
    );
    expect(editRevRes.status).toBe(200);

    const bulkRevRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/reviews/bulk', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'approve',
        items: [{ productId: PRODUCT_ID, reviewId: createdRev.id }],
      }),
    });
    expect(bulkRevRes.status).toBe(200);
    const bulkOut = await readData<{ updated: number }>(bulkRevRes);
    expect(bulkOut.updated).toBe(1);

    const statsRevRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/reviews/${PRODUCT_ID}/stats`,
      { headers },
    );
    expect(statsRevRes.status).toBe(200);

    const delRevRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/reviews/${PRODUCT_ID}/${createdRev.id}`,
      { method: 'DELETE', headers },
    );
    expect(delRevRes.status).toBe(200);
    const deletedRev = await readData<{ deleted: boolean }>(delRevRes);
    expect(deletedRev.deleted).toBe(true);
    // 3. Widget Config & Revisions + Spam Config + CSV Export/Import
    const updateWidgetRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/reviews/widget-config', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ titleText: 'Đánh giá từ Khách hàng', accentColor: '#0ca989' }),
    });
    expect(updateWidgetRes.status).toBe(200);

    const revisionsRes = await SELF.fetch(
      'https://api-sapo-reviews.f1genz.dev/api/admin/reviews/widget-config/revisions',
      { headers },
    );
    expect(revisionsRes.status).toBe(200);
    const revisions = await readData<Array<{ id: string }>>(revisionsRes);
    expect(revisions.length).toBeGreaterThanOrEqual(1);

    const restoreRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/reviews/widget-config/revisions/${revisions[0].id}/restore`,
      { method: 'POST', headers, body: '{}' },
    );
    expect(restoreRes.status).toBe(200);

    const updateSpamRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/reviews/spam-config', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ blockedWords: ['spamword123'], minContentLength: 5 }),
    });
    expect(updateSpamRes.status).toBe(200);

    const exportCsvRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/reviews/export?format=csv', {
      headers,
    });
    expect(exportCsvRes.status).toBe(200);
    const exportedCsv = await readData<{ body: string }>(exportCsvRes);
    expect(exportedCsv.body).toContain('product_id,review_id,rating');
    const importJsonPayload = JSON.stringify([
      {
        productId: PRODUCT_ID_2,
        reviewId: 'csv-imp-01',
        rating: 5,
        author: 'Imported Buyer',
        content: 'Binh sua rat tot, be rat thich',
        status: 'approved',
      },
    ]);
    const dryRunRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/reviews/import/dry-run', {
      method: 'POST',
      headers,
      body: JSON.stringify({ format: 'json', body: importJsonPayload }),
    });
    expect(dryRunRes.status).toBe(200);
    const dryRunOut = await readData<{ created: number }>(dryRunRes);
    expect(dryRunOut.created).toBe(1);

    const applyImpRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/reviews/import', {
      method: 'POST',
      headers,
      body: JSON.stringify({ format: 'json', body: importJsonPayload }),
    });
    expect(applyImpRes.status).toBe(200);
    const applyImpOut = await readData<{ created: number }>(applyImpRes);
    expect(applyImpOut.created).toBe(1);

    const impHistRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/reviews/import/history', {
      headers,
    });
    expect(impHistRes.status).toBe(200);
    const impHist = await readData<unknown[]>(impHistRes);
    expect(impHist.length).toBeGreaterThanOrEqual(1);

    // 4. Admin QnA Moderation (create -> answer -> status -> edit -> stats -> export -> delete)
    const createQnaRes = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/admin/qna/${PRODUCT_ID}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        author: 'Khach Hoi QnA',
        question: 'San pham co tem phu tieng Viet khong shop?',
        email: 'qna@example.com',
      }),
    });
    expect(createQnaRes.status).toBe(201);
    const createdQna = await readData<{ id: string }>(createQnaRes);
    const createdQnaId = createdQna.id;

    const answerQnaRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/qna/${PRODUCT_ID}/${createdQnaId}/answer`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ answer: 'Da co day du tem phu chinh hang a!', answered_by: 'CSKH' }),
      },
    );
    expect(answerQnaRes.status).toBe(200);
    const answeredQna = await readData<{ answer: string }>(answerQnaRes);
    expect(answeredQna.answer).toContain('tem phu');
    const statusQnaRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/qna/${PRODUCT_ID}/${createdQnaId}/status`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'approved' }),
      },
    );
    expect(statusQnaRes.status).toBe(200);

    const qnaStatsRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/qna/${PRODUCT_ID}/stats`,
      { headers },
    );
    expect(qnaStatsRes.status).toBe(200);

    const qnaExportRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/qna/export?format=csv', {
      headers,
    });
    expect(qnaExportRes.status).toBe(200);

    const delQnaRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/qna/${PRODUCT_ID}/${createdQnaId}`,
      { method: 'DELETE', headers },
    );
    expect(delQnaRes.status).toBe(200);

    // 5. Outbound Webhooks CRUD & Events list
    const eventsRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/outbound-webhooks/events', {
      headers,
    });
    expect(eventsRes.status).toBe(200);
    const eventsList = await readData<string[]>(eventsRes);
    expect(eventsList).toContain('review.created');

    const ssrfHookRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/outbound-webhooks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: 'https://127.0.0.1/private-hook',
        events: ['review.created'],
      }),
    });
    expect(ssrfHookRes.status).toBe(400);

    const createHookRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/outbound-webhooks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: 'https://93.184.216.34/sapo-reviews',
        events: ['review.created', 'qna.answered'],
        description: 'CRM webhook',
        active: true,
      }),
    });
    expect(createHookRes.status).toBe(201);
    const createdHook = await readData<{ endpoint: { id: string }; secret: string }>(createHookRes);
    const hookId = createdHook.endpoint.id;
    const listHookRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/outbound-webhooks', {
      headers,
    });
    expect(listHookRes.status).toBe(200);

    const updateHookRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/outbound-webhooks/${hookId}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ description: 'Updated CRM webhook', active: false }),
      },
    );
    expect(updateHookRes.status).toBe(200);

    const rotateHookRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/outbound-webhooks/${hookId}/rotate-secret`,
      { method: 'POST', headers, body: '{}' },
    );
    expect(rotateHookRes.status).toBe(200);

    const deliveriesRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/outbound-webhooks/${hookId}/deliveries`,
      { headers },
    );
    expect(deliveriesRes.status).toBe(200);

    const delHookRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/outbound-webhooks/${hookId}`,
      { method: 'DELETE', headers },
    );
    expect(delHookRes.status).toBe(200);
  });

  it('verifies Sapo OAuth (entry, start, verify-hmac -> session exchange -> session probe -> logout) and Sapo Webhook HMAC-SHA256 base64', async () => {
    const appEnv = buildAppEnv(testEnv);

    // 1. OAuth login entry (with ?storeDomain= and ?shop= aliases)
    for (const q of [
      `storeDomain=${STORE_DOMAIN}`,
      `shop=${STORE_DOMAIN}`,
      `store=${STORE_DOMAIN}`,
      `shop=${STORE_DOMAIN.replace(/\.mysapo\.net$/, '')}`,
    ]) {
      const oauthRes = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/oauth/install/login/entry?${q}`);
      expect(oauthRes.status, q).toBe(200);
      const oauthBody = (await oauthRes.json()) as { url: string };
      expect(oauthBody.url).toContain(`${STORE_DOMAIN}/admin/oauth/authorize`);
    }

    for (const startPath of ['/api/oauth/install/start', '/api/oauth/install']) {
      const oauthStartRes = await SELF.fetch(
        `https://api-sapo-reviews.f1genz.dev${startPath}?shop=${STORE_DOMAIN}`,
        { redirect: 'manual', headers: { Accept: 'text/html' } },
      );
      expect(oauthStartRes.status, startPath).toBe(302);
      const location = oauthStartRes.headers.get('Location') || '';
      expect(location).toContain(`${STORE_DOMAIN}/admin/oauth/authorize`);
      expect(decodeURIComponent(location)).toContain(
        'https://api-sapo-reviews.f1genz.dev/api/oauth/install/callback',
      );
    }

    // 2. OAuth verify-hmac -> handoff code -> session exchange -> session probe -> logout
    const ts = String(Math.floor(Date.now() / 1000));
    const msg = `store=${STORE_DOMAIN}&timestamp=${ts}`;
    const launchHmac = createHmac('sha256', appEnv.SAPO_CLIENT_SECRET).update(msg, 'utf8').digest('base64');
    const verifyRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/oauth/install/login/verify-hmac?${msg}&hmac=${encodeURIComponent(launchHmac)}`,
    );
    expect(verifyRes.status).toBe(200);
    const verifyBody = (await verifyRes.json()) as { handoffCode: string; storeDomain: string };
    expect(verifyBody.storeDomain).toBe(STORE_DOMAIN);
    expect(verifyBody.handoffCode).toBeTruthy();

    const exchangeRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/auth/session/exchange', {
      method: 'POST',
      headers: {
        Origin: appEnv.FRONTEND_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ handoffCode: verifyBody.handoffCode }),
    });
    expect(exchangeRes.status).toBe(200);
    const exchangeCookie = exchangeRes.headers.get('set-cookie') || '';
    expect(exchangeCookie).toContain('SameSite=None');
    expect(exchangeCookie).toContain('Secure');
    expect(exchangeCookie).toContain('HttpOnly');
    const exchangeBody = (await exchangeRes.json()) as { sessionToken: string; storeDomain: string };
    expect(exchangeBody.storeDomain).toBe(STORE_DOMAIN);
    expect(exchangeBody.sessionToken).toBeTruthy();

    const sessionProbeRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/app/session', {
      headers: {
        Authorization: `Bearer ${exchangeBody.sessionToken}`,
        Origin: appEnv.FRONTEND_URL,
      },
    });
    expect(sessionProbeRes.status).toBe(200);
    expect(await sessionProbeRes.json()).toMatchObject({
      data: {
        storeDomain: STORE_DOMAIN,
        status: 'active',
        featuresUnlocked: true,
      },
    });

    const logoutRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${exchangeBody.sessionToken}`,
        Cookie: `${appEnv.SESSION_COOKIE_NAME}=${encodeURIComponent(exchangeBody.sessionToken)}`,
        Origin: appEnv.FRONTEND_URL,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(logoutRes.status).toBe(200);

    // 3. Webhook GET challenge & POST HMAC-SHA256 base64
    const challengeRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/oauth/install/webhooks');
    expect(challengeRes.status).toBe(200);
    expect(await challengeRes.text()).toBe('ok');

    const payload = JSON.stringify({ id: 95252031, name: 'Sua bot cho be cap nhat' });
    const badWebhookRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/webhooks/sapo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sapo-Topic': 'products/update',
        'X-Sapo-Shop-Domain': STORE_DOMAIN,
        'X-Sapo-Hmac-Sha256': 'aW52YWxpZF9obWFjX3NpZ25hdHVyZQ==',
      },
      body: payload,
    });
    expect(badWebhookRes.status).toBe(401);

    const validHmac = createHmac('sha256', appEnv.SAPO_CLIENT_SECRET).update(payload, 'utf8').digest('base64');
    const goodWebhookRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/webhooks/sapo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sapo-Topic': 'products/update',
        'X-Sapo-Shop-Domain': STORE_DOMAIN,
        'X-Sapo-Hmac-Sha256': validHmac,
      },
      body: payload,
    });
    expect(goodWebhookRes.status).toBe(200);
    expect(await goodWebhookRes.json()).toMatchObject({
      ok: true,
      queued: true,
      storeDomain: STORE_DOMAIN,
      topic: 'products/update',
    });
  });

  it('supports PUT/PATCH parity on review/qna moderation, explicit pin payload, slider limit, and edge cache invalidation across full and bare shop params', async () => {
    const headers = buildAdminHeaders();
    const bareShop = 'f1genz-babymart';

    // Prime edge cache on both full ?shop=f1genz-babymart.mysapo.net and bare ?shop=f1genz-babymart
    await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/summary?shop=${STORE_DOMAIN}`);
    const hitFull = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/summary?shop=${STORE_DOMAIN}`);
    expect(hitFull.headers.get('X-Edge-Cache')).toBe('HIT');

    await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/summary?shop=${bareShop}`);
    const hitBare = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/summary?shop=${bareShop}`);
    expect(hitBare.headers.get('X-Edge-Cache')).toBe('HIT');

    // Admin pin review with explicit { pinned: true } via PUT (without ?shop= query, using JWT session only)
    const pinRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/reviews/${PRODUCT_ID}/imp-babymart-1/pin`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ pinned: true }),
      },
    );
    expect(pinRes.status).toBe(200);
    const pinnedReview = await readData<{ pinned: boolean }>(pinRes);
    expect(pinnedReview.pinned).toBe(true);

    // Both full and bare shop summary queries must immediately rotate to MISS -> HIT
    const missFull = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/summary?shop=${STORE_DOMAIN}`);
    expect(missFull.headers.get('X-Edge-Cache')).toBe('MISS');
    const missBare = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/summary?shop=${bareShop}`);
    expect(missBare.headers.get('X-Edge-Cache')).toBe('MISS');

    // PUT reply & PUT answer parity
    const replyPutRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/reviews/${PRODUCT_ID}/imp-babymart-1/reply`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ reply: 'Cam on ban da mua hang!' }),
      },
    );
    expect(replyPutRes.status).toBe(200);

    const ansPutRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/qna/${PRODUCT_ID}/q-babymart-1/answer`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ answer: 'Dung cho be tu 6 thang tuoi tro len.' }),
      },
    );
    expect(ansPutRes.status).toBe(200);

    // Slider with ?limit=5
    const sliderRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/slider?limit=5&shop=${STORE_DOMAIN}`,
    );
    expect(sliderRes.status).toBe(200);
    const sliderData = await readData<{ v: number; items: Array<{ id: string }> }>(sliderRes);
    expect(sliderData.v).toBe(1);
    expect(sliderData.items.length).toBeGreaterThanOrEqual(1);
  });

  it('serves R2 media through /api/public/media/file/* with immutable Cache-Control, ETag 304, X-Edge-Cache MISS->HIT, and evicts caches.default on DELETE', async () => {
    const headers = buildAdminHeaders();

    // 1. Issue public upload ticket and upload PNG to R2
    const ticketRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/public/media/ticket', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Store-Domain': STORE_DOMAIN,
      },
      body: JSON.stringify({
        productId: PRODUCT_ID,
        contentType: 'image/png',
        fileSize: VALID_PNG_BYTES.length,
      }),
    });
    expect(ticketRes.status).toBe(200);
    const ticketData = await readData<{ ticket: string }>(ticketRes);

    const form = new FormData();
    form.append('file', new File([VALID_PNG_BYTES], 'edge-cache.png', { type: 'image/png' }));
    const uploadRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/public/media/upload?productId=${PRODUCT_ID}&ticket=${encodeURIComponent(ticketData.ticket)}`,
      {
        method: 'POST',
        headers: { 'X-Store-Domain': STORE_DOMAIN },
        body: form,
      },
    );
    expect(uploadRes.status).toBe(200);
    const uploaded = await readData<{ url: string; type: string }>(uploadRes);
    const key = new URL(uploaded.url).pathname.slice(1);

    // 2. First GET -> 200 MISS with immutable Cache-Control and ETag
    const firstGet = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/media/file/${key}`);
    expect(firstGet.status).toBe(200);
    expect(firstGet.headers.get('X-Edge-Cache')).toBe('MISS');
    expect(firstGet.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    const etag = firstGet.headers.get('ETag');
    expect(etag).toBeTruthy();

    // 3. Second GET -> 200 HIT
    const secondGet = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/media/file/${key}`);
    expect(secondGet.status).toBe(200);
    expect(secondGet.headers.get('X-Edge-Cache')).toBe('HIT');
    expect(secondGet.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

    // 4. Conditional GET with If-None-Match -> 304 Not Modified HIT
    const condGet = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/media/file/${key}`, {
      headers: { 'If-None-Match': etag! },
    });
    expect(condGet.status).toBe(304);
    expect(condGet.headers.get('X-Edge-Cache')).toBe('HIT');

    // 4b. Forged unsigned JWT on DELETE /api/public/media/file/* is rejected with 401 and keeps media intact
    const forgedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const forgedPayload = Buffer.from(
      JSON.stringify({
        storeDomain: STORE_DOMAIN,
        type: 'sapo_app_session',
        gen: 1,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const forgedDelRes = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/media/file/${key}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${forgedHeader}.${forgedPayload}.forged_signature` },
    });
    expect(forgedDelRes.status).toBe(401);
    const stillCachedGet = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/media/file/${key}`);
    expect(stillCachedGet.status).toBe(200);
    expect(stillCachedGet.headers.get('X-Edge-Cache')).toBe('HIT');
    // 5. Create review referencing the media, then DELETE the review -> evicts caches.default -> GET returns 404
    const createRevRes = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/admin/reviews/${PRODUCT_ID}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        rating: 5,
        author: 'Media Cache Buyer',
        content: 'Hinh anh ro net, chat luong tot',
        media: [{ url: uploaded.url, type: 'image' }],
      }),
    });
    expect(createRevRes.status).toBe(201);
    const createdRev = await readData<{ id: string }>(createRevRes);

    const delRevRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/admin/reviews/${PRODUCT_ID}/${createdRev.id}`,
      {
        method: 'DELETE',
        headers,
      },
    );
    expect(delRevRes.status).toBe(200);

    // 6. Immediately after DELETE -> GET returns 404 Not Found
    const afterDeleteGet = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/media/file/${key}`);
    expect(afterDeleteGet.status).toBe(404);

    // 7. Verify AI status includes configured=true, workersAi=true, provider=workers-ai, model=@cf/meta/llama-3.1-8b-instruct-fast
    const aiStatusRes = await SELF.fetch('https://api-sapo-reviews.f1genz.dev/api/admin/ai/status', { headers });
    expect(aiStatusRes.status).toBe(200);
    const aiStatusJson = (await aiStatusRes.json()) as {
      configured: boolean;
      workersAi: boolean;
      provider: string;
      model: string;
      fallbackModel: string;
      data: {
        configured: boolean;
        workersAi: boolean;
        provider: string;
        model: string;
        fallbackModel: string;
      };
    };
    expect(aiStatusJson.configured).toBe(true);
    expect(aiStatusJson.workersAi).toBe(true);
    expect(aiStatusJson.provider).toBe('workers-ai');
    expect(aiStatusJson.model).toBe('@cf/meta/llama-3.1-8b-instruct-fast');
    expect(aiStatusJson.fallbackModel).toBe('@cf/meta/llama-3.1-8b-instruct-fast');
    expect(aiStatusJson.data.configured).toBe(true);
    expect(aiStatusJson.data.workersAi).toBe(true);
    expect(aiStatusJson.data.provider).toBe('workers-ai');
    expect(aiStatusJson.data.model).toBe('@cf/meta/llama-3.1-8b-instruct-fast');
    expect(aiStatusJson.data.fallbackModel).toBe('@cf/meta/llama-3.1-8b-instruct-fast');
    // 8. Verify Queue consumer batching by storeDomain & Edge Cache invalidation
    await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/summary?shop=${STORE_DOMAIN}`);
    const beforeQueueHit = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/summary?shop=${STORE_DOMAIN}`);
    expect(beforeQueueHit.headers.get('X-Edge-Cache')).toBe('HIT');

    let acked = 0;
    const fakeBatch = {
      queue: 'f1genz-sapo-reviews-events-queue',
      messages: [
        {
          id: 'sm1',
          timestamp: new Date(),
          attempts: 1,
          body: { kind: 'webhook.process', storeDomain: STORE_DOMAIN },
          ack: () => {
            acked += 1;
          },
          retry: () => undefined,
        },
        {
          id: 'sm2',
          timestamp: new Date(),
          attempts: 1,
          body: { kind: 'outbound.deliver', storeDomain: STORE_DOMAIN },
          ack: () => {
            acked += 1;
          },
          retry: () => undefined,
        },
      ],
      ackAll: () => undefined,
      retryAll: () => undefined,
    } as unknown as MessageBatch<unknown>;

    await handleSapoQueue(fakeBatch, testEnv);
    expect(acked).toBe(2);

    const afterQueueMiss = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/reviews/${PRODUCT_ID}/summary?shop=${STORE_DOMAIN}`);
    expect(afterQueueMiss.headers.get('X-Edge-Cache')).toBe('MISS');

    let retried = 0;
    let failedAcked = 0;
    const failingSapoEnv = {
      ...testEnv,
      STORE_DO: {
        idFromName: (name: string) => testEnv.STORE_DO!.idFromName(name),
        get: () => ({
          processQueuedBatch: async () => {
            throw new Error('simulated Sapo StoreDO failure');
          },
        }),
      },
    } as unknown as WorkerEnv;
    await handleSapoQueue(
      {
        queue: 'f1genz-sapo-reviews-events-queue',
        messages: [
          {
            id: 'sm-fail-1',
            timestamp: new Date(),
            attempts: 1,
            body: { kind: 'webhook.process', storeDomain: STORE_DOMAIN },
            ack: () => {
              failedAcked += 1;
            },
            retry: () => {
              retried += 1;
            },
          },
        ],
        ackAll: () => undefined,
        retryAll: () => undefined,
      } as unknown as MessageBatch<unknown>,
      failingSapoEnv,
    );
    expect(failedAcked).toBe(0);
    expect(retried).toBe(1);
  });

  it('accepts a login-flow state on the install callback without a 401 state error', async () => {
    const entryRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/oauth/install/login/entry?storeDomain=${STORE_DOMAIN}`,
    );
    expect(entryRes.status).toBe(200);
    const { url } = (await entryRes.json()) as { url: string };
    const state = new URL(url).searchParams.get('state');
    expect(state).toBeTruthy();

    const cbRes = await SELF.fetch(
      `https://api-sapo-reviews.f1genz.dev/api/oauth/install/callback?code=fake-code&state=${state}&shop=${STORE_DOMAIN}`,
      { redirect: 'manual' },
    );
    const cbText = await cbRes.text();
    expect(cbText).not.toContain('Invalid or expired OAuth state');
  });

  it('admin reviews and Q&A honour sortBy/pageSize, edit created_at/title, clear reply, and Q&A answer approves a pending question', async () => {
    const headers = buildAdminHeaders();
    const base = 'https://api-sapo-reviews.f1genz.dev';

    const createRes = await SELF.fetch(`${base}/api/admin/reviews/${PRODUCT_ID}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        rating: 4,
        author: 'Sort Tester',
        title: 'Tieu de can xoa',
        content: 'Noi dung kiem thu sap xep',
        created_at: 1_600_000_000_000,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await readData<{ id: string }>(createRes);

    const oldestRes = await SELF.fetch(`${base}/api/admin/reviews?sortBy=oldest&pageSize=1`, { headers });
    expect(oldestRes.status).toBe(200);
    const oldest = await readData<{ items: Array<{ id: string }>; pageSize: number }>(oldestRes);
    expect(oldest.pageSize).toBe(1);
    expect(oldest.items).toHaveLength(1);
    expect(oldest.items[0].id).toBe(created.id);

    const editRes = await SELF.fetch(`${base}/api/admin/reviews/${PRODUCT_ID}/${created.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ title: '', created_at: 1_500_000_000_000 }),
    });
    expect(editRes.status).toBe(200);
    const edited = await readData<{ title: string | null; created_at: number }>(editRes);
    expect(edited.title ?? null).toBeNull();
    expect(Number(edited.created_at)).toBe(1_500_000_000_000);

    const replyRes = await SELF.fetch(`${base}/api/admin/reviews/${PRODUCT_ID}/${created.id}/reply`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ reply: 'Cam on ban' }),
    });
    expect(replyRes.status).toBe(200);
    const clearRes = await SELF.fetch(`${base}/api/admin/reviews/${PRODUCT_ID}/${created.id}/reply`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ reply: '' }),
    });
    expect(clearRes.status).toBe(200);
    const cleared = await readData<{ reply: string | null; replied_at: number | null }>(clearRes);
    expect(cleared.reply ?? null).toBeNull();
    expect(cleared.replied_at ?? null).toBeNull();

    const qnaRes = await SELF.fetch(`${base}/api/admin/qna?status=approved&pageSize=5&sortBy=oldest`, { headers });
    expect(qnaRes.status).toBe(200);
    const qnaPage = await readData<{ items: Array<{ status: string }>; pageSize: number }>(qnaRes);
    expect(qnaPage.pageSize).toBe(5);
    for (const item of qnaPage.items) expect(item.status).toBe('approved');

    const askRes = await SELF.fetch(`${base}/api/admin/qna/${PRODUCT_ID}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question: 'San pham nay dung duoc bao lau?', author: 'Khach A' }),
    });
    expect(askRes.status).toBe(201);
    const asked = await readData<{ id: string; status: string }>(askRes);
    const patchRes = await SELF.fetch(`${base}/api/admin/qna/${PRODUCT_ID}/${asked.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ answer: 'Dung duoc 2 nam.' }),
    });
    expect(patchRes.status).toBe(200);
    const answered = await readData<{ status: string; answer: string }>(patchRes);
    expect(answered.answer).toBe('Dung duoc 2 nam.');
    expect(answered.status).toBe('approved');
  });

  it('JSON import keeps verified, pinned and media', async () => {
    const headers = buildAdminHeaders();
    const base = 'https://api-sapo-reviews.f1genz.dev';
    const payload = JSON.stringify([
      {
        productId: PRODUCT_ID,
        reviewId: 'json-keep-01',
        rating: 5,
        author: 'Import Keeper',
        content: 'Giu nguyen truong khi import',
        status: 'approved',
        verified: true,
        pinned: true,
        media: [{ url: 'https://images-sapo.f1genz.dev/reviews/x/1/a.png', type: 'image' }],
      },
    ]);
    const applyRes = await SELF.fetch(`${base}/api/admin/reviews/import`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ format: 'json', body: payload }),
    });
    expect(applyRes.status).toBe(200);

    const listRes = await SELF.fetch(`${base}/api/admin/reviews/${PRODUCT_ID}`, { headers });
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as { data: unknown };
    const rows = (Array.isArray(body.data) ? body.data : (body.data as { items: unknown[] }).items) as Array<{
      id: string;
      verified: boolean;
      pinned: boolean;
      media: Array<{ url: string }>;
    }>;
    const row = rows.find((r) => r.id === 'json-keep-01');
    expect(row).toBeTruthy();
    expect(row!.verified).toBe(true);
    expect(row!.pinned).toBe(true);
    expect(row!.media).toHaveLength(1);
  });

  it('runtime validation rejects bad review, status, widget config payloads and coerces numeric productId for upload tickets', async () => {
    const headers = buildAdminHeaders();
    const base = 'https://api-sapo-reviews.f1genz.dev';

    const badRating = await SELF.fetch(`${base}/api/admin/reviews/${PRODUCT_ID}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rating: 99, author: 'X', content: 'abc' }),
    });
    expect(badRating.status).toBe(400);

    const badStatus = await SELF.fetch(`${base}/api/admin/reviews/${PRODUCT_ID}/imp-babymart-1/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'invalid' }),
    });
    expect(badStatus.status).toBe(400);

    const badIcon = await SELF.fetch(`${base}/api/admin/reviews/widget-config`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ starIconUrl: 'javascript:alert(1)' }),
    });
    expect(badIcon.status).toBe(400);

    const ticketRes = await SELF.fetch(`${base}/api/admin/media/upload-ticket`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        productId: Number(PRODUCT_ID),
        contentType: 'image/png',
        fileSize: VALID_PNG_BYTES.length,
      }),
    });
    expect(ticketRes.status).toBe(201);
  });

  it('public Q&A submit response carries no email or phone', async () => {
    const res = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev/api/public/qna/${PRODUCT_ID}?shop=${STORE_DOMAIN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: 'Khach Hoi',
        question: 'Con hang mau xanh khong shop?',
        email: 'ask@example.com',
      }),
    });
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain('ask@example.com');
    const json = JSON.parse(text) as { data: Record<string, unknown> };
    expect('email' in json.data).toBe(false);
    expect('phone' in json.data).toBe(false);
  });

  it('outbound webhook test reports a boolean delivered flag', async () => {
    const headers = buildAdminHeaders();
    const base = 'https://api-sapo-reviews.f1genz.dev';
    const createRes = await SELF.fetch(`${base}/api/admin/outbound-webhooks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: 'https://93.184.216.34/sapo-test', events: ['review.created'], active: true }),
    });
    expect(createRes.status).toBe(201);
    const created = await readData<{ endpoint: { id: string } }>(createRes);
    const testRes = await SELF.fetch(`${base}/api/admin/outbound-webhooks/${created.endpoint.id}/test`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    expect(testRes.status).toBeLessThan(300);
    const out = await readData<{ delivered: boolean; status: string; error: string | null }>(testRes);
    expect(typeof out.delivered).toBe('boolean');
    expect(out.delivered).toBe(out.status === 'delivered');
  });

  it('storefront assets and the review-widget alias are served with open CORS', async () => {
    for (const path of ['/storefront/f1genz-storefront.js', '/storefront/review-widget.js']) {
      const res = await SELF.fetch(`https://api-sapo-reviews.f1genz.dev${path}`);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin'), path).toBe('*');
      await res.arrayBuffer();
    }
  });
});
