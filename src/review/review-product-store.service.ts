import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RatingSummary } from './interfaces/review.interface';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewProductUpsertInput {
  shopId: string;
  productId: string;
  reviewId: string;
  rating: number;
  content: string;
  author: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  media?: unknown;
  status?: string;
  verified?: boolean;
  pinned?: boolean;
  reply?: string | null;
  repliedAt?: number | null;
  sourceRawJson?: string | null;
  createdAt?: number;
  productTitle?: string | null;
  productName?: string | null;
  productHandle?: string | null;
  productImage?: string | null;
}

export interface ReviewProduct {
  id: string;
  shopId: string;
  productId: string;
  productTitle: string | null;
  productName: string | null;
  productHandle: string | null;
  productImage: string | null;
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
  createdAt: bigint;
  updatedAt: bigint;
}

export interface ReviewPageOptions {
  status?: string;
  page?: number;
  size?: number;
  sort?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ProductStats {
  total: number;
  avgRating: number;
  approved: number;
  pending: number;
  hidden: number;
  spam: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_PAGE = 0;
const DEFAULT_SIZE = 20;
const MAX_SIZE = 100;

const normalizeInt = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const clampSize = (raw: unknown): number => {
  const n = normalizeInt(raw, DEFAULT_SIZE);
  return Math.max(1, Math.min(MAX_SIZE, n));
};

const clampPage = (raw: unknown): number => {
  return Math.max(0, normalizeInt(raw, DEFAULT_PAGE));
};

const buildOrderBy = (
  sort?: string,
): Record<string, 'asc' | 'desc'> => {
  if (!sort) return { createdAt: 'desc' };

  const [rawField, rawDir] = sort.split(',');
  const field = (rawField ?? '').trim();
  const direction = (rawDir ?? '').trim().toLowerCase() === 'asc' ? 'asc' : 'desc';

  switch (field) {
    case 'rating':
    case 'numberStar':
      return { rating: direction };
    case 'createdDate':
    case 'created_at':
      return { createdAt: direction };
    case 'updated_at':
    case 'lastModifiedDate':
      return { updatedAt: direction };
    default:
      return { createdAt: direction };
  }
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ReviewProductStoreService {
  private readonly logger = new Logger(ReviewProductStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -- Create / Update -------------------------------------------------------

  async upsertReview(input: ReviewProductUpsertInput): Promise<ReviewProduct> {
    const now = BigInt(Date.now());

    const data = {
      shopId: input.shopId,
      productId: input.productId,
      reviewId: input.reviewId,
      productTitle: input.productTitle ?? null,
      productName: input.productName ?? null,
      productHandle: input.productHandle ?? null,
      productImage: input.productImage ?? null,
      rating: input.rating,
      content: input.content,
      author: input.author,
      email: input.email ?? null,
      phone: input.phone ?? null,
      title: input.title ?? null,
      media: input.media ?? null,
      status: input.status || 'pending',
      verified: input.verified ?? false,
      pinned: input.pinned ?? false,
      reply: input.reply ?? null,
      repliedAt: input.repliedAt != null ? BigInt(input.repliedAt) : null,
      sourceRawJson: input.sourceRawJson ?? null,
      updatedAt: now,
    };

    return this.prisma.reviewProduct.upsert({
      where: {
        shopId_productId_reviewId: {
          shopId: input.shopId,
          productId: input.productId,
          reviewId: input.reviewId,
        },
      },
      create: {
        ...data,
        createdAt: input.createdAt ? BigInt(input.createdAt) : now,
      },
      update: data,
    });
  }

  // -- Get single ------------------------------------------------------------

  async getReview(
    shopId: string,
    productId: string,
    reviewId: string,
  ): Promise<ReviewProduct | null> {
    return this.prisma.reviewProduct.findUnique({
      where: {
        shopId_productId_reviewId: { shopId, productId, reviewId },
      },
    });
  }

  // -- List for a product (paginated) ----------------------------------------

  async getReviews(
    shopId: string,
    productId: string,
    options: ReviewPageOptions = {},
  ): Promise<PaginatedResult<ReviewProduct>> {
    const page = clampPage(options.page);
    const pageSize = clampSize(options.size);
    const skip = page * pageSize;

    const where: Record<string, unknown> = { shopId, productId };
    if (options.status) {
      where.status = options.status;
    }

    const orderBy = buildOrderBy(options.sort);

    const [items, total] = await Promise.all([
      this.prisma.reviewProduct.findMany({ where, orderBy, skip, take: pageSize }),
      this.prisma.reviewProduct.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  // -- List all reviews across products (admin dashboard) --------------------

  async getAllReviews(
    shopId: string,
    options: ReviewPageOptions = {},
  ): Promise<PaginatedResult<ReviewProduct>> {
    const page = clampPage(options.page);
    const pageSize = clampSize(options.size);
    const skip = page * pageSize;

    const where: Record<string, unknown> = { shopId };
    if (options.status) {
      where.status = options.status;
    }

    const orderBy = buildOrderBy(options.sort);

    const [items, total] = await Promise.all([
      this.prisma.reviewProduct.findMany({ where, orderBy, skip, take: pageSize }),
      this.prisma.reviewProduct.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  // -- Moderation ------------------------------------------------------------

  async updateStatus(
    shopId: string,
    productId: string,
    reviewId: string,
    status: string,
  ): Promise<ReviewProduct> {
    return this.prisma.reviewProduct.update({
      where: {
        shopId_productId_reviewId: { shopId, productId, reviewId },
      },
      data: {
        status,
        updatedAt: BigInt(Date.now()),
      },
    });
  }

  // -- Stats for a single product --------------------------------------------

  async getStatsForProduct(
    shopId: string,
    productId: string,
  ): Promise<ProductStats> {
    const [aggregation, statusCounts] = await Promise.all([
      this.prisma.reviewProduct.aggregate({
        where: { shopId, productId },
        _count: { id: true },
        _avg: { rating: true },
      }),
      this.prisma.reviewProduct.groupBy({
        by: ['status'],
        where: { shopId, productId },
        _count: { id: true },
      }),
    ]);

    const counts: Record<string, number> = {
      approved: 0,
      pending: 0,
      hidden: 0,
      spam: 0,
    };

    for (const row of statusCounts) {
      const key = row.status.toLowerCase();
      if (key in counts) {
        counts[key] = row._count.id;
      }
    }

    return {
      total: aggregation._count.id,
      avgRating:
        Math.round((aggregation._avg.rating ?? 0) * 10) / 10,
      approved: counts.approved,
      pending: counts.pending,
      hidden: counts.hidden,
      spam: counts.spam,
    };
  }

  // -- Rating summaries ------------------------------------------------------

  async calculateSummary(
    shopId: string,
    productId: string,
  ): Promise<RatingSummary> {
    const ratings = await this.prisma.reviewProduct.groupBy({
      by: ['rating'],
      where: { shopId, productId },
      _count: { id: true },
    });

    return this.buildSummary(ratings);
  }

  async calculatePublicSummary(
    shopId: string,
    productId: string,
  ): Promise<RatingSummary> {
    const ratings = await this.prisma.reviewProduct.groupBy({
      by: ['rating'],
      where: { shopId, productId, status: 'approved' },
      _count: { id: true },
    });

    return this.buildSummary(ratings);
  }

  // -- Internal helpers ------------------------------------------------------

  private buildSummary(
    ratings: Array<{ rating: number; _count: { id: number } }>,
  ): RatingSummary {
    type Dist = RatingSummary["distribution"];
    const distribution: Dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let count = 0;
    let sum = 0;

    for (const r of ratings) {
      if (r.rating >= 1 && r.rating <= 5) {
        distribution[r.rating as 1 | 2 | 3 | 4 | 5] = r._count.id;
        count += r._count.id;
        sum += r.rating * r._count.id;
      }
    }

    return {
      avg: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
      count,
      distribution,
    };
  }
}
