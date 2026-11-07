import type { NextFunction, Request, Response } from 'express';
import { clientFingerprint } from './client-fingerprint';
import type { IngressRateLimitService } from './ingress-rate-limit.service';
import { STORE_DOMAIN_RE } from './public-limits';

export const PUBLIC_RATE_WINDOW_SECONDS = 60;
export const PUBLIC_READ_CLIENT_LIMIT = 900;
export const PUBLIC_WRITE_CLIENT_LIMIT = 120;

const firstString = (value: unknown): string => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' ? candidate.trim().toLowerCase() : '';
};

export const normalizeStoreDomainCandidate = (raw: unknown): string => {
  const text = firstString(raw);
  if (!text) return '';
  return (
    text
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      ?.split('?')[0]
      ?.trim()
      .replace(/\.$/, '') ?? ''
  );
};

export const resolveStoreScope = (req: Request): string | null => {
  const headers = (req.headers ?? {}) as Record<string, unknown>;
  const query = (req.query ?? {}) as Record<string, unknown>;
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const candidates = [
    headers['x-store-domain'],
    headers['x-shop-domain'],
    headers['x-sapo-shop-domain'],
    headers['x-store'],
    headers['x-shop'],
    query.storeDomain,
    query.shopDomain,
    query.store,
    query.shop,
    query.domain,
    body.storeDomain,
    body.shopDomain,
    body.store,
    body.shop,
    body.domain,
  ];
  for (const raw of candidates) {
    const candidate = normalizeStoreDomainCandidate(raw);
    if (candidate && STORE_DOMAIN_RE.test(candidate)) return candidate;
  }
  return null;
};

export const publicRateLimitMiddleware = (rateLimit: IngressRateLimitService) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method === 'OPTIONS') {
      next();
      return;
    }
    try {
      const isRead = req.method === 'GET' || req.method === 'HEAD';
      const clientResult = await rateLimit.check(
        isRead ? 'public-read-client' : 'public-write-client',
        clientFingerprint(req),
        PUBLIC_RATE_WINDOW_SECONDS,
        isRead ? PUBLIC_READ_CLIENT_LIMIT : PUBLIC_WRITE_CLIENT_LIMIT,
      );
      const denied = clientResult.allowed ? null : clientResult;
      if (denied) {
        res.setHeader('Retry-After', String(denied.resetInSeconds));
        res.status(429).json({
          statusCode: 429,
          message: `Rate limit exceeded; retry in ${denied.resetInSeconds}s`,
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
