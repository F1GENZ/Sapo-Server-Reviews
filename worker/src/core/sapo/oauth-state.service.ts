import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';

export type OAuthFlow = 'login' | 'install';

export type OAuthStateData = {
  flow: OAuthFlow;
  createdAt: number;
  storeDomain?: string;
  redirectTo?: string;
};

const STATE_TTL_SECONDS = 30 * 60;
const STATE_REGEX = /^sapo_oauth_[a-f0-9]{64}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const BLOCKED_REDIRECT_PREFIX = /^\/(install|oauth|api\/oauth)/i;

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const getPathBeforeQuery = (value: string): string => value.split(/[?#]/, 1)[0] || '';
const hasUnsafePathPrefix = (path: string): boolean => BLOCKED_REDIRECT_PREFIX.test(path);

export const isSafeRedirect = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (hasUnsafePathPrefix(getPathBeforeQuery(value))) return false;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return false;
  if (hasUnsafePathPrefix(getPathBeforeQuery(decoded))) return false;

  try {
    // Relative path must stay same-origin under a dummy base after URL normalization.
    const parsed = new URL(value, 'https://app.local');
    if (parsed.origin !== 'https://app.local') return false;
    return !hasUnsafePathPrefix(parsed.pathname);
  } catch {
    return false;
  }
};

@Injectable()
export class OAuthStateService {
  constructor(private readonly redis: RedisService) {}

  private key(state: string): string {
    return `oauth-state:${hash(state)}`;
  }

  async create(flow: OAuthFlow, metadata: { storeDomain?: string; redirectTo?: string } = {}): Promise<{
    state: string;
  }> {
    const state = `sapo_oauth_${randomBytes(32).toString('hex')}`;
    const payload: OAuthStateData = {
      flow,
      createdAt: Date.now(),
      ...(metadata.storeDomain ? { storeDomain: metadata.storeDomain } : {}),
      ...(isSafeRedirect(metadata.redirectTo) ? { redirectTo: metadata.redirectTo } : {}),
    };
    await this.redis.set(this.key(state), payload, STATE_TTL_SECONDS);
    return { state };
  }

  async peekFlow(state: unknown): Promise<OAuthFlow | null> {
    if (typeof state !== 'string' || !STATE_REGEX.test(state)) {
      return null;
    }
    const data = await this.redis.get<OAuthStateData>(this.key(state));
    return data?.flow ?? null;
  }

  async consume(state: unknown, expectedFlow: OAuthFlow | readonly OAuthFlow[]): Promise<OAuthStateData> {
    if (typeof state !== 'string' || !STATE_REGEX.test(state)) {
      throw new UnauthorizedException('Invalid OAuth state');
    }
    const data = await this.redis.getDel<OAuthStateData>(this.key(state));
    const allowed = Array.isArray(expectedFlow) ? expectedFlow.includes(data?.flow as OAuthFlow) : data?.flow === expectedFlow;
    if (!data?.flow || !allowed) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }
    return data;
  }
}
