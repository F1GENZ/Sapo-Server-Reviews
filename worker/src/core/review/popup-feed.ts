import type { PrismaService } from '../database/prisma.service';

/**
 * Social-proof popup feed: the most recent approved reviews at or above the shop's configured
 * minimum rating. Names arrive already masked ("Nguyễn V.") and no email/phone/media URLs ever
 * leave this endpoint.
 */

export type PopupFeedItem = {
  product_id: string;
  product_title: string;
  product_handle: string | null;
  rating: number;
  author: string;
  excerpt: string;
  created_at: number;
};

export type PopupFeed = { v: 1; updated_at: number; items: PopupFeedItem[] };

const MAX_ITEMS = 10;
const EXCERPT_LIMIT = 120;

/** "Nguyễn Văn A" -> "Nguyễn A."; a single name collapses to its first letter + '.'. */
export const maskPopupName = (raw: string): string => {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Khách';
  if (words.length === 1) return `${words[0][0]}.`;
  return `${words[0]} ${words[words.length - 1][0]}.`;
};

export const emptyPopupFeed = (): PopupFeed => ({ v: 1, updated_at: Date.now(), items: [] });

type FeedRow = {
  productId: string;
  productTitle: string | null;
  productName: string | null;
  productHandle: string | null;
  rating: number;
  author: string;
  content: string;
  title: string | null;
  createdAt: bigint;
};

export const buildPopupFeed = async (prisma: PrismaService, shopId: string, minRating: number): Promise<PopupFeed> => {
  const rows = (await prisma.reviewProduct.findMany({
    where: { shopId, status: 'approved', rating: { gte: Math.max(1, Math.min(5, Math.floor(minRating))) } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: MAX_ITEMS,
  })) as unknown as FeedRow[];
  const items: PopupFeedItem[] = rows.map((row) => ({
    product_id: String(row.productId),
    product_title: String(row.productTitle || row.productName || 'Sản phẩm').slice(0, 100),
    product_handle: row.productHandle || null,
    rating: Math.max(1, Math.min(5, Number(row.rating) || 5)),
    author: maskPopupName(String(row.author || '')),
    excerpt: String(row.content || row.title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, EXCERPT_LIMIT),
    created_at: Number(row.createdAt) || 0,
  }));
  return { v: 1, updated_at: Date.now(), items };
};
