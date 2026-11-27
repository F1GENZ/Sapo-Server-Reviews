import { env, runInDurableObject } from 'cloudflare:test';
import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaSqliteService } from '../src/db/prisma-sqlite';
import { TokenEncryptionService } from '../src/core/sapo/token-encryption.service';
import { buildAppEnv } from '../src/env';
import type { WorkerEnv } from '../src/env';
import { ReviewRequestService } from '../src/core/email/review-request.service';
import { createReviewTokenSigner } from '../src/core/email/review-token';
import { buildPopupFeed, maskPopupName } from '../src/core/review/popup-feed';
import { DEFAULT_SOCIAL_PROOF, normalizeSocialProof } from '../src/core/review/interfaces/widget-config.interface';
import type { StoreDO } from '../src/store-do';

// Kaizen email-pipeline units. Each shop runs inside its own StoreDO so the sqlite shim gets real
// workerd storage: enqueue → backoff → terminal states and the sealed-secret config round-trip.
// Assertions therefore return plain values out of the DO closure instead of inspecting rows live.

const testEnv = env as unknown as WorkerEnv;
const appEnv = buildAppEnv(testEnv);

let seq = 0;
const withShop = async <R>(fn: (handle: {
  shopId: string;
  storeDomain: string;
  prisma: PrismaSqliteService;
  service: ReviewRequestService;
}) => Promise<R>): Promise<R> => {
  seq += 1;
  const shopId = `shop_kaizen_${seq}`;
  const storeDomain = `kaizen-${seq}.mysapo.net`;
  const stub = env.STORE_DO.get(env.STORE_DO.idFromName(storeDomain));
  return runInDurableObject(stub, async (instance: StoreDO) => {
    const prisma = instance.container.prisma;
    await prisma.appInstall.create({ data: { shopId, storeDomain, metadata: {} } });
    const service = new ReviewRequestService(prisma as never, new TokenEncryptionService(appEnv), appEnv);
    return fn({ shopId, storeDomain, prisma, service });
  });
};

