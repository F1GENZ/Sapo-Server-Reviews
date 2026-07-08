import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  resetInSeconds: number;
};

type MemoryBucket = { count: number; expiresAt: number };

@Injectable()
export class IngressRateLimitService {
  private readonly memoryBuckets = new Map<string, MemoryBucket>();

  constructor(private readonly redis?: RedisService) {}

  async check(
    bucket: string,
    fingerprint: string,
    windowSeconds: number,
    max: number,
  ): Promise<RateLimitResult> {
    const safeWindow = Math.max(1, Math.floor(windowSeconds));
    const safeMax = Math.max(1, Math.floor(max));
    const key = `rate:${bucket}:${fingerprint}`;

    if (this.redis?.isConfigured) {
      const count = await this.redis.incr(key, safeWindow);
      const ttl = await this.redis.ttl(key);
      return {
        allowed: count <= safeMax,
        count,
        remaining: Math.max(0, safeMax - count),
        resetInSeconds: ttl > 0 ? ttl : safeWindow,
      };
    }

    const now = Date.now();
    const current = this.memoryBuckets.get(key);
    if (!current || current.expiresAt <= now) {
      const next = { count: 1, expiresAt: now + safeWindow * 1000 };
      this.memoryBuckets.set(key, next);
      return { allowed: true, count: 1, remaining: safeMax - 1, resetInSeconds: safeWindow };
    }

    current.count += 1;
    return {
      allowed: current.count <= safeMax,
      count: current.count,
      remaining: Math.max(0, safeMax - current.count),
      resetInSeconds: Math.ceil((current.expiresAt - now) / 1000),
    };
  }

  async assertAllowed(
    bucket: string,
    fingerprint: string,
    windowSeconds: number,
    max: number,
  ): Promise<void> {
    const result = await this.check(bucket, fingerprint, windowSeconds, max);
    if (!result.allowed) {
      throw new HttpException(
        `Rate limit exceeded; retry in ${result.resetInSeconds}s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
