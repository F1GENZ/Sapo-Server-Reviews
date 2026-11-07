import { randomUUID } from 'node:crypto';
import type { RedisLock, RedisService } from '../core/redis/redis.service';
import type { SqlStorageLike } from './prisma-sqlite';

export type RedisServiceContract = Pick<
  RedisService,
  | 'isConfigured'
  | 'keyPrefix'
  | 'namespaced'
  | 'onModuleDestroy'
  | 'get'
  | 'set'
  | 'del'
  | 'delMany'
  | 'getDel'
  | 'setNx'
  | 'acquireLock'
  | 'releaseLock'
  | 'incr'
  | 'ttl'
  | 'scanKeys'
  | 'ping'
>;

export class SqliteRedisService implements RedisServiceContract {
  readonly isMemoryMode = false;
  readonly isConfigured = true;
  readonly keyPrefix: string;

  constructor(
    private readonly sql: SqlStorageLike,
    private readonly prefix = 'sapo-review',
  ) {
    this.keyPrefix = prefix;
  }

  namespaced(key: string): string {
    const normalized = key.replace(/^:+/, '');
    return `${this.prefix}:${normalized}`;
  }

  private buildKey(key: string): string {
    return this.namespaced(key);
  }

  async onModuleDestroy(): Promise<void> {
    // No-op for SQLite-backed store
  }

  private purgeExpired(nowMs: number): void {
    this.sql.exec('DELETE FROM "Ephemeral" WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= ?', nowMs);
  }

  private readEntry(fullKey: string): string | null {
    const now = Date.now();
    const rows = this.sql
      .exec('SELECT "value", "expiresAt" FROM "Ephemeral" WHERE "key" = ?', fullKey)
      .toArray();
    const row = rows[0];
    if (!row) return null;
    if (row.expiresAt !== null && row.expiresAt !== undefined && Number(row.expiresAt) <= now) {
      this.sql.exec('DELETE FROM "Ephemeral" WHERE "key" = ?', fullKey);
      return null;
    }
    return String(row.value);
  }

  private writeEntry(fullKey: string, value: string, ttlSeconds?: number): void {
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + Math.floor(ttlSeconds) * 1000 : null;
    this.sql.exec(
      'INSERT OR REPLACE INTO "Ephemeral" ("key", "value", "expiresAt") VALUES (?, ?, ?)',
      fullKey,
      value,
      expiresAt,
    );
  }

  getClient(): null {
    return null;
  }

  async ping(): Promise<boolean> {
    try {
      this.sql.exec('SELECT 1').toArray();
      return true;
    } catch {
      return false;
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = this.readEntry(this.buildKey(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    this.writeEntry(this.buildKey(key), payload, ttlSeconds);
  }

  async setNx(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    const fullKey = this.buildKey(key);
    this.purgeExpired(Date.now());
    if (this.readEntry(fullKey) !== null) return false;
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    this.writeEntry(fullKey, payload, Math.max(1, Math.floor(ttlSeconds)));
    return true;
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const k of keys) {
      const fullKey = this.buildKey(k);
      if (this.readEntry(fullKey) !== null) deleted += 1;
      this.sql.exec('DELETE FROM "Ephemeral" WHERE "key" = ?', fullKey);
    }
    return deleted;
  }

  async delMany(keys: string[]): Promise<number> {
    if (!keys.length) return 0;
    return this.del(...keys);
  }

  async getDel<T = unknown>(key: string): Promise<T | null> {
    const fullKey = this.buildKey(key);
    const raw = this.readEntry(fullKey);
    if (raw === null) return null;
    this.sql.exec('DELETE FROM "Ephemeral" WHERE "key" = ?', fullKey);
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async getAndDel<T = unknown>(key: string): Promise<T | null> {
    return this.getDel<T>(key);
  }

  async compareAndDel(key: string, expected: string): Promise<boolean> {
    const fullKey = this.buildKey(key);
    const raw = this.readEntry(fullKey);
    if (raw !== expected) return false;
    this.sql.exec('DELETE FROM "Ephemeral" WHERE "key" = ?', fullKey);
    return true;
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<RedisLock | null> {
    const owner = randomUUID();
    const acquired = await this.setNx(key, owner, ttlSeconds);
    return acquired ? { key, owner } : null;
  }

  async releaseLock(lock: RedisLock): Promise<boolean> {
    return this.compareAndDel(lock.key, lock.owner);
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const fullKey = this.buildKey(key);
    const rows = this.sql
      .exec('SELECT "value", "expiresAt" FROM "Ephemeral" WHERE "key" = ?', fullKey)
      .toArray();
    const row = rows[0];
    const now = Date.now();
    const active =
      row && (row.expiresAt === null || row.expiresAt === undefined || Number(row.expiresAt) > now);
    const next = active ? (Number(row.value) || 0) + 1 : 1;
    const expiresAt = active
      ? row.expiresAt
      : ttlSeconds && ttlSeconds > 0
        ? now + Math.floor(ttlSeconds) * 1000
        : null;
    this.sql.exec(
      'INSERT OR REPLACE INTO "Ephemeral" ("key", "value", "expiresAt") VALUES (?, ?, ?)',
      fullKey,
      String(next),
      expiresAt,
    );
    return next;
  }

  async ttl(key: string): Promise<number> {
    const fullKey = this.buildKey(key);
    const now = Date.now();
    const rows = this.sql
      .exec('SELECT "expiresAt" FROM "Ephemeral" WHERE "key" = ?', fullKey)
      .toArray();
    const row = rows[0];
    if (!row) return -2;
    if (row.expiresAt === null || row.expiresAt === undefined) return -1;
    const exp = Number(row.expiresAt);
    if (exp <= now) {
      this.sql.exec('DELETE FROM "Ephemeral" WHERE "key" = ?', fullKey);
      return -2;
    }
    return Math.max(0, Math.ceil((exp - now) / 1000));
  }

  async scanKeys(pattern: string): Promise<string[]> {
    this.purgeExpired(Date.now());
    const fullPattern = this.buildKey(pattern);
    const prefixWithColon = `${this.prefix}:`;
    const escaped = fullPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    const rows = this.sql
      .exec('SELECT "key" FROM "Ephemeral" WHERE "key" LIKE ?', `${prefixWithColon}%`)
      .toArray();
    return rows
      .map((r) => String(r.key))
      .filter((k) => regex.test(k))
      .map((k) => (k.startsWith(prefixWithColon) ? k.slice(prefixWithColon.length) : k));
  }
}
