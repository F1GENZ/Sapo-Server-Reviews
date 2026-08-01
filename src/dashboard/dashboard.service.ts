import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ReviewProductStoreService } from '../review/review-product-store.service';
import { QnaStoreService } from '../qna/qna-store.service';

type DashboardOverview = {
  productCount: number;
  totalReviews: number;
  totalQuestions: number;
  totalAnswered: number;
  totalUnanswered: number;
  responseRate: number;
  globalAvg: number;
  globalDist: Record<number, number>;
  statusCounts: { approved: number; pending: number; hidden: number; spam: number; unreplied: number };
  qnaStatusCounts: { all: number; pending: number; hidden: number; answered: number; unanswered: number };
  verifiedCount: number;
  withMediaCount: number;
  recentReviews: Array<{
    id: string; rating: number; author: string; content: string;
    created_at: number; productId: string; productTitle?: string; productImage?: string;
    status?: string; verified?: boolean; hasReply?: boolean;
  }>;
  recentQuestions: Array<{
    id: string; question: string; author: string; status?: string;
    answered: boolean; created_at: number; productId: string; productTitle?: string;
  }>;
  rankedProducts: Array<{
    id: string; title: string; count: number; avg: number;
  }>;
};

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly reviewStore: ReviewProductStoreService,
    private readonly qnaStore: QnaStoreService,
    private readonly prisma: PrismaService,
  ) {}

  async getOverview(storeDomain: string): Promise<DashboardOverview> {
    const install = await this.prisma.appInstall.findUnique({
      where: { storeDomain },
      select: { shopId: true },
    }).catch(() => null);
    const shopId = install?.shopId || '';
    const [reviewStats, qnaStats, recentReviews, recentQuestions] = await Promise.all([
      this.reviewStore.getStatsForShop(shopId).catch((e: any) => { this.logger.warn(`Review stats failed: ${e.message}`); return null; }),
      this.qnaStore.getStats(shopId, '').catch(() => null),
      this.reviewStore.getAllReviews(shopId, { page: 1, size: 8, sort: 'newest' }).catch(() => ({ items: [], total: 0 })),
      this.qnaStore.getAllQuestions(shopId, { page: 1, size: 8, sort: 'newest' }).catch(() => ({ items: [], total: 0 })),
    ]);

    const totalReviews = reviewStats?.totalReviews ?? 0;
    const totalQuestions = qnaStats?.total ?? 0;
    const totalAnswered = qnaStats?.answered ?? 0;

    return {
      productCount: reviewStats?.productCount ?? 0,
      totalReviews,
      totalQuestions,
      totalAnswered,
      totalUnanswered: Math.max(0, totalQuestions - totalAnswered),
      responseRate: totalQuestions ? Math.round((totalAnswered / totalQuestions) * 100) : 0,
      globalAvg: reviewStats?.globalAvg ?? 0,
      globalDist: reviewStats?.globalDist ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      statusCounts: reviewStats?.statusCounts as any ?? { approved: 0, pending: 0, hidden: 0, spam: 0, unreplied: 0 },
      qnaStatusCounts: { all: totalQuestions, pending: 0, hidden: 0, answered: totalAnswered, unanswered: Math.max(0, totalQuestions - totalAnswered) },
      verifiedCount: reviewStats?.verifiedCount ?? 0,
      withMediaCount: reviewStats?.withMediaCount ?? 0,
      rankedProducts: (reviewStats?.products ?? []).filter((p: any) => p.reviewCount > 0).sort((a: any, b: any) => b.reviewCount - a.reviewCount).slice(0, 5).map((p: any) => ({
        id: p.productId, title: p.title || '', count: p.reviewCount, avg: p.reviewAvg,
      })),
      recentReviews: (recentReviews?.items ?? []).map((r: any) => ({
        id: r.reviewId, rating: r.rating, author: r.author, content: r.content?.slice(0, 200) || '',
        created_at: Number(r.createdAt), productId: r.productId, productTitle: r.productTitle || undefined, productImage: r.productImage || undefined,
        status: r.status, verified: r.verified, hasReply: !!r.reply,
      })),
      recentQuestions: (recentQuestions?.items ?? []).map((q: any) => ({
        id: q.questionId, question: q.question?.slice(0, 200) || '', author: q.author, status: q.status,
        answered: !!q.answer, created_at: Number(q.createdAt), productId: q.productId, productTitle: q.productTitle || undefined,
      })),
    };
  }
}
