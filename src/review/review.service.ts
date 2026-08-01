import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SapoApiService } from '../sapo/sapo-api.service';
import { ReviewProductStoreService } from './review-product-store.service';
import { CatalogProductStoreService } from '../catalog/catalog-product-store.service';
import { PurchaseStoreService } from '../purchase/purchase-store.service';
import type { Review, RatingSummary, MediaItem } from './interfaces/review.interface';
import type { SpamConfig } from './interfaces/spam-config.interface';
import { DEFAULT_SPAM_CONFIG } from './interfaces/spam-config.interface';
import type { WidgetConfig } from './interfaces/widget-config.interface';
import { DEFAULT_WIDGET_CONFIG } from './interfaces/widget-config.interface';
import type { CreateReviewDto } from './dto/create-review.dto';
import type { UpdateReviewDto } from './dto/update-review.dto';
import type { UpdateWidgetConfigDto } from './dto/update-widget-config.dto';
import type { UpdateSpamConfigDto } from './dto/update-spam-config.dto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCK_TTL = 30;
const LOCK_MAX_RETRIES = 4;
const LOCK_BASE_DELAY = 500;
const METAFIELD_NAMESPACE = 'f1genz_reviews';
const METAFIELD_KEY = 'public_summary';
const WIDGET_CONFIG_METADATA_KEY = 'reviewWidgetConfig';
const SPAM_CONFIG_METADATA_KEY = 'reviewSpamConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AllReviewsSort = 'newest' | 'oldest';
export type AllReviewsStatus =
  | 'all'
  | 'approved'
  | 'pending'
  | 'hidden'
  | 'spam'
  | 'unreplied';

export type ReviewListItem = Review & {
  productId: string;
  productTitle?: string;
  productName?: string;
  productHandle?: string;
  productImage?: string;
};

export type AllReviewsPage = {
  items: ReviewListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: Record<AllReviewsStatus, number>;
};

export type ListAllReviewsOptions = {
  page?: number;
  limit?: number;
  status?: string;
  sort?: string;
  productId?: string;
  search?: string;
};

export type PublicReviewsOptions = {
  page?: number;
  limit?: number;
  sort?: string;
};

export type ProductStats = {
  total: number;
  avgRating: number;
  approved: number;
  pending: number;
  hidden: number;
  spam: number;
  summary: RatingSummary;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateId = (): string => randomUUID();

const EMPTY_STATUS_COUNTS = (): Record<AllReviewsStatus, number> => ({
  all: 0,
  approved: 0,
  pending: 0,
  hidden: 0,
  spam: 0,
  unreplied: 0,
});

const EMPTY_SUMMARY = (): RatingSummary => ({
  avg: 0,
  count: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
});

const toMedia = (value: unknown): MediaItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is { url: unknown; type: unknown } =>
        item !== null && typeof item === 'object',
    )
    .map((item) => ({
      url: typeof item.url === 'string' ? item.url : '',
      type: item.type === 'video' ? ('video' as const) : ('image' as const),
    }))
    .filter((item) => item.url && /^https:\/\//i.test(item.url));
};

