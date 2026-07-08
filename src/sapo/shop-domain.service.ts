import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

export const normalizeShopDomain = (value: unknown): string => {
  const rawValue = typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
  if (!rawValue) return '';

  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
  try {
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return rawValue.toLowerCase().replace(/^www\./, '').replace(/\/+$/, '');
  }
};

@Injectable()
export class ShopDomainService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma?: PrismaService,
  ) {}

  domainKey(domain: string): string {
    return `domain:${normalizeShopDomain(domain)}`;
  }

  async saveMapping(storeDomain: string, domain: string, ttlSeconds?: number): Promise<void> {
    const normalized = normalizeShopDomain(domain);
    if (!normalized) return;
    await this.redis.set(this.domainKey(normalized), storeDomain, ttlSeconds);
  }

  async removeMapping(domain: string): Promise<void> {
    const normalized = normalizeShopDomain(domain);
    if (!normalized) return;
    await this.redis.del(this.domainKey(normalized));
  }

  async resolveStoreDomain(domain: string): Promise<string | null> {
    const normalized = normalizeShopDomain(domain);
    if (!normalized) return null;
    const cached = await this.redis.get<string>(this.domainKey(normalized));
    if (cached) return cached;

    const stored = await this.prisma?.shopDomain.findFirst({
      where: { domain: normalized, active: true },
      select: { storeDomain: true },
    });
    if (stored?.storeDomain) {
      await this.saveMapping(stored.storeDomain, normalized);
      return stored.storeDomain;
    }
    return null;
  }

  collectDomains(...records: Array<Record<string, unknown> | null | undefined>): string[] {
    const domains = new Set<string>();
    const visit = (value: unknown, depth = 0): void => {
      if (depth > 3 || value === null || value === undefined) return;
      const normalized = normalizeShopDomain(value);
      if (normalized) domains.add(normalized);
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }
      if (typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      [
        'shop',
        'shop_domain',
        'shopDomain',
        'domain',
        'mysapo_domain',
        'mysapoDomain',
        'primary_domain',
        'primaryDomain',
        'custom_domain',
        'customDomain',
        'shop_domains',
        'shopDomains',
        'domains',
      ].forEach((key) => visit(record[key], depth + 1));
    };
    records.forEach((record) => visit(record));
    return Array.from(domains);
  }
}
