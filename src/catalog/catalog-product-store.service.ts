import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type CatalogProductInput = {
  shopId: string;
  productId: string | number;
  title?: string | null;
  handle?: string | null;
  image?: string | null;
  vendor?: string | null;
  productType?: string | null;
  tags?: string | null;
  status?: string | null;
  published?: boolean | null;
  deletedAt?: number | null;
  rawPayload?: unknown;
  source?: 'sapo' | 'import' | 'webhook' | 'derived';
  updatedAt?: number;
};

export type CatalogProduct = {
  id: string;
  productId: string;
  title: string;
  handle: string;
  image?: { src?: string };
  productImage?: string;
  vendor?: string;
  productType?: string;
  tags?: string;
  status?: string;
  deletedAt?: number;
  source?: string;
  updatedAt: number;
};

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

const getNested = (
  value: Record<string, unknown>,
  path: string[],
): unknown => {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

@Injectable()
export class CatalogProductStoreService {
  private readonly logger = new Logger(CatalogProductStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  normalizeSapoProduct(
    shopId: string,
    product: Record<string, unknown>,
    source: CatalogProductInput['source'] = 'sapo',
  ): CatalogProductInput | null {
    const productId = toText(product.id || product.product_id || product.productId);
    if (!productId) return null;
    const image =
      toText(getNested(product, ['image', 'src'])) ||
      toText(getNested(product, ['images', '0', 'src'])) ||
      toText(product.image_url || product.productImage);
    return {
      shopId,
      productId,
      title: toText(product.title || product.name || product.productName),
      handle: toText(product.handle || product.productHandle),
      image: image || null,
      vendor: toText(product.vendor) || null,
      productType: toText(product.product_type || product.productType) || null,
      tags: toText(product.tags) || null,
      status: toText(product.status) || null,
      published:
        typeof product.published === 'boolean'
          ? product.published
          : typeof product.published_at === 'string'
            ? Boolean(product.published_at)
            : null,
      rawPayload: product,
      source,
      updatedAt: Date.now(),
    };
  }

  async upsertProduct(input: CatalogProductInput): Promise<void> {
    await this.upsertProducts([input]);
  }

  async upsertProducts(inputs: CatalogProductInput[]): Promise<void> {
    if (!inputs.length) return;
    const now = Date.now();

    const rows = inputs
      .map((input) => ({
        shopId: input.shopId,
        productId: toText(input.productId),
        title: toText(input.title),
        handle: toText(input.handle),
        image: toText(input.image) || null,
        vendor: toText(input.vendor) || null,
        productType: toText(input.productType) || null,
        tags: toText(input.tags) || null,
        status: toText(input.status) || null,
        published:
          typeof input.published === 'boolean' ? input.published : null,
        deletedAt: input.deletedAt ?? null,
        rawPayload:
          input.rawPayload === undefined
            ? null
            : input.rawPayload,
        source: input.source || 'derived',
        updatedAt: BigInt(input.updatedAt || now),
      }))
      .filter((row) => row.shopId && row.productId);

    if (!rows.length) return;

    const shopId = rows[0].shopId;
    const productIds = rows.map((r) => r.productId);

    // Fetch existing records for monotonic guard and COALESCE merges.
    const existingRecords = await this.prisma.catalogProduct.findMany({
      where: { shopId, productId: { in: productIds } },
    });
    const existingMap = new Map(
      existingRecords.map((e) => [e.productId, e]),
    );

    const operations: Array<Promise<unknown>> = [];

    for (const row of rows) {
      const prev = existingMap.get(row.productId);

      if (!prev) {
        // New record — create.
        operations.push(
          this.prisma.catalogProduct.create({
            data: {
              id: undefined as unknown as string, // let Prisma generate cuid
              shopId: row.shopId,
              productId: row.productId,
              title: row.title,
              handle: row.handle,
              image: row.image,
              vendor: row.vendor,
              productType: row.productType,
              tags: row.tags,
              status: row.status,
              published: row.published,
              deletedAt:
                row.deletedAt !== null ? BigInt(row.deletedAt) : null,
              rawPayload: row.rawPayload as object | null,
              source: row.source,
              createdAt: new Date(),
              updatedAt: row.updatedAt,
            },
          }),
        );
      } else {
        // Monotonic guard: skip if existing updatedAt >= new updatedAt.
        if (prev.updatedAt >= row.updatedAt) continue;

        // COALESCE: keep existing non-empty values when new value is empty.
        operations.push(
          this.prisma.catalogProduct.update({
            where: {
              shopId_productId: {
                shopId: row.shopId,
                productId: row.productId,
              },
            },
            data: {
              title: row.title || prev.title,
              handle: row.handle || prev.handle,
              image: row.image !== undefined ? row.image : prev.image,
              vendor: row.vendor !== undefined ? row.vendor : prev.vendor,
              productType:
                row.productType !== undefined
                  ? row.productType
                  : prev.productType,
              tags: row.tags !== undefined ? row.tags : prev.tags,
              status: row.status !== undefined ? row.status : prev.status,
              published:
                row.published !== undefined
                  ? row.published
                  : prev.published,
              deletedAt:
                row.deletedAt !== null
                  ? BigInt(row.deletedAt)
                  : prev.deletedAt,
              rawPayload:
                row.rawPayload !== undefined
                  ? (row.rawPayload as object | null)
                  : prev.rawPayload,
              source: row.source,
              updatedAt: row.updatedAt,
            },
          }),
        );
      }
    }

    if (!operations.length) return;

    try {
      await this.prisma.$transaction(operations);
    } catch (error) {
      this.logger.warn(
        `Catalog product upsert failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }

  async softDeleteProduct(
    shopId: string,
    productId: string,
  ): Promise<void> {
    const now = BigInt(Date.now());
    await this.prisma.catalogProduct.upsert({
      where: { shopId_productId: { shopId, productId } },
      create: {
        shopId,
        productId,
        title: '',
        handle: '',
        deletedAt: now,
        source: 'webhook',
        createdAt: new Date(),
        updatedAt: now,
      },
      update: {
        deletedAt: now,
        source: 'webhook',
        updatedAt: now,
      },
    });
  }

  async getProduct(
    shopId: string,
    productId: string,
  ): Promise<CatalogProduct | null> {
    const row = await this.prisma.catalogProduct.findUnique({
      where: { shopId_productId: { shopId, productId } },
    });
    return row ? this.toCatalogProduct(row) : null;
  }

  async listProducts(
    shopId: string,
    options: { limit?: number; page?: number; title?: string } = {},
  ): Promise<{ products: CatalogProduct[]; total: number }> {
    const limit = Math.min(250, Math.max(1, Number(options.limit) || 50));
    const page = Math.max(1, Number(options.page) || 1);
    const search = toText(options.title);

    const where: Record<string, unknown> = {
      shopId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { handle: { contains: search, mode: 'insensitive' } },
        { productId: search },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.catalogProduct.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.catalogProduct.count({ where }),
    ]);

    return {
      products: products.map((row) => this.toCatalogProduct(row)),
      total,
    };
  }

  async getAudit(shopId: string): Promise<{
    total: number;
    active: number;
    deleted: number;
    lastUpdated: number | null;
    sources: Record<string, number>;
    activeSources: Record<string, number>;
    deletedSources: Record<string, number>;
    sapoActive: number;
    nonSapoActive: number;
  }> {
    const all = await this.prisma.catalogProduct.findMany({
      where: { shopId },
      select: {
        source: true,
        deletedAt: true,
        updatedAt: true,
      },
    });

    const total = all.length;
    const deleted = all.filter((r) => r.deletedAt !== null).length;
    const active = total - deleted;
    const lastUpdated =
      all.length > 0
        ? Number(
            all.reduce(
              (max, r) => (r.updatedAt > max ? r.updatedAt : max),
              BigInt(0),
            ),
          )
        : null;

    const sources: Record<string, number> = {};
    const activeSources: Record<string, number> = {};
    const deletedSources: Record<string, number> = {};

    for (const row of all) {
      const src = row.source || 'unknown';
      sources[src] = (sources[src] || 0) + 1;
      if (row.deletedAt === null) {
        activeSources[src] = (activeSources[src] || 0) + 1;
      } else {
        deletedSources[src] = (deletedSources[src] || 0) + 1;
      }
    }

    const sapoActive = activeSources.sapo || 0;

    return {
      total,
      active,
      deleted,
      lastUpdated,
      sources,
      activeSources,
      deletedSources,
      sapoActive,
      nonSapoActive: Math.max(0, active - sapoActive),
    };
  }

  async markMissingSapoProductsDeleted(
    shopId: string,
    activeProductIds: string[],
    deletedAt = Date.now(),
  ): Promise<number> {
    if (!activeProductIds.length) return 0;

    const ts = BigInt(deletedAt);

    const result = await this.prisma.catalogProduct.updateMany({
      where: {
        shopId,
        source: 'sapo',
        deletedAt: null,
        productId: { notIn: activeProductIds },
      },
      data: {
        deletedAt: ts,
        updatedAt: ts,
      },
    });

    return result.count;
  }

  private toCatalogProduct(
    row: Awaited<
      ReturnType<PrismaService['catalogProduct']['findUnique']>
    >,
  ): CatalogProduct {
    if (!row) {
      return {
        id: '',
        productId: '',
        title: 'Không rõ sản phẩm',
        handle: '',
        updatedAt: 0,
      };
    }
    const image = row.image || undefined;
    return {
      id: row.productId,
      productId: row.productId,
      title: row.title || 'Không rõ sản phẩm',
      handle: row.handle || '',
      ...(image ? { image: { src: image }, productImage: image } : {}),
      ...(row.vendor ? { vendor: row.vendor } : {}),
      ...(row.productType ? { productType: row.productType } : {}),
      ...(row.tags ? { tags: row.tags } : {}),
      ...(row.status ? { status: row.status } : {}),
      ...(row.deletedAt ? { deletedAt: Number(row.deletedAt) } : {}),
      source: row.source,
      updatedAt: Number(row.updatedAt),
    };
  }
}
