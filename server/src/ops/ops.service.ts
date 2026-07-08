import { Injectable, Logger } from '@nestjs/common';
import { SapoService } from '../sapo/sapo.service';
import { SapoApiService } from '../sapo/sapo-api.service';
import { CatalogProductStoreService } from '../catalog/catalog-product-store.service';
import { ReviewProductStoreService } from '../review/review-product-store.service';
import { QnaStoreService } from '../qna/qna-store.service';
import { PurchaseStoreService } from '../purchase/purchase-store.service';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class OpsService {
  private readonly logger = new Logger(OpsService.name);

  constructor(
    private readonly sapo: SapoService,
    private readonly sapoApi: SapoApiService,
    private readonly catalogStore: CatalogProductStoreService,
    private readonly reviewStore: ReviewProductStoreService,
    private readonly qnaStore: QnaStoreService,
    private readonly purchaseStore: PurchaseStoreService,
    private readonly prisma: PrismaService,
  ) {}

  async getHealth(storeDomain: string) {
    const [reviewStats, qnaStats, catalogAudit, purchaseAudit, webhookStats] = await Promise.all([
      this.reviewStore.getStatsForShop(storeDomain).catch(() => null),
      this.qnaStore.getStats(storeDomain, '').catch(() => null),
      this.catalogStore.getAudit(storeDomain).catch(() => null),
      this.purchaseStore.getAudit(storeDomain).catch(() => null),
      this.getWebhookSummary(storeDomain).catch(() => ({ totals: [], latest: [] })),
    ]);

    const install = await this.prisma.appInstall.findUnique({ where: { storeDomain } }).catch(() => null);

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
    // Write storefront config metafield
    const config = { apiUrl: process.env.API_BASE_URL || '', storeDomain };
    await this.sapoApi.createMetafield(storeDomain, accessToken, {
      namespace: 'f1genz',
      key: 'config',
      value: JSON.stringify(config),
      value_type: 'string',
      owner_resource: 'shop',
    }).catch((e) => this.logger.warn(`Config metafield write failed: ${e.message}`));
    return { ok: true, storeDomain, config };
  }

  async resyncWebhooks(storeDomain: string) {
    // Re-register all webhook topics
    const accessToken = await this.sapo.resolveAccessToken(storeDomain);
    const results: string[] = [];
    const { WEBHOOK_SUBSCRIBE_TOPICS } = await import('../sapo/webhook-topic-normalizer');
    for (const topic of WEBHOOK_SUBSCRIBE_TOPICS) {
      try {
        await this.sapoApi.createWebhook(storeDomain, accessToken, topic, `${process.env.API_BASE_URL}/api/oauth/install/webhooks`);
        results.push(`${topic}: ok`);
      } catch (e) {
        results.push(`${topic}: ${e instanceof Error ? e.message : 'failed'}`);
      }
    }
    return { ok: true, storeDomain, results };
  }

  async backfillCatalog(storeDomain: string) {
    const accessToken = await this.sapo.resolveAccessToken(storeDomain);
    let synced = 0;
    for (let page = 1; page <= 50; page++) {
      const products = await this.sapoApi.getProducts(storeDomain, accessToken, { page, limit: 250 });
      if (!products.length) break;
      const rows = products.map(p => this.catalogStore.normalizeSapoProduct(storeDomain, p, 'sapo'));
      await this.catalogStore.upsertProducts(rows.filter(Boolean) as any[]);
      synced += rows.length;
    }
    return { ok: true, storeDomain, synced };
  }
}
