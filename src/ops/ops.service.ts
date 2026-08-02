import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';
import { SapoService } from '../sapo/sapo.service';
import { SapoApiService } from '../sapo/sapo-api.service';
import { CatalogSyncService } from '../catalog/catalog-sync.service';
import { CatalogProductStoreService } from '../catalog/catalog-product-store.service';
import { ReviewProductStoreService } from '../review/review-product-store.service';
import { QnaStoreService } from '../qna/qna-store.service';
import { PurchaseStoreService } from '../purchase/purchase-store.service';
import { PrismaService } from '../database/prisma.service';
import { StorefrontService } from '../storefront/storefront.service';

@Injectable()
export class OpsService {
  private readonly logger = new Logger(OpsService.name);

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly sapo: SapoService,
    private readonly sapoApi: SapoApiService,
    private readonly catalogSync: CatalogSyncService,
    private readonly catalogStore: CatalogProductStoreService,
    private readonly reviewStore: ReviewProductStoreService,
    private readonly qnaStore: QnaStoreService,
    private readonly purchaseStore: PurchaseStoreService,
    private readonly prisma: PrismaService,
    private readonly storefront: StorefrontService,
  ) {}

  async getHealth(storeDomain: string) {
    const install = await this.prisma.appInstall.findUnique({ where: { storeDomain } }).catch(() => null);
    const shopId = install?.shopId || '';
    const [reviewStats, qnaStats, catalogAudit, purchaseAudit, webhookStats] = await Promise.all([
      this.reviewStore.getStatsForShop(shopId).catch(() => null),
      this.qnaStore.getStats(shopId, '').catch(() => null),
      this.catalogStore.getAudit(shopId).catch(() => null),
      this.purchaseStore.getAudit(shopId).catch(() => null),
      this.getWebhookSummary(storeDomain).catch(() => ({ totals: [], latest: [] })),
    ]);

    return {
      ok: true,
      storeDomain,
      status: install?.status || 'unknown',
      featuresUnlocked: install?.featuresUnlocked ?? true,
      webhookStatus: install?.webhookRegistrationStatus || 'not_configured',
      counts: {
        products: catalogAudit?.active ?? 0,
        deletedProducts: catalogAudit?.deleted ?? 0,
        purchases: purchaseAudit?.total ?? 0,
        purchaseOrders: purchaseAudit?.orders ?? 0,
        reviews: reviewStats?.totalReviews ?? 0,
        questions: qnaStats?.total ?? 0,
        answered: qnaStats?.answered ?? 0,
      },
      catalog: catalogAudit,
      purchases: purchaseAudit,
      webhooks: webhookStats,
      lastUpdated: Date.now(),
    };
  }

  private async getWebhookSummary(storeDomain: string) {
    const events = await this.prisma.webhookEvent.findMany({
      where: { resolvedStoreDomain: storeDomain },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: { id: true, topic: true, status: true, attempts: true, lastError: true, processedAt: true },
    });
    const byStatus: Record<string, number> = {};
    for (const e of events) {
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    }
    return {
      totals: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      latest: events,
    };
  }

  async resyncConfig(storeDomain: string) {
    const accessToken = await this.sapo.resolveAccessToken(storeDomain);
    const config = { apiUrl: this.env.API_BASE_URL.replace(/\/+$/, ''), storeDomain };
    let configError: string | null = null;
    try {
      await this.storefront.writeStorefrontConfig(storeDomain, accessToken);
    } catch (e) {
      configError = e instanceof Error ? e.message : 'failed';
      this.logger.warn(`Config metafield write failed: ${configError}`);
    }
    return { ok: true, storeDomain, config, ...(configError ? { configError } : {}) };
  }

  async resyncWebhooks(storeDomain: string) {
    // Re-register all webhook topics
    const accessToken = await this.sapo.resolveAccessToken(storeDomain);
    const results: string[] = [];
    const { WEBHOOK_SUBSCRIBE_TOPICS } = await import('../sapo/webhook-topic-normalizer');
    for (const topic of WEBHOOK_SUBSCRIBE_TOPICS) {
      try {
        await this.sapoApi.createWebhook(storeDomain, accessToken, topic, new URL('/api/oauth/install/webhooks', this.env.API_BASE_URL).toString());
        results.push(`${topic}: ok`);
      } catch (e) {
        results.push(`${topic}: ${e instanceof Error ? e.message : 'failed'}`);
      }
    }
    return { ok: true, storeDomain, results };
  }

  async backfillCatalog(storeDomain: string) {
    const accessToken = await this.sapo.resolveAccessToken(storeDomain);
    const result = await this.catalogSync.backfillStore(storeDomain, accessToken);
    return { ok: true, storeDomain, ...result };
  }
}
