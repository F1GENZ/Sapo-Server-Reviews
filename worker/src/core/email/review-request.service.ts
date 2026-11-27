import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';
import { mergeInstallMetadataKey } from '../database/install-metadata';
import { PrismaService } from '../database/prisma.service';
import { TokenEncryptionService } from '../sapo/token-encryption.service';
import { resolveEmailSender } from './backends';
import { isRecord } from './type-guards';
import {
  DEFAULT_REVIEW_REQUEST_CONFIG,
  REVIEW_REQUEST_METADATA_KEY,
  maskReviewRequestConfig,
  mergeReviewRequestConfig,
  normalizeReviewRequestConfig,
  type ReviewRequestConfig,
  type ReviewRequestConfigUpdate,
} from './review-request-config';
import { createReviewTokenSigner } from './review-token';
import { escapeHtml, renderReviewRequestEmail } from './templates';

// Post-fulfillment review-request emails. Webhook order sync calls detectOrderFulfilled after every
// orders/* delivery; fulfilled orders enqueue one review_request_emails row per shop+order. The
// durability sweep calls processDue every minute, re-checks cancellation/refund state, renders the
// merchant template, and sends through the merchant-configured backend. Defaults are disabled, so
// existing shops see no behavior change until they configure the feature.

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_RETENTION_MS = 30 * DAY_MS;
const PROCESS_BATCH = 5;
const MAX_ATTEMPTS = 4;
const FULFILLED_STATUSES: Record<string, true> = { fulfilled: true, partial: true };
const TERMINATED_STATUSES: Record<string, true> = { cancelled: true, canceled: true, refunded: true };

const toText = (value: unknown): string => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim());
const normalizeStatus = (value: unknown): string => toText(value).toLowerCase().replace(/[\s-]+/g, '_');
const firstMessageLine = (error: unknown): string => (error instanceof Error ? error.message : String(error || 'unknown error')).split('\n')[0].slice(0, 500);

type DetectedOrder = {
  orderId: string;
  orderCode: string;
  email: string;
  customerName: string;
  productIds: string[];
  fulfillmentStatus: string;
  terminated: boolean;
};

type EmailRow = {
  id: string;
  shopId: string;
  storeDomain: string;
  orderId: string;
  orderCode?: string | null;
  customerEmail: string;
  customerName?: string | null;
  productIds?: unknown;
  status: string;
  attempts?: number;
  runAt?: Date;
};

const detectOrder = (order: Record<string, unknown>): DetectedOrder | null => {
  const source = isRecord(order.order) ? order.order : order;
  const orderId = toText(source.id || source.order_id || source.orderId);
  if (!orderId) return null;
  const customer = isRecord(source.customer) ? source.customer : null;
  const billing = isRecord(source.billing_address) ? source.billing_address : null;
  const email = toText(source.email).toLowerCase() || toText(customer?.email).toLowerCase() || toText(billing?.email).toLowerCase();
  const name =
    toText(source.customer_name) ||
    [toText(customer?.first_name), toText(customer?.last_name)].filter(Boolean).join(' ').trim() ||
    toText(customer?.name) ||
    toText(billing?.name);
  const fulfillmentStatus = normalizeStatus(source.fulfillment_status || source.fulfillmentStatus);
  const terminated =
    Boolean(source.cancelled_at || source.canceled_at || source.refunded_at) ||
    Object.hasOwn(TERMINATED_STATUSES, fulfillmentStatus);
  const lineItems = source.line_items || source.lineItems;
  const productIds = (Array.isArray(lineItems) ? lineItems : [])
    .filter(isRecord)
    .map((item) => toText(item.product_id || item.productId))
    .filter(Boolean)
    .filter((id, index, list) => list.indexOf(id) === index);
  return {
    orderId,
    orderCode: toText(source.order_number) || toText(source.name) || toText(source.order_code),
    email,
    customerName: name,
    productIds,
    fulfillmentStatus,
    terminated,
  };
};

