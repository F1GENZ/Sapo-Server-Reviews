import { DurableObject } from 'cloudflare:workers';
import { createApp, type AppContainer } from './app';
import { PrismaSqliteService } from './db/prisma-sqlite';
import { SqliteRedisService } from './db/sqlite-redis';
import type { WorkerEnv } from './env';
import type { Hono } from 'hono';

export type SapoQueueEvent = {
  kind: 'webhook.process' | 'outbound.deliver' | 'review.metafield-sync';
  storeDomain: string;
  eventId?: string;
  deliveryId?: string;
  productId?: string;
  timestamp?: number;
};

export class StoreDO extends DurableObject<WorkerEnv> {
  readonly prisma: PrismaSqliteService;
  readonly redis: SqliteRedisService;
  readonly app: Hono;
  readonly container: AppContainer;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.prisma = new PrismaSqliteService(ctx.storage.sql);
    this.redis = new SqliteRedisService(ctx.storage.sql, 'sapo-review');
    const built = createApp(this.prisma, this.redis, env);
    this.app = built.app;
    this.container = built.container;
  }

  override async fetch(request: Request): Promise<Response> {
    this.container.mediaService.drainEvictedKeys();
    const response = await this.app.fetch(request, this.env);
    const evictedKeys = this.container.mediaService.drainEvictedKeys();
    if (evictedKeys.length > 0) {
      const headers = new Headers(response.headers);
      headers.set('x-evict-media-keys', evictedKeys.join(','));
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  }

  async processQueuedBatch(events: readonly SapoQueueEvent[]): Promise<{ processed: number; stores: string[] }> {
    const stores = [...new Set(events.map((ev) => ev.storeDomain.trim().toLowerCase()).filter(Boolean))];
    await this.container.durabilitySweep.runOnce();
    return { processed: events.length, stores };
  }
}