const toNum = (value: unknown): number => {
  if (typeof value === 'bigint') return Number(value);
  if (value && typeof value === 'object' && typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
};

/** Convert a Prisma row to domain Review type */
const toDomainReview = (row: {
  reviewId: string;
  rating: number;
  content: string;
  author: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  media: unknown;
  status: string;
  verified: boolean;
  pinned: boolean;
  reply: string | null;
  repliedAt: bigint | null;
  sourceRawJson: string | null;
  productId?: string;
  productTitle?: string | null;
  productName?: string | null;
  productHandle?: string | null;
  productImage?: string | null;
  createdAt?: bigint | unknown;
  updatedAt?: bigint | unknown;
}): Review => ({
  id: row.reviewId,
  rating: row.rating,
  content: row.content,
  author: row.author,
  email: row.email || undefined,
  phone: row.phone || undefined,
  title: row.title || undefined,
  media: toMedia(row.media),
  status: row.status as Review['status'],
  verified: row.verified,
  pinned: row.pinned,
  reply: row.reply || undefined,
  replied_at: row.repliedAt ? Number(row.repliedAt) : undefined,
  source_raw_json: row.sourceRawJson || undefined,
  created_at: toNum(row.createdAt),
  updated_at: toNum(row.updatedAt),
});

/** Convert a Prisma row to a public Review shape with no contact PII (email/phone). */
export const toPublicReview = (row: Parameters<typeof toDomainReview>[0]): Review => {
  const review = toDomainReview(row);
  delete review.email;
  delete review.phone;
  return review;
};

/** Convert a Prisma row to ReviewListItem (includes product metadata) */
const toReviewListItem = (row: {
  reviewId: string;
  rating: number;
  content: string;
  author: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  media: unknown;
  status: string;
  verified: boolean;
  pinned: boolean;
  reply: string | null;
  repliedAt: bigint | null;
  sourceRawJson: string | null;
  productId: string;
  productTitle: string | null;
  productName: string | null;
  productHandle: string | null;
  productImage: string | null;
  createdAt?: bigint | unknown;
  updatedAt?: bigint | unknown;
}): ReviewListItem => ({
  ...toDomainReview(row),
  productId: row.productId,
  productTitle: row.productTitle || row.productName || undefined,
  productName: row.productName || row.productTitle || undefined,
  productHandle: row.productHandle || undefined,
  productImage: row.productImage || undefined,
});

const isAllReviewsStatus = (value: unknown): value is AllReviewsStatus =>
  ['all', 'approved', 'pending', 'hidden', 'spam', 'unreplied'].includes(String(value));

/** Basic spam detection using configurable rules (simplified D4 version) */
function detectSpam(
  content: string,
  author: string,
  cfg: SpamConfig,
  existingReviews: Array<{ author: string; content: string }>,
): Review['status'] {
  const lower = content.toLowerCase();

  // Check blocked words
  if (cfg.blockedWords.length > 0) {
    const found = cfg.blockedWords.some((word) =>
      lower.includes(word.toLowerCase()),
    );
    if (found) return 'spam';
  }

  // Check content length
  if (content.length > cfg.maxContentLength) return 'spam';

  // Check for duplicate content from same author
  const isDuplicate = existingReviews.some(
    (r) =>
      r.author.toLowerCase() === author.toLowerCase() &&
      r.content.toLowerCase() === lower,
  );
  if (isDuplicate) return 'spam';

  return 'pending';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly sapoApi: SapoApiService,
    private readonly reviewStore: ReviewProductStoreService,
    private readonly catalogStore: CatalogProductStoreService,
    private readonly purchaseStore: PurchaseStoreService,
  ) {}

  // ─── Redis Lock (F1) ─────────────────────────────────────────────

  private lockKey(shopId: string, productId: string): string {
    return `lock:review:${shopId}:${productId}`;
  }

  private async acquireLock(shopId: string, productId: string): Promise<string> {
    const token = randomUUID();
    const key = this.lockKey(shopId, productId);
    let attempts = 0;
    while (attempts < LOCK_MAX_RETRIES) {
      const ok = await this.redis.setNx(key, token, LOCK_TTL);
      if (ok) return token;
      attempts++;
      await new Promise((r) =>
        setTimeout(r, LOCK_BASE_DELAY * Math.pow(2, attempts)),
      );
    }
    throw new ConflictException('Could not acquire review write lock');
  }

  private async releaseLock(shopId: string, productId: string, token: string): Promise<void> {
    const key = this.lockKey(shopId, productId);
    const current = await this.redis.get<string>(key);
    if (current === token) {
      await this.redis.del(key);
    }
  }

  // ─── Install Resolution ──────────────────────────────────────────

  private async resolveInstall(storeDomain: string): Promise<{ shopId: string; metadata: unknown }> {
    const install = await this.prisma.appInstall.findUnique({
      where: { storeDomain },
      select: { shopId: true, metadata: true },
    });
    if (!install) {
      throw new ConflictException('App not installed for this store');
    }
    return install;
  }

  // ─── Metafield Sync (D4: public_summary only) ────────────────────

  /**
   * Write the public_summary metafield for a product.
   * D4: The ONLY metafield written is public_summary with value_type "string".
   */
  private async syncPublicSummary(
    storeDomain: string,
    accessToken: string,
    productId: string,
  ): Promise<void> {
    try {
      const install = await this.prisma.appInstall.findUnique({
        where: { storeDomain },
        select: { shopId: true },
      });
      if (!install) return;

      const summary = await this.reviewStore.calculatePublicSummary(install.shopId, productId);
      const jsonValue = JSON.stringify({
        avg: summary.avg,
        count: summary.count,
        distribution: summary.distribution,
      });

      const metafields = await this.sapoApi.getProductMetafields(
        storeDomain,
        accessToken,
        productId,
        METAFIELD_NAMESPACE,
      );

      const existing = metafields.find(
        (m) => m.namespace === METAFIELD_NAMESPACE && m.key === METAFIELD_KEY,
      );

      if (existing?.id) {
        await this.sapoApi.updateProductMetafield(
          storeDomain,
          accessToken,
          productId,
          String(existing.id),
          { value: jsonValue, value_type: 'string' },
        );
      } else {
        await this.sapoApi.createProductMetafield(storeDomain, accessToken, productId, {
          namespace: METAFIELD_NAMESPACE,
          key: METAFIELD_KEY,
          value: jsonValue,
          value_type: 'string',
        });
      }
    } catch (err) {
      this.logger.warn(
        `syncPublicSummary failed for product ${productId}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  /** Admin-triggered metafield sync for all products or a specific one */
  async syncPublicSummaryMetafield(
    token: string,
    storeDomain: string,
    productId?: string,
  ): Promise<{ synced: number }> {
    if (productId) {
      await this.syncPublicSummary(storeDomain, token, productId);
      return { synced: 1 };
    }

    // Sync all products that have reviews
    const install = await this.resolveInstall(storeDomain);
    const allReviews = await this.reviewStore.getAllReviews(install.shopId, { size: 5000 });
    const productIds = [...new Set(allReviews.items.map((r) => r.productId))];
    let synced = 0;
    for (const pid of productIds) {
      await this.syncPublicSummary(storeDomain, token, pid);
      synced++;
    }
    return { synced };
  }

  // ─── addReview (called by admin + public controllers) ────────────

  async addReview(
    token: string,
    storeDomain: string,
    productId: string,
    dto: CreateReviewDto,
  ): Promise<Review> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const lockToken = await this.acquireLock(shopId, productId);
    try {
      const existingRows = await this.reviewStore.getReviews(shopId, productId, { size: 100 });
      const spamCfg = await this.getSpamConfig(token, storeDomain);
      const status = dto.status ?? detectSpam(
        dto.content || '',
        dto.author,
        spamCfg,
        existingRows.items.map((r) => ({ author: r.author, content: r.content })),
      );

      const now = Date.now();
      const reviewId = generateId();

      await this.reviewStore.upsertReview({
        shopId,
        productId,
        reviewId,
        rating: dto.rating,
        content: dto.content || '',
        author: dto.author,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        title: dto.title ?? null,
        media: Array.isArray(dto.media) && dto.media.length ? dto.media : null,
        status,
        verified: dto.verified ?? false,
        pinned: dto.pinned ?? false,
        createdAt: dto.created_at ?? now,
      });

      await this.syncPublicSummary(storeDomain, token, productId);

      return {
        id: reviewId,
        rating: dto.rating,
        content: dto.content || '',
        author: dto.author,
        email: dto.email,
        phone: dto.phone,
        title: dto.title,
        media: (dto.media || []) as MediaItem[],
        status,
        verified: dto.verified,
        pinned: dto.pinned,
        created_at: dto.created_at ?? now,
        updated_at: now,
      };
    } finally {
      await this.releaseLock(shopId, productId, lockToken);
    }
  }

  // ─── editReview ──────────────────────────────────────────────────

  async editReview(
    token: string,
    storeDomain: string,
    productId: string,
    reviewId: string,
    dto: UpdateReviewDto,
  ): Promise<Review | null> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const lockToken = await this.acquireLock(shopId, productId);
    try {
      const existing = await this.reviewStore.getReview(shopId, productId, reviewId);
      if (!existing) return null;

      await this.reviewStore.upsertReview({
        shopId,
        productId,
        reviewId,
        rating: dto.rating !== undefined ? dto.rating : existing.rating,
        content: dto.content !== undefined ? dto.content : existing.content,
        author: dto.author !== undefined ? dto.author : existing.author,
        email: dto.email !== undefined ? dto.email : existing.email,
        phone: dto.phone !== undefined ? dto.phone : existing.phone,
        title: dto.title !== undefined ? dto.title : existing.title,
        media: dto.media !== undefined
          ? (Array.isArray(dto.media) && dto.media.length ? dto.media : null)
          : existing.media,
        status: dto.status !== undefined ? dto.status : existing.status,
        verified: dto.verified !== undefined ? dto.verified : existing.verified,
        pinned: dto.pinned !== undefined ? dto.pinned : existing.pinned,
        reply: existing.reply,
        repliedAt: existing.repliedAt ? Number(existing.repliedAt) : null,
        sourceRawJson: existing.sourceRawJson,
        createdAt: dto.created_at !== undefined ? dto.created_at : toNum(existing.createdAt),
      });

      await this.syncPublicSummary(storeDomain, token, productId);

      const updated = await this.reviewStore.getReview(shopId, productId, reviewId);
      return updated ? toDomainReview(updated) : toDomainReview(existing);
    } finally {
      await this.releaseLock(shopId, productId, lockToken);
    }
  }

  // ─── updateReviewStatus ──────────────────────────────────────────

  async updateReviewStatus(
    token: string,
    storeDomain: string,
    productId: string,
    reviewId: string,
    status: 'approved' | 'pending' | 'hidden' | 'spam',
  ): Promise<Review | null> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const lockToken = await this.acquireLock(shopId, productId);
    try {
      const existing = await this.reviewStore.getReview(shopId, productId, reviewId);
      if (!existing) return null;

      await this.reviewStore.updateStatus(shopId, productId, reviewId, status);
      await this.syncPublicSummary(storeDomain, token, productId);

      return toDomainReview({ ...existing, status });
    } finally {
      await this.releaseLock(shopId, productId, lockToken);
    }
  }

  // ─── replyToReview ───────────────────────────────────────────────

  async replyToReview(
    token: string,
    storeDomain: string,
    productId: string,
    reviewId: string,
    reply: string,
  ): Promise<Review | null> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const lockToken = await this.acquireLock(shopId, productId);
    try {
      const existing = await this.reviewStore.getReview(shopId, productId, reviewId);
      if (!existing) return null;

      const now = Date.now();
      await this.reviewStore.upsertReview({
        shopId,
        productId,
        reviewId,
        rating: existing.rating,
        content: existing.content,
        author: existing.author,
        email: existing.email,
        phone: existing.phone,
        title: existing.title,
        media: existing.media,
        status: existing.status,
        verified: existing.verified,
        pinned: existing.pinned,
        reply,
        repliedAt: now,
        sourceRawJson: existing.sourceRawJson,
      });

      await this.syncPublicSummary(storeDomain, token, productId);
      return toDomainReview({ ...existing, reply, repliedAt: BigInt(now) });
    } finally {
      await this.releaseLock(shopId, productId, lockToken);
    }
  }

  // ─── pinReview (toggles pinned state) ────────────────────────────

  async pinReview(
    token: string,
    storeDomain: string,
    productId: string,
    reviewId: string,
    pinned?: boolean,
  ): Promise<Review | null> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const lockToken = await this.acquireLock(shopId, productId);
    try {
      const existing = await this.reviewStore.getReview(shopId, productId, reviewId);
      if (!existing) return null;

      const newPinned = pinned !== undefined ? pinned : !existing.pinned;

      await this.reviewStore.upsertReview({
        shopId,
        productId,
        reviewId,
        rating: existing.rating,
        content: existing.content,
        author: existing.author,
        email: existing.email,
        phone: existing.phone,
        title: existing.title,
        media: existing.media,
        status: existing.status,
        verified: existing.verified,
        pinned: newPinned,
        reply: existing.reply,
        repliedAt: existing.repliedAt ? Number(existing.repliedAt) : null,
        sourceRawJson: existing.sourceRawJson,
      });

      return toDomainReview({ ...existing, pinned: newPinned });
    } finally {
      await this.releaseLock(shopId, productId, lockToken);
    }
  }

  // ─── getReviews (admin single product, returns plain array) ──────

  async getReviews(
    token: string,
    storeDomain: string,
    productId: string,
  ): Promise<Review[]> {
    const install = await this.resolveInstall(storeDomain);
    const rows = await this.reviewStore.getReviews(install.shopId, productId, { size: 500 });
    return rows.items.map((row) => toDomainReview(row));
  }

  // ─── getProductStats ─────────────────────────────────────────────

  async getProductStats(
    token: string,
    storeDomain: string,
    productId: string,
  ): Promise<ProductStats> {
    const install = await this.resolveInstall(storeDomain);
    const [summary, stats] = await Promise.all([
      this.reviewStore.calculatePublicSummary(install.shopId, productId),
      this.reviewStore.getStatsForProduct(install.shopId, productId),
    ]);

    return {
      total: stats.total,
      avgRating: stats.avgRating,
      approved: stats.approved,
      pending: stats.pending,
      hidden: stats.hidden,
      spam: stats.spam,
      summary,
    };
  }

  // ─── getPublicReviews (storefront) ───────────────────────────────

  async getPublicReviews(
    storeDomain: string,
    productId: string,
    options: PublicReviewsOptions = {},
  ): Promise<{ items: Review[]; total: number; page: number; pageSize: number }> {
    const install = await this.resolveInstall(storeDomain);
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      shopId: install.shopId,
      productId,
      status: 'approved',
    };

    const sortField = options.sort === 'oldest' ? 'createdAt' : 'createdAt';
    const sortDir = options.sort === 'oldest' ? 'asc' : 'desc';

    const [items, total] = await Promise.all([
      this.prisma.reviewProduct.findMany({
        where,
        orderBy: [{ pinned: 'desc' }, { [sortField]: sortDir as 'asc' | 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.reviewProduct.count({ where }),
    ]);

    return {
      items: (items as any[]).map((row: any) => toPublicReview(row)),
      total,
      page,
      pageSize,
    };
  }

  // ─── getPublicSummary (storefront) ───────────────────────────────

  async getPublicSummary(
    storeDomain: string,
    productId: string,
  ): Promise<RatingSummary> {
    const install = await this.resolveInstall(storeDomain);
    return this.reviewStore.calculatePublicSummary(install.shopId, productId);
  }

  // ─── getPublicWidgetConfig (storefront, no admin token) ────────

  async getPublicWidgetConfig(storeDomain: string): Promise<WidgetConfig> {
    return this.getWidgetConfig('', storeDomain);
  }

  // ─── getPublicSummaries (storefront batch) ──────────────────────

  async getPublicSummaries(
    storeDomain: string,
    productIds: string[],
  ): Promise<Record<string, RatingSummary>> {
    const install = await this.resolveInstall(storeDomain);
    const out: Record<string, RatingSummary> = {};
    const unique = [...new Set(productIds.filter(Boolean))].slice(0, 100);
    await Promise.all(unique.map(async (pid) => {
      try {
        out[pid] = await this.reviewStore.calculatePublicSummary(install.shopId, pid);
      } catch {
        out[pid] = EMPTY_SUMMARY();
      }
    }));
    return out;
  }

  // ─── checkPurchaseEligibility (storefront) ──────────────────────

  async checkPurchaseEligibility(
    storeDomain: string,
    productId: string,
    identity: { email?: string; phone?: string },
  ): Promise<{ eligible: boolean; reason: string }> {
    const install = await this.resolveInstall(storeDomain);
    const email = String(identity?.email || '').trim();
    const phone = String(identity?.phone || '').trim();
    if (!email && !phone) return { eligible: false, reason: 'missing_identity' };
    const eligible = await this.purchaseStore.hasPurchasedProduct(install.shopId, productId, { email, phone });
    return { eligible, reason: eligible ? 'verified' : 'not_purchased' };
  }

  // ─── listAllReviews (admin cross-product listing) ────────────────

  async listAllReviews(
    token: string,
    storeDomain: string,
    options: ListAllReviewsOptions = {},
  ): Promise<AllReviewsPage> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.limit ?? 20));
    const sortBy = options.sort === 'oldest' ? 'oldest' : 'newest';
    const status: AllReviewsStatus = isAllReviewsStatus(options.status)
      ? options.status
      : 'all';

    const where: Record<string, unknown> = { shopId };
    if (status === 'unreplied') {
      where.reply = null;
    } else if (status !== 'all') {
      where.status = status;
    }
    if (options.productId) {
      where.productId = options.productId;
    }
    if (options.search) {
      where.OR = [
        { content: { contains: options.search, mode: 'insensitive' } },
        { author: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    // Get status counts
    const allRows = await this.prisma.reviewProduct.findMany({
      where: { shopId },
      select: { status: true, reply: true },
    });
    const statusCounts = EMPTY_STATUS_COUNTS();
    for (const row of allRows) {
      statusCounts.all += 1;
      const s = row.status;
      if (s in statusCounts) {
        statusCounts[s as keyof typeof statusCounts] += 1;
      }
      if (!row.reply) statusCounts.unreplied += 1;
    }

    const total = await this.prisma.reviewProduct.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const skip = (currentPage - 1) * pageSize;

    const rows = await this.prisma.reviewProduct.findMany({
      where,
      orderBy: { createdAt: sortBy === 'oldest' ? 'asc' : 'desc' },
      skip,
      take: pageSize,
    });

    return {
      items: (rows as any[]).map((row: any) => toReviewListItem(row)),
      total,
      page: currentPage,
      pageSize,
      totalPages,
      statusCounts,
    };
  }

  // ─── Widget Config ───────────────────────────────────────────────

  async getWidgetConfig(token: string, storeDomain: string): Promise<WidgetConfig> {
    const install = await this.resolveInstall(storeDomain);
    const metadata = (install.metadata as Record<string, unknown>) || {};
    const saved = metadata[WIDGET_CONFIG_METADATA_KEY] as Partial<WidgetConfig> | undefined;
    return { ...DEFAULT_WIDGET_CONFIG, ...saved };
  }

  async updateWidgetConfig(
    token: string,
    dto: UpdateWidgetConfigDto,
    storeDomain: string,
  ): Promise<WidgetConfig> {
    const current = await this.getWidgetConfig(token, storeDomain);
    const merged = { ...current, ...dto };

    const install = await this.resolveInstall(storeDomain);
    const metadata = (install.metadata as Record<string, unknown>) || {};
    metadata[WIDGET_CONFIG_METADATA_KEY] = merged;

    await this.prisma.appInstall.update({
      where: { storeDomain },
      data: { metadata: metadata as any },
    });

    return merged;
  }

  // ─── Spam Config ─────────────────────────────────────────────────

  async getSpamConfig(token: string, storeDomain: string): Promise<SpamConfig> {
    const install = await this.resolveInstall(storeDomain);
    const metadata = (install.metadata as Record<string, unknown>) || {};
    const saved = metadata[SPAM_CONFIG_METADATA_KEY] as Partial<SpamConfig> | undefined;
    return { ...DEFAULT_SPAM_CONFIG, ...saved };
  }

  async updateSpamConfig(
    token: string,
    dto: UpdateSpamConfigDto,
    storeDomain: string,
  ): Promise<SpamConfig> {
    const current = await this.getSpamConfig(token, storeDomain);
    const merged = { ...current, ...dto };

    const install = await this.resolveInstall(storeDomain);
    const metadata = (install.metadata as Record<string, unknown>) || {};
    metadata[SPAM_CONFIG_METADATA_KEY] = merged;

    await this.prisma.appInstall.update({
      where: { storeDomain },
      data: { metadata: metadata as any },
    });

    return merged;
  }
}