@Injectable()
export class ReviewRequestService {
  private readonly logger = new Logger(ReviewRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  private seal(plain: string): string {
    return `enc:v1:${JSON.stringify(this.encryption.encrypt(plain))}`;
  }

  /** Opens the AES-GCM stored form; plaintext is accepted only for rows written before encryption was available. */
  private openSecret(stored: string): string {
    if (!stored) return '';
    if (!stored.startsWith('enc:v1:')) return stored;
    try {
      return this.encryption.decrypt(JSON.parse(stored.slice('enc:v1:'.length)));
    } catch {
      return '';
    }
  }

  private async readConfig(storeDomain: string): Promise<ReviewRequestConfig> {
    const install = await this.prisma.appInstall.findUnique({ where: { storeDomain }, select: { metadata: true } });
    const metadata = install?.metadata && typeof install.metadata === 'object' && !Array.isArray(install.metadata) ? (install.metadata as Record<string, unknown>) : {};
    return normalizeReviewRequestConfig(metadata[REVIEW_REQUEST_METADATA_KEY] ?? DEFAULT_REVIEW_REQUEST_CONFIG);
  }

  async getReviewRequestConfigMasked(storeDomain: string): Promise<Record<string, unknown>> {
    return maskReviewRequestConfig(await this.readConfig(storeDomain), (stored) => this.openSecret(stored) || null);
  }

  async updateReviewRequestConfig(storeDomain: string, dto: ReviewRequestConfigUpdate): Promise<Record<string, unknown>> {
    const install = await this.prisma.appInstall.findUnique({ where: { storeDomain }, select: { id: true } });
    if (!install) throw new BadRequestException('Unknown store');
    const current = await this.readConfig(storeDomain);
    const merged = mergeReviewRequestConfig(
      current,
      dto || {},
      (plain) => this.seal(plain),
      (message) => {
        throw new BadRequestException(message);
      },
    );
    const saved = await mergeInstallMetadataKey(this.prisma, storeDomain, REVIEW_REQUEST_METADATA_KEY, merged as unknown as Record<string, unknown>);
    return maskReviewRequestConfig(normalizeReviewRequestConfig(saved), (stored) => this.openSecret(stored) || null);
  }

  /** Called after every orders/* webhook purchase sync. Re-deliveries are idempotent by UNIQUE(shopId, orderId). */
  async detectOrderFulfilled(shopId: string, storeDomain: string, payloadOrder: Record<string, unknown>): Promise<void> {
    const detected = detectOrder(payloadOrder);
    if (!detected) return;
    if (!Object.hasOwn(FULFILLED_STATUSES, detected.fulfillmentStatus) || detected.terminated) {
      if (detected.terminated) {
        await this.prisma.reviewRequestEmail.updateMany({
          where: { shopId, orderId: detected.orderId, status: 'queued' },
          data: { status: 'cancelled', updatedAt: new Date() },
        });
      }
      return;
    }
    const config = await this.readConfig(storeDomain);
    if (!config.enabled || !detected.email) return;
    const now = new Date();
    try {
      await this.prisma.reviewRequestEmail.create({
        data: {
          shopId,
          storeDomain,
          orderId: detected.orderId,
          orderCode: detected.orderCode,
          customerEmail: detected.email,
          customerName: detected.customerName,
          productIds: detected.productIds,
          status: 'queued',
          attempts: 0,
          runAt: new Date(now.getTime() + config.delay_days * DAY_MS),
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (error) {
      // Unique(shopId, orderId) means this was a webhook re-delivery, not a real failure.
      this.logger.debug?.(`Review request already queued for order ${detected.orderId}: ${firstMessageLine(error)}`);
    }
  }

  private async markEmail(id: string, status: string, attempts: number, error: string | null, runAt?: Date): Promise<void> {
    await this.prisma.reviewRequestEmail.update({
      where: { id },
      data: {
        status,
        attempts,
        lastError: error,
        ...(runAt ? { runAt } : {}),
        ...(status === 'sent' ? { sentAt: new Date() } : {}),
        updatedAt: new Date(),
      },
    });
  }

  private async productInfos(shopId: string, productIds: string[]): Promise<Array<{ productId: string; handle: string; title: string }>> {
    if (!productIds.length) return [];
    const rows = await this.prisma.catalogProduct.findMany({
      where: { shopId, productId: { in: productIds } },
      select: { productId: true, handle: true, title: true },
    });
    const byId = new Map(rows.map((row) => [String(row.productId), row]));
    return productIds.map((productId) => {
      const row = byId.get(productId);
      return { productId, handle: toText(row?.handle), title: toText(row?.title) || `Sản phẩm #${productId}` };
    });
  }

  private async sendOne(row: EmailRow, now: Date): Promise<'sent' | 'cancelled' | 'failed' | 'retry'> {
    const purchases = await this.prisma.customerPurchase.findMany({
      where: { shopId: row.shopId, orderId: row.orderId },
      select: { cancelledAt: true, refundedAt: true },
    });
    const attempts = (row.attempts ?? 0) + 1;
    if (!purchases.length || purchases.every((purchase) => purchase.cancelledAt || purchase.refundedAt)) {
      await this.markEmail(row.id, 'cancelled', attempts, null);
      return 'cancelled';
    }

    const config = await this.readConfig(row.storeDomain);
    if (!config.enabled) {
      await this.markEmail(row.id, 'cancelled', attempts, 'disabled before send');
      return 'cancelled';
    }
    const sender = resolveEmailSender(config, (stored) => this.openSecret(stored), (input, init) => fetch(input, init));
    const domain = row.storeDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    if (!sender || !domain) {
      await this.markEmail(row.id, 'failed', attempts, !domain ? 'missing shop domain' : 'email backend not configured');
      return 'failed';
    }

    const productIds = Array.isArray(row.productIds) ? row.productIds.map(toText).filter(Boolean) : [];
    const signer = createReviewTokenSigner(this.env.DATA_ENCRYPTION_KEY);
    const origin = `https://${domain}`;
    const items = (await this.productInfos(row.shopId, productIds)).map((info) => {
      const token = signer.sign(row.shopId, row.orderId, info.productId);
      const path = info.handle ? `/products/${info.handle}` : `/products/${info.productId}`;
      const link = `${origin}${path}?f1genz_review_token=${encodeURIComponent(token)}&f1genz_write=1`;
      return { ...info, link };
    });
    const shopName = domain.split('.')[0] || domain;
    const productsHtml = items.map((item) => `<li><a href="${escapeHtml(item.link)}">${escapeHtml(item.title)}</a></li>`).join('\n');
    const rendered = renderReviewRequestEmail(
      { subject_tpl: config.subject_tpl, body_tpl: config.body_tpl, discount_code: config.discount_code },
      {
        customer_name: row.customerName || 'Quý khách',
        shop_name: shopName,
        products: productsHtml,
        review_link: items[0]?.link || origin,
      },
    );

    try {
      await sender.send({
        to: [row.customerEmail],
        from:
          config.backend === 'smtp'
            ? `${config.smtp?.from_name || shopName} <${config.smtp?.from_email || ''}>`
            : `${config.from_name || shopName} <${config.from_email}>`,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch (error) {
      if (attempts >= MAX_ATTEMPTS) {
        await this.markEmail(row.id, 'failed', attempts, firstMessageLine(error));
        return 'failed';
      }
      const backoffMs = Math.min(2 ** (attempts - 1), 60) * 60_000;
      await this.markEmail(row.id, 'queued', attempts, firstMessageLine(error), new Date(now.getTime() + backoffMs));
      return 'retry';
    }
    await this.markEmail(row.id, 'sent', attempts, null);
    return 'sent';
  }

  /** Sweep entry point: sends a bounded batch of due rows. Rows are independent; one failure never stops the batch. */
  async processDue(now = new Date()): Promise<{ attempted: number; sent: number; failed: number; cancelled: number; retries: number }> {
    const rows = await this.prisma.reviewRequestEmail.findMany({
      where: { status: 'queued', runAt: { lte: now } },
      orderBy: { runAt: 'asc' },
      take: PROCESS_BATCH,
    }) as EmailRow[];
    const totals = { attempted: 0, sent: 0, failed: 0, cancelled: 0, retries: 0 };
    for (const row of rows) {
      totals.attempted += 1;
      try {
        const result = await this.sendOne(row, now);
        if (result === 'sent') totals.sent += 1;
        else if (result === 'failed') totals.failed += 1;
        else if (result === 'cancelled') totals.cancelled += 1;
        else totals.retries += 1;
      } catch (error) {
        totals.failed += 1;
        this.logger.warn(`Review request email ${row.id} failed outside send: ${firstMessageLine(error)}`);
        await this.markEmail(row.id, 'failed', (row.attempts ?? 0) + 1, firstMessageLine(error)).catch(() => undefined);
      }
    }
    return totals;
  }

  /** Retention companion run by the sweep: terminal email rows are purged after 30 days. */
  async purgeTerminal(now = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now.getTime() - EMAIL_RETENTION_MS);
    const result = await this.prisma.reviewRequestEmail.deleteMany({
      where: { status: { in: ['sent', 'failed', 'cancelled'] }, updatedAt: { lt: cutoff } },
    });
    return { deleted: result.count };
  }
}
