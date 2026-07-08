import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';

export type CustomerPurchaseIdentity = {
  email?: string | null;
  phone?: string | null;
};

export type CustomerPurchaseOrderInput = {
  shopId: string;
  order: Record<string, unknown>;
};

type PurchaseRowInput = {
  shopId: string;
  productId: string;
  orderId: string;
  orderCode: string | null;
  emailHash: string | null;
  phoneHash: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  cancelledAt: bigint | null;
  refundedAt: bigint | null;
  purchasedAt: bigint;
  rawPayload: unknown;
};

type PurchaseStatusRow = {
  financialStatus?: string | null;
  fulfillmentStatus?: string | null;
  cancelledAt?: bigint | null;
  refundedAt?: bigint | null;
};

const ELIGIBLE_FINANCIAL_STATUSES = new Set(['paid', 'partially_paid']);
const ELIGIBLE_FULFILLMENT_STATUSES = new Set(['fulfilled', 'partial']);
const BLOCKED_FINANCIAL_STATUSES = new Set([
  'voided',
  'refunded',
  'partially_refunded',
  'cancelled',
  'canceled',
]);
const BLOCKED_FULFILLMENT_STATUSES = new Set(['cancelled', 'canceled']);

const toText = (value: unknown): string => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value).trim();
  }
  return '';
};

const toObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const toTimestamp = (value: unknown, fallback = Date.now()): bigint => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return BigInt(value > 10_000_000_000 ? value : value * 1000);
  }
  const text = toText(value);
  if (!text) return BigInt(fallback);
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) {
    return BigInt(numeric > 10_000_000_000 ? numeric : numeric * 1000);
  }
  const parsed = Date.parse(text);
  return BigInt(Number.isFinite(parsed) ? parsed : fallback);
};

const toNullableTimestamp = (value: unknown, fallback: number): bigint | null => {
  if (value == null) return null;
  return toTimestamp(value, fallback);
};

const normalizeEmail = (value: unknown): string => toText(value).toLowerCase();

const normalizePhone = (value: unknown): string => {
  const phone = toText(value).replace(/[\s\-().]/g, '');
  if (!phone) return '';
  if (phone.startsWith('+84')) return `0${phone.slice(3)}`;
  if (phone.startsWith('84')) return `0${phone.slice(2)}`;
  return phone;
};

const hashValue = (value: string): string | null =>
  value ? createHash('sha256').update(value).digest('hex') : null;

const normalizeStatus = (value: unknown): string =>
  toText(value).toLowerCase().replace(/[\s-]+/g, '_');

const hasTimestamp = (value: unknown): boolean => {
  if (typeof value === 'bigint') return value > 0n;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  return !!toText(value);
};

const nullIfEmpty = (value: string): string | null =>
  value ? value : null;

export function isEligiblePurchaseStatus(row: PurchaseStatusRow): boolean {
  if (hasTimestamp(row.cancelledAt) || hasTimestamp(row.refundedAt)) {
    return false;
  }

  const financialStatus = normalizeStatus(row.financialStatus);
  const fulfillmentStatus = normalizeStatus(row.fulfillmentStatus);

  if (
    BLOCKED_FINANCIAL_STATUSES.has(financialStatus) ||
    BLOCKED_FULFILLMENT_STATUSES.has(fulfillmentStatus)
  ) {
    return false;
  }

  return (
    ELIGIBLE_FINANCIAL_STATUSES.has(financialStatus) ||
    ELIGIBLE_FULFILLMENT_STATUSES.has(fulfillmentStatus)
  );
}

