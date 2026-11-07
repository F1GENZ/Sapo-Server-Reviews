import { DurableObject } from 'cloudflare:workers';
import { createApp, type AppContainer } from './app';
import { PrismaSqliteService } from './db/prisma-sqlite';
import { SqliteRedisService } from './db/sqlite-redis';
import type { WorkerEnv } from './env';
import type { Hono } from 'hono';

export class StoreDO extends DurableObject<WorkerEnv> {
  readonly prisma: PrismaSqliteService;
  readonly redis: SqliteRedisService;
  readonly app: Hono;
  readonly container: AppContainer;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.prisma = new PrismaSqliteService(ctx.storage.sql);
    this.redis = new SqliteRedisService(ctx.storage.sql, env.REDIS_KEY_PREFIX || 'sapo-review');
    const built = createApp(this.prisma, this.redis, env);
    this.app = built.app;
    this.container = built.container;
  }

  override async fetch(request: Request): Promise<Response> {
    return this.app.fetch(request, this.env);
  }
}