const fulfilledOrder = (overrides: Record<string, unknown> = {}) => ({
  id: '77001',
  order_number: 'DH-77001',
  fulfillment_status: 'fulfilled',
  email: 'Khach@Example.com',
  customer_name: 'Nguyễn Văn An',
  line_items: [{ product_id: '95252031' }, { product_id: '95252099' }],
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('review token signer', () => {
  const signer = createReviewTokenSigner(appEnv.DATA_ENCRYPTION_KEY);

  it('round-trips shop+order+product and rejects wrong context', () => {
    const token = signer.sign('shop1', 'order9', 'prod3');
    expect(signer.verify('shop1', token, 'prod3')).toBe('order9');
    expect(signer.verify('shop1', token, 'prod4')).toBeNull();
    expect(signer.verify('shop2', token, 'prod3')).toBeNull();
  });

  it('rejects tampered signatures and malformed tokens', () => {
    const token = signer.sign('shop1', 'order9', 'prod3');
    const flipped = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    expect(signer.verify('shop1', flipped, 'prod3')).toBeNull();
    expect(signer.verify('shop1', '', 'prod3')).toBeNull();
    expect(signer.verify('shop1', 'x.y.z', 'prod3')).toBeNull();
    expect(signer.verify('shop1', `rr2.order9.${'0'.repeat(64)}`, 'prod3')).toBeNull();
    expect(signer.verify('shop1', token, '')).toBeNull();
  });
});

describe('social proof normalization', () => {
  it('defaults to disabled and clamps every knob', () => {
    expect(normalizeSocialProof(undefined)).toEqual(DEFAULT_SOCIAL_PROOF);
    expect(normalizeSocialProof({ enabled: true, position: 'top-left', interval_sec: 100, max_per_session: 0, min_rating: 'x' })).toEqual({
      enabled: true,
      position: 'bottom-left',
      interval_sec: 15,
      max_per_session: 1,
      min_rating: DEFAULT_SOCIAL_PROOF.min_rating,
    });
    expect(normalizeSocialProof({ enabled: 'yes', position: 'bottom-right', interval_sec: 3 })).toEqual({
      ...DEFAULT_SOCIAL_PROOF,
      enabled: false,
      position: 'bottom-right',
      interval_sec: 8,
    });
  });
});

describe('popup feed', () => {
  it('masks names to first+last-initial', () => {
    expect(maskPopupName('Nguyễn Văn A')).toBe('Nguyễn A.');
    expect(maskPopupName('Anna')).toBe('A.');
    expect(maskPopupName('   ')).toBe('Khách');
  });

  it('serves only recent approved high ratings, masked and excerpt-clamped', async () => {
    const feed = await withShop(async ({ shopId, prisma }) => {
      const now = Date.now();
      await prisma.reviewProduct.create({
        data: {
          shopId,
          productId: '11',
          status: 'approved',
          rating: 5,
          author: 'Trần Thị Mai',
          productTitle: 'Sản phẩm A',
          content: 'X'.repeat(200),
          createdAt: BigInt(now - 60_000),
        },
      });
      await prisma.reviewProduct.create({
        data: {
          shopId,
          productId: '12',
          status: 'approved',
          rating: 4,
          author: 'Lê Văn Ty',
          productName: 'Bánh Tráng Nướng',
          title: 'Ngon',
          createdAt: BigInt(now - 120_000),
        },
      });
      await prisma.reviewProduct.create({
        data: { shopId, productId: '13', status: 'approved', rating: 3, author: 'Low Star', createdAt: BigInt(now) },
      });
      await prisma.reviewProduct.create({
        data: { shopId, productId: '14', status: 'pending', rating: 5, author: 'Hidden', createdAt: BigInt(now) },
      });
      const loose = await buildPopupFeed(prisma as never, shopId, 4);
      const strict = await buildPopupFeed(prisma as never, shopId, 5);
      return { loose, strict };
    });
    expect(feed.loose.v).toBe(1);
    expect(feed.loose.items.map((item) => item.product_id)).toEqual(['11', '12']);
    expect(feed.loose.items[0].author).toBe('Trần M.');
    expect(feed.loose.items[0].excerpt.length).toBeLessThanOrEqual(120);
    expect(feed.loose.items[1].product_title).toBe('Bánh Tráng Nướng');
    expect(feed.loose.items[1].excerpt).toBe('Ngon');
    expect(feed.loose.items[0].created_at).toBeGreaterThan(0);
    expect(feed.strict.items.map((item: { product_id: string }) => item.product_id)).toEqual(['11']);
  });
});

describe('review-request config store', () => {
  it('masks defaults when nothing is configured', async () => {
    const masked = await withShop(({ storeDomain, service }) => service.getReviewRequestConfigMasked(storeDomain));
    expect(masked).toMatchObject({ enabled: false, backend: 'smtp', smtp: null, api_key_set: false, delay_days: 3 });
  });

  it('seals the smtp password at rest and never returns plaintext', async () => {
    const result = await withShop(async ({ storeDomain, prisma, service }) => {
      const masked = await service.updateReviewRequestConfig(storeDomain, {
        enabled: true,
        backend: 'smtp',
        smtp: { host: 'smtp.gmail.com', port: 465, user: 'shop@gmail.com', pass: 'app-password-16', from_email: 'shop@gmail.com', tls: 'tls' },
      });
      const install = await prisma.appInstall.findUnique({ where: { storeDomain } });
      const after = await service.updateReviewRequestConfig(storeDomain, { delay_days: 5 });
      return { masked, install, after };
    });
    const maskedSmtp = result.masked.smtp as Record<string, unknown>;
    expect(maskedSmtp.pass_set).toBe(true);
    expect(String(maskedSmtp.pass_hint)).toBe('***d-16');
    expect(JSON.stringify(result.masked)).not.toContain('app-password-16');
    expect(JSON.stringify(result.masked)).not.toContain('enc:v1');

    const metadata = result.install?.metadata as Record<string, unknown> | undefined;
    const reviewRequest = metadata?.review_request as Record<string, unknown> | undefined;
    const storedSmtp = reviewRequest?.smtp as Record<string, string> | undefined;
    expect(storedSmtp?.pass?.startsWith('enc:v1:')).toBe(true);
    expect(storedSmtp?.pass).not.toContain('app-password-16');

    expect(result.after.delay_days).toBe(5);
    const afterSmtp = result.after.smtp as Record<string, unknown>;
    expect(afterSmtp.pass_set).toBe(true);
  });

  it('keeps a stored api_key when the update omits it', async () => {
    const maskedAgain = await withShop(async ({ storeDomain, service }) => {
      await service.updateReviewRequestConfig(storeDomain, { backend: 'resend', api_key: 're_secret_1234', from_email: 'hi@shop.mysapo.net' });
      const masked = await service.getReviewRequestConfigMasked(storeDomain);
      const again = await service.updateReviewRequestConfig(storeDomain, { from_name: 'Shop' });
      return { masked, again };
    });
    expect(maskedAgain.masked.api_key_set).toBe(true);
    expect(JSON.stringify(maskedAgain.masked)).not.toContain('re_secret_1234');
    expect(maskedAgain.again.api_key_set).toBe(true);
  });

  it('rejects invalid backend, delay and port', async () => {
    await withShop(async ({ storeDomain, service }) => {
      await expect(service.updateReviewRequestConfig(storeDomain, { backend: 'mailgun' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateReviewRequestConfig(storeDomain, { delay_days: 99 })).rejects.toThrow(/delay_days/);
      await expect(service.updateReviewRequestConfig(storeDomain, { smtp: { port: 99999 } })).rejects.toThrow(/smtp\.port/);
      return null;
    });
  });

  it('throws on an unknown store when updating', async () => {
    await withShop(async ({ service }) => {
      await expect(service.updateReviewRequestConfig('ghost.mysapo.net', { enabled: true })).rejects.toThrow(/Unknown store/);
      return null;
    });
  });
});

describe('review-request lifecycle', () => {
  it('enqueues fulfilled orders with delay, idempotently', async () => {
    const rows = await withShop(async ({ shopId, storeDomain, prisma, service }) => {
      await service.updateReviewRequestConfig(storeDomain, { enabled: true, delay_days: 2, backend: 'resend', api_key: 're_k', from_email: 'hi@x.mysapo.net' });
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder());
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder());
      const found = await prisma.reviewRequestEmail.findMany({ where: { shopId } });
      return found.map((row) => ({
        status: String(row.status),
        customerEmail: String(row.customerEmail),
        runAtLag: new Date(String(row.runAt)).getTime() - Date.now(),
      }));
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('queued');
    expect(rows[0].customerEmail).toBe('khach@example.com');
    expect(rows[0].runAtLag).toBeGreaterThan(1.9 * 86_400_000);
    expect(rows[0].runAtLag).toBeLessThanOrEqual(2.01 * 86_400_000);
  });

  it('skips disabled configs, missing emails and non-fulfilled statuses', async () => {
    const count = await withShop(async ({ shopId, storeDomain, prisma, service }) => {
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder());
      await service.updateReviewRequestConfig(storeDomain, { enabled: true });
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder({ email: '', customer: {}, billing_address: {} }));
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder({ fulfillment_status: 'delivered' }));
      await service.detectOrderFulfilled(shopId, storeDomain, { id: '' });
      return prisma.reviewRequestEmail.count({ where: { shopId } });
    });
    expect(count).toBe(0);
  });

  it('cancels queued rows when a later webhook reports the order cancelled', async () => {
    const status = await withShop(async ({ shopId, storeDomain, prisma, service }) => {
      await service.updateReviewRequestConfig(storeDomain, { enabled: true, delay_days: 0 });
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder());
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder({ fulfillment_status: 'cancelled' }));
      const row = await prisma.reviewRequestEmail.findFirst({ where: { shopId } });
      return String(row?.status);
    });
    expect(status).toBe('cancelled');
  });

  it('sends via resend with per-product review-token links', async () => {
    const outcome = await withShop(async ({ shopId, storeDomain, prisma, service }) => {
      await service.updateReviewRequestConfig(storeDomain, {
        enabled: true,
        backend: 'resend',
        api_key: 're_live_key',
        from_email: 'hi@shop.mysapo.net',
        delay_days: 0,
        discount_code: 'REVIEW5',
      });
      await prisma.catalogProduct.create({ data: { shopId, productId: '95252031', handle: 'tom-kho', title: 'Tôm khô 500g' } });
      await prisma.customerPurchase.create({ data: { shopId, orderId: '77001', purchasedAt: Date.now() } });
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder());

      const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        calls.push({ url: String(input), headers, body: String(init?.body ?? '') });
        return Response.json({ id: 'email_1' });
      });

      const totals = await service.processDue(new Date(Date.now() + 10_000));
      const row = await prisma.reviewRequestEmail.findFirst({ where: { shopId } });
      vi.restoreAllMocks();
      return { shopId, totals, status: String(row?.status), sentAt: row?.sentAt ?? null, attempts: row?.attempts ?? null, calls };
    });

    expect(outcome.totals).toMatchObject({ attempted: 1, sent: 1, failed: 0, cancelled: 0, retries: 0 });
    expect(outcome.status).toBe('sent');
    expect(outcome.sentAt).toBeTruthy();
    expect(outcome.attempts).toBe(1);
    expect(outcome.calls).toHaveLength(1);
    expect(outcome.calls[0].url).toBe('https://api.resend.com/emails');
    expect(outcome.calls[0].headers.Authorization).toBe('Bearer re_live_key');

    const body = JSON.parse(outcome.calls[0].body) as { from: string; to: string[]; subject: string; html: string; text: string };
    expect(body.to).toEqual(['khach@example.com']);
    expect(body.from).toBe('hi@shop.mysapo.net');
    expect(body.subject).toContain('kaizen-');
    expect(body.html).toContain('/products/tom-kho?f1genz_review_token=rr1.77001.');
    expect(body.html).toContain('/products/95252099?f1genz_review_token=rr1.77001.');
    expect(body.html).toContain('<strong>REVIEW5</strong>');
    expect(body.text).toContain('- Tôm khô 500g:');

    const token = /rr1\.77001\.[a-f0-9]{64}/.exec(body.html)?.[0];
    expect(token).toBeTruthy();
    const signer = createReviewTokenSigner(appEnv.DATA_ENCRYPTION_KEY);
    expect(signer.verify(outcome.shopId, token as string, '95252031')).toBe('77001');
  });

  it('retries with exponential backoff and fails at max attempts', async () => {
    const seen = await withShop(async ({ shopId, storeDomain, prisma, service }) => {
      await service.updateReviewRequestConfig(storeDomain, { enabled: true, backend: 'resend', api_key: 're_k', from_email: 'hi@x.mysapo.net', delay_days: 0 });
      await prisma.customerPurchase.create({ data: { shopId, orderId: '77001' } });
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder());
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        throw new Error('connect timeout 5s');
      });

      const base = Date.now();
      const results: string[] = [];
      let lastError = '';
      for (const offset of [10_000, 70_000, 190_000, 430_000]) {
        const totals = await service.processDue(new Date(base + offset));
        expect(totals.attempted).toBe(1);
        const row = await prisma.reviewRequestEmail.findFirst({ where: { shopId } });
        results.push(`${row?.status}:${row?.attempts}`);
        lastError = String(row?.lastError ?? '');
      }
      vi.restoreAllMocks();
      return { results, lastError };
    });
    expect(seen.results).toEqual(['queued:1', 'queued:2', 'queued:3', 'failed:4']);
    expect(seen.lastError).toContain('connect timeout 5s');
  });

  it('cancels when the purchase is refunded or missing at send time', async () => {
    const totals1 = await withShop(async ({ shopId, storeDomain, prisma, service }) => {
      await service.updateReviewRequestConfig(storeDomain, { enabled: true, backend: 'resend', api_key: 're_k', from_email: 'hi@x.mysapo.net', delay_days: 0 });
      await prisma.customerPurchase.create({ data: { shopId, orderId: '77001', refundedAt: Date.now() } });
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder());
      return service.processDue(new Date(Date.now() + 1000));
    });
    expect(totals1.cancelled).toBe(1);

    const totals2 = await withShop(async ({ shopId, storeDomain, prisma, service }) => {
      await service.updateReviewRequestConfig(storeDomain, { enabled: true, backend: 'resend', api_key: 're_k', from_email: 'hi@x.mysapo.net', delay_days: 0 });
      await prisma.customerPurchase.create({ data: { shopId, orderId: '77001' } });
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder());
      await prisma.customerPurchase.deleteMany({ where: { shopId } });
      return service.processDue(new Date(Date.now() + 1000));
    });
    expect(totals2.cancelled).toBe(1);
  });

  it('cancels rows when the shop disables the feature before send', async () => {
    const outcome = await withShop(async ({ shopId, storeDomain, prisma, service }) => {
      await service.updateReviewRequestConfig(storeDomain, { enabled: true, delay_days: 0 });
      await prisma.customerPurchase.create({ data: { shopId, orderId: '77001' } });
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder());
      await service.updateReviewRequestConfig(storeDomain, { enabled: false });
      const totals = await service.processDue(new Date(Date.now() + 1000));
      const row = await prisma.reviewRequestEmail.findFirst({ where: { shopId } });
      return { totals, lastError: String(row?.lastError ?? '') };
    });
    expect(outcome.totals.cancelled).toBe(1);
    expect(outcome.lastError).toBe('disabled before send');
  });

  it('fails without retry when the backend is misconfigured', async () => {
    const outcome = await withShop(async ({ shopId, storeDomain, prisma, service }) => {
      await service.updateReviewRequestConfig(storeDomain, { enabled: true, backend: 'resend', from_email: 'hi@x.mysapo.net', delay_days: 0 });
      await prisma.customerPurchase.create({ data: { shopId, orderId: '77001' } });
      await service.detectOrderFulfilled(shopId, storeDomain, fulfilledOrder());
      const totals = await service.processDue(new Date(Date.now() + 1000));
      const row = await prisma.reviewRequestEmail.findFirst({ where: { shopId } });
      return { totals, status: String(row?.status), lastError: String(row?.lastError ?? ''), attempts: row?.attempts ?? null };
    });
    expect(outcome.totals.failed).toBe(1);
    expect(outcome.status).toBe('failed');
    expect(outcome.lastError).toBe('email backend not configured');
    expect(outcome.attempts).toBe(1);
  });

  it('purges only terminal rows older than 30 days', async () => {
    const outcome = await withShop(async ({ shopId, storeDomain, prisma, service }) => {
      const old = new Date(Date.now() - 31 * 86_400_000);
      await prisma.reviewRequestEmail.create({ data: { shopId, storeDomain, orderId: 'o-old-sent', customerEmail: 'a@b.c', status: 'sent', updatedAt: old } });
      await prisma.reviewRequestEmail.create({ data: { shopId, storeDomain, orderId: 'o-old-queued', customerEmail: 'a@b.c', status: 'queued', updatedAt: old } });
      await prisma.reviewRequestEmail.create({ data: { shopId, storeDomain, orderId: 'o-fresh-failed', customerEmail: 'a@b.c', status: 'failed' } });
      const purged = await service.purgeTerminal();
      const remaining = await prisma.reviewRequestEmail.count({ where: { shopId } });
      return { deleted: purged.deleted, remaining };
    });
    expect(outcome.deleted).toBe(1);
    expect(outcome.remaining).toBe(2);
  });
});