@Injectable()
export class PurchaseStoreService {
  private readonly logger = new Logger(PurchaseStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  async hasPurchasedProduct(
    shopId: string,
    productId: string,
    identity: CustomerPurchaseIdentity,
  ): Promise<boolean> {
    const emailHash = hashValue(normalizeEmail(identity.email));
    const phoneHash = hashValue(normalizePhone(identity.phone));
    if (!emailHash && !phoneHash) return false;

    const rows = await this.prisma.customerPurchase.findMany({
      where: {
        shopId,
        productId,
        ...((emailHash || phoneHash) && {
          OR: [
            ...(emailHash ? [{ emailHash }] : []),
            ...(phoneHash ? [{ phoneHash }] : []),
          ],
        }),
      },
      select: {
        financialStatus: true,
        fulfillmentStatus: true,
        cancelledAt: true,
        refundedAt: true,
      },
      take: 50,
    });

    return rows.some((row: PurchaseStatusRow) => isEligiblePurchaseStatus(row));
  }

  async syncOrder(input: CustomerPurchaseOrderInput): Promise<number> {
    const rows = this.normalizeOrder(input.shopId, input.order);
    if (!rows.length) return 0;
    await this.upsertRows(rows);
    return rows.length;
  }

  async getAudit(shopId: string): Promise<{
    total: number;
    orders: number;
    lastUpdated: number | null;
  }> {
    const [totalResult, orderRows, lastRow] = await Promise.all([
      this.prisma.customerPurchase.count({ where: { shopId } }),
      this.prisma.customerPurchase.findMany({
        where: { shopId },
        select: { orderId: true },
        distinct: ['orderId'],
      }),
      this.prisma.customerPurchase.findFirst({
        where: { shopId },
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return {
      total: totalResult,
      orders: orderRows.length,
      lastUpdated: lastRow?.updatedAt ? Number(lastRow.updatedAt) : null,
    };
  }

  normalizeOrder(shopId: string, order: Record<string, unknown>): PurchaseRowInput[] {
    const sourceOrder = toObject(order.order) || order;
    const orderId = toText(sourceOrder.id || sourceOrder.order_id || sourceOrder.orderId);
    if (!shopId || !orderId) return [];

    const email =
      normalizeEmail(sourceOrder.email) ||
      normalizeEmail(toObject(sourceOrder.customer)?.email) ||
      normalizeEmail(toObject(sourceOrder.billing_address)?.email);
    const phone =
      normalizePhone(sourceOrder.phone) ||
      normalizePhone(toObject(sourceOrder.customer)?.phone) ||
      normalizePhone(toObject(sourceOrder.billing_address)?.phone) ||
      normalizePhone(toObject(sourceOrder.shipping_address)?.phone);
    const emailHash = hashValue(email);
    const phoneHash = hashValue(phone);
    if (!emailHash && !phoneHash) return [];

    const purchasedAt = toTimestamp(
      sourceOrder.created_at || sourceOrder.createdAt || sourceOrder.processed_at,
    );
    const cancelledAt = sourceOrder.cancelled_at
      ? toNullableTimestamp(sourceOrder.cancelled_at, Number(purchasedAt))
      : null;
    const refundedAt = sourceOrder.refunded_at
      ? toNullableTimestamp(sourceOrder.refunded_at, Number(purchasedAt))
      : null;
    const financialStatus = normalizeStatus(
      sourceOrder.financial_status || sourceOrder.financialStatus,
    );
    const fulfillmentStatus = normalizeStatus(
      sourceOrder.fulfillment_status || sourceOrder.fulfillmentStatus,
    );
    const orderCode =
      toText(sourceOrder.order_number) ||
      toText(sourceOrder.name) ||
      toText(sourceOrder.order_code) ||
      null;

    return toArray(sourceOrder.line_items || sourceOrder.lineItems)
      .map((item) => toObject(item))
      .filter((item): item is Record<string, unknown> => !!item)
      .map((item) => toText(item.product_id || item.productId))
      .filter(Boolean)
      .filter((productId, index, list) => list.indexOf(productId) === index)
      .map((productId) => ({
        shopId,
        productId,
        orderId,
        orderCode,
        emailHash,
        phoneHash,
        financialStatus: nullIfEmpty(financialStatus),
        fulfillmentStatus: nullIfEmpty(fulfillmentStatus),
        cancelledAt,
        refundedAt,
        purchasedAt,
        rawPayload: sourceOrder,
      }));
  }

  private async upsertRows(rows: PurchaseRowInput[]): Promise<void> {
    try {
      await this.prisma.$transaction(
        rows.map((row) =>
          this.prisma.customerPurchase.upsert({
            where: {
              shopId_productId_orderId: {
                shopId: row.shopId,
                productId: row.productId,
                orderId: row.orderId,
              },
            },
            create: {
              shopId: row.shopId,
              productId: row.productId,
              orderId: row.orderId,
              orderCode: row.orderCode,
              emailHash: row.emailHash,
              phoneHash: row.phoneHash,
              financialStatus: row.financialStatus,
              fulfillmentStatus: row.fulfillmentStatus,
              cancelledAt: row.cancelledAt,
              refundedAt: row.refundedAt,
              purchasedAt: row.purchasedAt,
              rawPayload: row.rawPayload as any,
              createdAt: new Date(),
              updatedAt: BigInt(Date.now()),
            },
            update: {
              orderCode: row.orderCode,
              emailHash: row.emailHash,
              phoneHash: row.phoneHash,
              financialStatus: row.financialStatus,
              fulfillmentStatus: row.fulfillmentStatus,
              cancelledAt: row.cancelledAt,
              refundedAt: row.refundedAt,
              purchasedAt: row.purchasedAt,
              rawPayload: row.rawPayload as any,
              updatedAt: BigInt(Date.now()),
            },
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Customer purchase sync failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }
}
