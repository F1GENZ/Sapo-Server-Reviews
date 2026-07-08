import { Injectable } from '@nestjs/common';
import { RedisLock, RedisService } from '../redis/redis.service';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class LifecycleLockService {
  constructor(private readonly redis: RedisService) {}

  async acquireRefreshLock(storeDomain: string, ttlSeconds = 30): Promise<RedisLock | null> {
    return this.redis.acquireLock(`lock:refresh:${storeDomain}`, ttlSeconds);
  }

  async acquireLifecycleLock(storeDomain: string, ttlSeconds = 30): Promise<RedisLock | null> {
    return this.redis.acquireLock(`lock:lifecycle:${storeDomain}`, ttlSeconds);
  }

  async release(lock: RedisLock | null): Promise<void> {
    if (!lock) return;
    await this.redis.releaseLock(lock);
  }

  async waitFor<T>(producer: () => Promise<T | null>, attempts = 10, delayMs = 250): Promise<T | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await delay(delayMs);
      const value = await producer();
      if (value) return value;
    }
    return null;
  }
}
