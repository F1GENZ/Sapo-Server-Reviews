import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { normalizeShopDomain } from './shop-domain.service';

export type SubscriptionSnapshotData = {
  storeDomain?: string;
  domain?: string;
  subscriptionId?: string;
  payloadHash: string;
  status: string;
  plan: string;
  isActive: boolean;
  isPaid: boolean;
  expiresAt?: Date;
  payload: Record<string, unknown>;
};

type SnapshotLookupInput = {
  storeDomain?: string;
  domain?: string;
  subscriptionId?: string;
  payloadHash?: string;
};

const INSTALL_STATUSES = new Set(['active', 'canceled', 'expired', 'declined']);

const asString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

const firstPresent = (...values: unknown[]): unknown =>
  values.find((value) => value !== undefined && value !== null && value !== '');

const parseDate = (value: unknown): Date | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number'
    ? new Date(value > 1_000_000_000_000 ? value : value * 1000)
    : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const normalizeStatus = (value: unknown): string => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'cancelled') return 'canceled';
  if (raw === 'inactive' || raw === 'unactive') return 'canceled';
  return raw || 'unknown';
};

export const installStatusFromSnapshot = (snapshot: SubscriptionSnapshotData): string => {
  if (snapshot.isActive) return 'active';
  return INSTALL_STATUSES.has(snapshot.status) ? snapshot.status : 'free';
};

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma?: PrismaService,
  ) {}

  buildSnapshot(payload: Record<string, unknown>, hints: { storeDomain?: string; domain?: string } = {}): SubscriptionSnapshotData {
    const nested = (payload.app_subscription || payload.subscription || payload) as Record<string, unknown>;
    const status = normalizeStatus(firstPresent(nested.status, nested.state, nested.subscription_status));
    const expiresAt = parseDate(
      firstPresent(nested.expires_at, nested.expired_at, nested.ends_at, nested.current_period_end, nested.billing_on),
    );
    const canceledAt = firstPresent(nested.canceled_at, nested.cancelled_at);
    const isActive = ['active', 'accepted', 'approved'].includes(status) && !canceledAt && (!expiresAt || expiresAt.getTime() > Date.now());
    const amountSource = firstPresent(nested.amount_paid, nested.total, nested.price, '0');
    const amount = Number(String(amountSource).replace(/[^\d.-]/g, '')) || 0;
    const planText = String(firstPresent(nested.plan, nested.plan_name, nested.name, '')).toLowerCase();
    const isPaid = isActive && (amount > 0 || /\b(pro|paid|premium|business|monthly|annual|yearly)\b/.test(planText));
    const payloadHash = createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');
    const normalizedDomain = normalizeShopDomain(firstPresent(hints.domain, nested.domain, nested.shop_domain));
    const subscriptionId = asString(firstPresent(nested.id, nested.subscription_id));

    return {
      ...(hints.storeDomain || asString(nested.storeDomain) ? { storeDomain: hints.storeDomain || asString(nested.storeDomain) || undefined } : {}),
      ...(normalizedDomain ? { domain: normalizedDomain } : {}),
      ...(subscriptionId ? { subscriptionId } : {}),
      payloadHash,
      status: isActive ? 'active' : status,
      plan: isPaid ? 'Pro' : isActive ? 'Trial' : 'Free',
      isActive,
      isPaid,
      ...(expiresAt ? { expiresAt } : {}),
      payload,
    };
  }

  correlationKey(snapshot: SubscriptionSnapshotData): string {
    return snapshot.storeDomain
      ? `storeDomain:${snapshot.storeDomain}`
      : snapshot.domain
        ? `domain:${snapshot.domain}`
        : snapshot.subscriptionId
          ? `subscription:${snapshot.subscriptionId}`
          : `payload:${snapshot.payloadHash}`;
  }

  lookupKeys(input: SnapshotLookupInput): string[] {
    return [
      input.storeDomain ? `storeDomain:${input.storeDomain}` : null,
      input.domain ? `domain:${normalizeShopDomain(input.domain)}` : null,
      input.subscriptionId ? `subscription:${input.subscriptionId}` : null,
      input.payloadHash ? `payload:${input.payloadHash}` : null,
    ].filter(Boolean) as string[];
  }

  private fromStoredSnapshot(stored: {
    storeDomain?: string | null;
    domain?: string | null;
    subscriptionId?: string | null;
    payloadHash: string;
    status: string;
    plan: string;
    isActive: boolean;
    isPaid: boolean;
    expiresAt?: Date | null;
    payload?: unknown;
  }): SubscriptionSnapshotData {
    return {
      storeDomain: stored.storeDomain || undefined,
      domain: stored.domain || undefined,
      subscriptionId: stored.subscriptionId || undefined,
      payloadHash: stored.payloadHash,
      status: stored.status,
      plan: stored.plan,
      isActive: stored.isActive,
      isPaid: stored.isPaid,
      expiresAt: stored.expiresAt || undefined,
      payload: (stored.payload || {}) as Record<string, unknown>,
    };
  }

  async saveSnapshot(snapshot: SubscriptionSnapshotData): Promise<void> {
    const correlationKey = this.correlationKey(snapshot);
    const cacheKeys = new Set([correlationKey, ...this.lookupKeys(snapshot)]);
    for (const key of cacheKeys) {
      await this.redis.set(`subscription:${key}`, snapshot);
    }
    await this.prisma?.subscriptionSnapshot.upsert({
      where: { correlationKey },
      create: {
        correlationKey,
        storeDomain: snapshot.storeDomain,
        domain: snapshot.domain,
        subscriptionId: snapshot.subscriptionId,
        payloadHash: snapshot.payloadHash,
        status: snapshot.status,
        plan: snapshot.plan,
        isActive: snapshot.isActive,
        isPaid: snapshot.isPaid,
        expiresAt: snapshot.expiresAt,
        syncedAt: new Date(),
        payload: snapshot.payload,
      },
      update: {
        storeDomain: snapshot.storeDomain,
        domain: snapshot.domain,
        subscriptionId: snapshot.subscriptionId,
        payloadHash: snapshot.payloadHash,
        status: snapshot.status,
        plan: snapshot.plan,
        isActive: snapshot.isActive,
        isPaid: snapshot.isPaid,
        expiresAt: snapshot.expiresAt,
        syncedAt: new Date(),
        payload: snapshot.payload,
      },
    });
  }

  async findBestSnapshot(input: SnapshotLookupInput): Promise<SubscriptionSnapshotData | null> {
    const keys = this.lookupKeys(input);
    for (const key of keys) {
      const cached = await this.redis.get<SubscriptionSnapshotData>(`subscription:${key}`);
      if (cached) return cached;
      const storedByKey = await this.prisma?.subscriptionSnapshot.findUnique({ where: { correlationKey: key } });
      if (storedByKey) return this.fromStoredSnapshot(storedByKey);
    }

    const where: Array<Record<string, string>> = [];
    if (input.storeDomain) where.push({ storeDomain: input.storeDomain });
    if (input.domain) where.push({ domain: normalizeShopDomain(input.domain) });
    if (input.subscriptionId) where.push({ subscriptionId: input.subscriptionId });
    if (input.payloadHash) where.push({ payloadHash: input.payloadHash });
    if (!where.length) return null;
    const stored = await this.prisma?.subscriptionSnapshot.findFirst({
      where: { OR: where },
      orderBy: { syncedAt: 'desc' },
    });
    return stored ? this.fromStoredSnapshot(stored) : null;
  }

  async deleteSnapshotLookups(input: SnapshotLookupInput): Promise<number> {
    const keys = this.lookupKeys(input).map((key) => `subscription:${key}`);
    return this.redis.delMany(keys);
  }

  async tombstoneSnapshots(input: SnapshotLookupInput): Promise<number> {
    await this.deleteSnapshotLookups(input);
    if (!this.prisma) return 0;
    const where: Array<Record<string, string>> = [];
    if (input.storeDomain) where.push({ storeDomain: input.storeDomain });
    if (input.domain) where.push({ domain: normalizeShopDomain(input.domain) });
    if (input.subscriptionId) where.push({ subscriptionId: input.subscriptionId });
    if (input.payloadHash) where.push({ payloadHash: input.payloadHash });
    if (!where.length) return 0;
    const result = await this.prisma.subscriptionSnapshot.updateMany({
      where: { OR: where },
      data: { status: 'uninstalled', plan: 'Free', isActive: false, isPaid: false, syncedAt: new Date() },
    });
    return result.count || 0;
  }

  async applySnapshotToInstall(snapshot: SubscriptionSnapshotData): Promise<{ updated: boolean; storeDomain?: string }> {
    if (!this.prisma) return { updated: false };
    let storeDomain = snapshot.storeDomain;
    if (!storeDomain && snapshot.domain) {
      const domain = await this.prisma.shopDomain.findFirst({
        where: { domain: normalizeShopDomain(snapshot.domain), active: true },
        select: { storeDomain: true },
      });
      storeDomain = domain?.storeDomain || undefined;
    }
    if (!storeDomain && snapshot.subscriptionId) {
      const install = await this.prisma.appInstall.findFirst({
        where: { subscriptionId: snapshot.subscriptionId },
        select: { storeDomain: true },
      });
      storeDomain = install?.storeDomain || undefined;
    }
    if (!storeDomain) return { updated: false };

    const result = await this.prisma.appInstall.updateMany({
      where: { storeDomain, status: { not: 'uninstalled' } },
      data: {
        status: installStatusFromSnapshot(snapshot),
        plan: snapshot.plan,
        subscriptionId: snapshot.subscriptionId,
        subscriptionStatus: snapshot.status,
        expiresAt: snapshot.expiresAt,
      },
    });
    return { updated: result.count > 0, storeDomain };
  }
}
