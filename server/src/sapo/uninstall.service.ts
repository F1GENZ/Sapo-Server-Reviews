import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LifecycleLockService } from './lifecycle-lock.service';
import { ShopDomainService } from './shop-domain.service';
import { SessionService } from './session.service';
import { SubscriptionService } from './subscription.service';

@Injectable()
export class UninstallService {
  private readonly db: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly shopDomains: ShopDomainService,
    private readonly locks: LifecycleLockService,
    private readonly sessions: SessionService,
    private readonly subscriptions: SubscriptionService,
  ) {
    this.db = prisma as any;
  }

  async uninstall(storeDomain: string, payload: Record<string, unknown>): Promise<{
    storeDomain: string;
    uninstalled: true;
    domainsCleared: number;
  }> {
    const lock = await this.locks.acquireLifecycleLock(storeDomain);
    if (!lock) throw new ConflictException('Lifecycle operation already in progress');

    try {
      const install = await this.db.appInstall.findUnique({ where: { storeDomain } });
      const domains = this.shopDomains.collectDomains(payload);
      const storedDomains = await this.db.shopDomain.findMany({
        where: { storeDomain, active: true },
        select: { domain: true },
      });
      const allDomains = Array.from(new Set([...domains, ...storedDomains.map((item: { domain: string }) => item.domain)]));

      await this.sessions.clearStoreHandoffs(storeDomain);
      for (const domain of allDomains) {
        await this.subscriptions.deleteSnapshotLookups({ domain });
      }
      await this.subscriptions.tombstoneSnapshots({ storeDomain });
      await this.redis.delMany([
        `install:${storeDomain}`,
        ...allDomains.map((domain) => this.shopDomains.domainKey(domain)),
      ]);

      const uninstallInstall = this.db.appInstall.updateMany({
        where: { storeDomain },
        data: {
          status: 'uninstalled',
          accessTokenCiphertext: null,
          accessTokenIv: null,
          accessTokenTag: null,
          uninstalledAt: new Date(),
          dataPreserved: true,
          lifecycleGeneration: { increment: 1 },
          tokenVersion: { increment: 1 },
        },
      });
      const tombstoneDomains = this.db.shopDomain.updateMany({
        where: { storeDomain, active: true },
        data: { active: false, tombstonedAt: new Date() },
      });

      if (typeof this.db.$transaction === 'function') {
        await this.db.$transaction([uninstallInstall, tombstoneDomains]);
      } else {
        await uninstallInstall;
        await tombstoneDomains;
      }

      return { storeDomain, uninstalled: true, domainsCleared: allDomains.length };
    } finally {
      await this.locks.release(lock);
    }
  }
}
