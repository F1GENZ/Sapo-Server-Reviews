import type { SqlStorageLike } from './prisma-sqlite';

export class SqliteRedisService {
  readonly isMemoryMode = false;

  constructor(
    private readonly sql: SqlStorageLike,
    private readonly prefix = 'sapo-review',
  ) {}

  private buildKey(key: string): string {
    return `${this.prefix}:${key}`;
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
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
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
    this.writeEntry(fullKey, payload, ttlSeconds);
    return true;
  }

  async del(...keys: string[]): Promise<void> {
    for (const k of keys) {
      this.sql.exec('DELETE FROM "Ephemeral" WHERE "key" = ?', this.buildKey(k));
    }
  }

  async getAndDel<T = unknown>(key: string): Promise<T | null> {
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

  async compareAndDel(key: string, expected: string): Promise<boolean> {
    const fullKey = this.buildKey(key);
    const raw = this.readEntry(fullKey);
    if (raw !== expected) return false;
    this.sql.exec('DELETE FROM "Ephemeral" WHERE "key" = ?', fullKey);
    return true;
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
        ? now + ttlSeconds * 1000
        : null;
    this.sql.exec(
      'INSERT OR REPLACE INTO "Ephemeral" ("key", "value", "expiresAt") VALUES (?, ?, ?)',
      fullKey,
      String(next),
      expiresAt,
    );
    return next;
  }
}
