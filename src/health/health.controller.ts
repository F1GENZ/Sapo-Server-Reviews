import { Controller, Get, Headers, Inject, UnauthorizedException } from '@nestjs/common';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller()
export class HealthController {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('/livez')
  livez(): { ok: true } {
    return { ok: true };
  }

  @Get('/readyz')
  async readyz(@Headers('authorization') authorization?: string): Promise<Record<string, unknown>> {
    const token = authorization?.replace(/^Bearer\s+/i, '') || '';
    if (!this.env.READINESS_TOKEN || token !== this.env.READINESS_TOKEN) {
      throw new UnauthorizedException('Invalid readiness token');
    }

    const [redisOk, dbOk, webhookStatuses] = await Promise.all([
      this.redis.ping().catch(() => false),
      this.prisma.ping().catch(() => false),
      (this.prisma as any).appInstall.groupBy({
        by: ['webhookRegistrationStatus'],
        _count: { _all: true },
      }).catch(() => [] as Array<{ webhookRegistrationStatus: string; _count: { _all: number } }>),
    ]);
    const webhookRegistration = Object.fromEntries(
      (webhookStatuses as Array<{ webhookRegistrationStatus: string; _count: { _all: number } }>).map((item) => [
        item.webhookRegistrationStatus,
        item._count._all,
      ]),
    );
    const webhookDegraded = Boolean(webhookRegistration.degraded || webhookRegistration.failed);
    return {
      ok: redisOk && dbOk,
      redis: redisOk ? 'ok' : 'failed',
      db: dbOk ? 'ok' : 'failed',
      webhookRegistration,
      webhookDegraded,
      build: this.env.BUILD_SHA,
    };
  }
}
