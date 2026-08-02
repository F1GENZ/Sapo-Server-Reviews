import { Inject, Injectable, Logger } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common/exceptions';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';
import type {
  GetOrdersParams,
  GetProductsCountParams,
  GetProductsParams,
  OAuthTokenPayload,
  RunMode,
  SapoListResponse,
  SapoMetafield,
  SapoMetafieldCreatePayload,
  SapoMetafieldUpdatePayload,
  SapoOrder,
  SapoProduct,
  SapoScriptTag,
  SapoShop,
  SapoWebhook,
} from './sapo.types';
import { normalizeMetafieldPayload } from './sapo.types';

const NUMERIC_ID_REGEX = /^\d{1,20}$/;
const METAFIELD_PAGE_LIMIT = 250;
const METAFIELD_MAX_PAGES = 20;
const DEFAULT_RETRY_AFTER_SECONDS = 2;
const MAX_RETRIES = 5;

const parseRetryAfterHeader = (headers: Headers): number => {
  const value = headers.get('retry-after');
  if (!value) return DEFAULT_RETRY_AFTER_SECONDS;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_RETRY_AFTER_SECONDS;
};

const assertNumericId = (value: string, label: string): void => {
  if (!NUMERIC_ID_REGEX.test(value)) {
    throw new BadRequestException(`Invalid ${label}: must be numeric`);
  }
};

interface PerStoreLimiter {
  foreground: { inflight: number; waitQueue: Array<() => void>; cooldownUntil: number };
  background: { inflight: number; waitQueue: Array<() => void>; cooldownUntil: number; nextRequestAt: number };
}

@Injectable()
export class SapoApiService {
  private readonly logger = new Logger(SapoApiService.name);
  private readonly limiters = new Map<string, PerStoreLimiter>();

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  // ─── Per-store limiter ──────────────────────────────────────────

  private limiterFor(storeDomain: string): PerStoreLimiter {
    let limiter = this.limiters.get(storeDomain);
    if (!limiter) {
      limiter = {
        foreground: { inflight: 0, waitQueue: [], cooldownUntil: 0 },
        background: { inflight: 0, waitQueue: [], cooldownUntil: 0, nextRequestAt: 0 },
      };
      this.limiters.set(storeDomain, limiter);
    }
    return limiter;
  }

  private acquireSlot(storeDomain: string, bg: boolean): Promise<void> {
    const limiter = this.limiterFor(storeDomain);
    const state = bg ? limiter.background : limiter.foreground;
    const max = bg ? 1 : this.env.SAPO_API_MAX_CONCURRENT;

    if (state.inflight < max) {
      state.inflight++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      state.waitQueue.push(() => { state.inflight++; resolve(); });
    });
  }

  private releaseSlot(storeDomain: string, bg: boolean): void {
    const limiter = this.limiterFor(storeDomain);
    const state = bg ? limiter.background : limiter.foreground;
    state.inflight = Math.max(0, state.inflight - 1);
    state.waitQueue.shift()?.();
  }

  private extendCooldown(storeDomain: string, bg: boolean, delayMs: number): void {
    const limiter = this.limiterFor(storeDomain);
    const state = bg ? limiter.background : limiter.foreground;
    state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + delayMs);
  }

  private async waitForCooldown(storeDomain: string, bg: boolean): Promise<void> {
    const limiter = this.limiterFor(storeDomain);
    const bgState = limiter.background;
    const fgState = limiter.foreground;
    const until = bg
      ? Math.max(fgState.cooldownUntil, bgState.cooldownUntil)
      : fgState.cooldownUntil;
    const delay = until - Date.now();
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  private async waitForBackgroundWindow(storeDomain: string): Promise<void> {
    const limiter = this.limiterFor(storeDomain);
    const state = limiter.background;
    const interval = this.env.SAPO_API_MIN_INTERVAL_MS;
    if (interval <= 0) return;
    const now = Date.now();
    const scheduledAt = Math.max(now, state.nextRequestAt);
    state.nextRequestAt = scheduledAt + interval;
    const delay = scheduledAt - now;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  private async throttledRequest<T>(storeDomain: string, bg: boolean, fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      await this.waitForCooldown(storeDomain, bg);
      if (bg) await this.waitForBackgroundWindow(storeDomain);
      await this.acquireSlot(storeDomain, bg);
      try {
        return await fn();
      } catch (error: unknown) {
        if (error instanceof ResponseError && error.status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = parseRetryAfterHeader(error.headers);
          const delay = Math.max(retryAfter, 1) * 1000 + attempt * 500;
          this.extendCooldown(storeDomain, bg, delay);
          this.logger.warn(`Rate limited store=${storeDomain} attempt=${attempt + 1}/${MAX_RETRIES} delay=${delay}ms`);
          attempt++;
        } else {
          throw error;
        }
      } finally {
        this.releaseSlot(storeDomain, bg);
      }
    }
  }

  runBackground<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  // ─── HTTP helpers ───────────────────────────────────────────────

  private buildUrl(storeDomain: string, path: string, params?: URLSearchParams): string {
    const qs = params?.toString();
    return `https://${storeDomain}/admin${path}${qs ? '?' + qs : ''}`;
  }

  private buildQueryParams(record: Record<string, string | number | boolean | null | undefined>): URLSearchParams {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined || value === '') continue;
      params.append(key, String(value));
    }
    return params;
  }

  private async fetch(storeDomain: string, accessToken: string, bg: boolean, path: string, init: RequestInit = {}): Promise<Response> {
    return this.throttledRequest(storeDomain, bg, async () => {
      const url = this.buildUrl(storeDomain, path);
      const res = await fetch(url, {
        ...init,
        headers: {
          'X-Sapo-Access-Token': accessToken,
          Accept: 'application/json',
          ...init.headers,
        },
      });
      if (!res.ok) {
        const err = new ResponseError(res.status, res.headers);
        throw err;
      }
      return res;
    });
  }

  // ─── OAuth ──────────────────────────────────────────────────────

  async exchangeCode(code: string, storeDomain: string): Promise<OAuthTokenPayload> {
    const params = new URLSearchParams({
      code,
      client_id: this.env.SAPO_CLIENT_ID,
      client_secret: this.env.SAPO_CLIENT_SECRET,
    });
    const url = `https://${storeDomain}/admin/oauth/access_token`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`Sapo token exchange failed: ${res.status}`);
    return res.json() as Promise<OAuthTokenPayload>;
  }

  // ─── Shop ───────────────────────────────────────────────────────

  async getShop(storeDomain: string, accessToken: string): Promise<SapoShop> {
    const res = await this.fetch(storeDomain, accessToken, false, '/store.json');
    const payload = await res.json() as { store?: SapoShop; shop?: SapoShop };
    const store = payload.store ?? payload.shop;
    if (!store) throw new BadRequestException('Failed to fetch store info');
    return store;
  }

  // ─── Products ───────────────────────────────────────────────────

  async getProducts(storeDomain: string, accessToken: string, params: GetProductsParams = {}): Promise<SapoProduct[]> {
    const qp = this.buildQueryParams(params as Record<string, string | number | boolean | null | undefined>);
    const path = `/products.json${qp.toString() ? '?' + qp.toString() : ''}`;
    const res = await this.fetch(storeDomain, accessToken, false, path);
    const payload = await res.json() as SapoListResponse<SapoProduct>;
    const key = Object.keys(payload).find((k) => Array.isArray(payload[k]));
    return key ? payload[key] : [];
  }

  async getProductsCount(storeDomain: string, accessToken: string, params: GetProductsCountParams = {}): Promise<number> {
    const qp = this.buildQueryParams(params as Record<string, string | number | boolean | null | undefined>);
    const path = `/products/count.json${qp.toString() ? '?' + qp.toString() : ''}`;
    const res = await this.fetch(storeDomain, accessToken, false, path);
    const payload = await res.json() as { count?: number };
    if (typeof payload.count !== 'number' || payload.count < 0) {
      throw new BadRequestException('Failed to fetch products count');
    }
    return payload.count;
  }

  async getProduct(storeDomain: string, accessToken: string, productId: string): Promise<SapoProduct> {
    assertNumericId(productId, 'productId');
    const res = await this.fetch(storeDomain, accessToken, false, `/products/${productId}.json`);
    const payload = await res.json() as { product?: SapoProduct };
    if (!payload.product) throw new BadRequestException('Failed to fetch product');
    return payload.product;
  }

  // ─── Product Metafields ─────────────────────────────────────────

  async getProductMetafields(storeDomain: string, accessToken: string, productId: string, namespace?: string): Promise<SapoMetafield[]> {
    assertNumericId(productId, 'productId');
    const metafields = await this.getAllMetafieldPages(
      storeDomain, accessToken,
      (page, limit) => `/products/${productId}/metafields.json?page=${page}&limit=${limit}`,
    );
    return namespace ? metafields.filter((m) => m.namespace === namespace) : metafields;
  }

  async createProductMetafield(
    storeDomain: string, accessToken: string, productId: string,
    metafield: { namespace: string; key: string; value: string | number; value_type: string },
  ): Promise<SapoMetafield> {
    assertNumericId(productId, 'productId');
    const url = this.buildUrl(storeDomain, `/products/${productId}/metafields.json`);
    const res = await this.throttledRequest(storeDomain, false, async () => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'X-Sapo-Access-Token': accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ metafield }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        throw new BadRequestException({ message: 'Sapo create product metafield failed', status: r.status, detail });
      }
      return r;
    });
    const payload = await res.json() as { metafield?: SapoMetafield };
    if (!payload.metafield) throw new BadRequestException('Failed to create product metafield');
    return payload.metafield;
  }

  async updateProductMetafield(
    storeDomain: string, accessToken: string, productId: string, metafieldId: string,
    metafield: { value: string | number; value_type?: string },
  ): Promise<SapoMetafield> {
    assertNumericId(productId, 'productId');
    assertNumericId(metafieldId, 'metafieldId');
    const url = this.buildUrl(storeDomain, `/products/${productId}/metafields/${metafieldId}.json`);
    const res = await this.throttledRequest(storeDomain, false, async () => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'X-Sapo-Access-Token': accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ metafield }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        throw new BadRequestException({ message: 'Sapo update product metafield failed', status: r.status, detail });
      }
      return r;
    });
    const payload = await res.json() as { metafield?: SapoMetafield };
    if (!payload.metafield) throw new BadRequestException('Failed to update product metafield');
    return payload.metafield;
  }

  async deleteProductMetafield(storeDomain: string, accessToken: string, productId: string, metafieldId: string): Promise<void> {
    assertNumericId(productId, 'productId');
    assertNumericId(metafieldId, 'metafieldId');
    await this.fetch(storeDomain, accessToken, false, `/products/${productId}/metafields/${metafieldId}.json`, { method: 'DELETE' });
  }

  // ─── Generic Metafields (shop-level) ────────────────────────────

  async getMetafields(storeDomain: string, accessToken: string, ownerResource: string, ownerId?: string): Promise<SapoMetafield[]> {
    const params = new URLSearchParams();
    params.set('metafield[owner_resource]', ownerResource);
    if (ownerId) params.set('metafield[owner_id]', ownerId);
    return this.getAllMetafieldPages(storeDomain, accessToken, (page, limit) => `/metafields.json?${params.toString()}&page=${page}&limit=${limit}`);
  }

  async createMetafield(storeDomain: string, accessToken: string, payload: SapoMetafieldCreatePayload): Promise<SapoMetafield> {
    const normalized = normalizeMetafieldPayload(payload) as SapoMetafieldCreatePayload;
    const url = this.buildUrl(storeDomain, '/metafields.json');
    const res = await this.throttledRequest(storeDomain, false, async () => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'X-Sapo-Access-Token': accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ metafield: normalized }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        throw new BadRequestException({ message: 'Sapo create metafield failed', status: r.status, detail });
      }
      return r;
    });
    const p = await res.json() as { metafield?: SapoMetafield };
    if (!p.metafield) throw new BadRequestException('Failed to create metafield');
    return p.metafield;
  }

  async updateMetafield(storeDomain: string, accessToken: string, metafieldId: string, payload: SapoMetafieldUpdatePayload): Promise<SapoMetafield> {
    assertNumericId(metafieldId, 'metafieldId');
    const normalized = normalizeMetafieldPayload(payload) as SapoMetafieldUpdatePayload;
    const url = this.buildUrl(storeDomain, `/metafields/${metafieldId}.json`);
    const res = await this.throttledRequest(storeDomain, false, async () => {
      const r = await fetch(url, {
        method: 'PUT',
        headers: { 'X-Sapo-Access-Token': accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ metafield: normalized }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        throw new BadRequestException({ message: 'Sapo update metafield failed', status: r.status, detail });
      }
      return r;
    });
    const p = await res.json() as { metafield?: SapoMetafield };
    if (!p.metafield) throw new BadRequestException('Failed to update metafield');
    return p.metafield;
  }

  async deleteMetafield(storeDomain: string, accessToken: string, metafieldId: string): Promise<void> {
    assertNumericId(metafieldId, 'metafieldId');
    await this.fetch(storeDomain, accessToken, false, `/metafields/${metafieldId}.json`, { method: 'DELETE' });
  }

  private async getAllMetafieldPages(
    storeDomain: string, accessToken: string, buildPath: (page: number, limit: number) => string,
    config: { limit?: number; maxPages?: number } = {},
  ): Promise<SapoMetafield[]> {
    const limit = Math.max(1, config.limit ?? METAFIELD_PAGE_LIMIT);
    const maxPages = Math.max(1, config.maxPages ?? METAFIELD_MAX_PAGES);
    const collected: SapoMetafield[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const path = buildPath(page, limit);
      const res = await this.fetch(storeDomain, accessToken, false, path);
      const payload = await res.json() as { metafields?: SapoMetafield[] };
      if (!Array.isArray(payload.metafields)) break;
      collected.push(...payload.metafields);
      if (payload.metafields.length < limit) break;
    }
    return collected;
  }

  // ─── Orders ─────────────────────────────────────────────────────

  async getOrders(storeDomain: string, accessToken: string, params: GetOrdersParams = {}): Promise<SapoOrder[]> {
    const qp = this.buildQueryParams(params as Record<string, string | number | boolean | null | undefined>);
    const path = `/orders.json${qp.toString() ? '?' + qp.toString() : ''}`;
    const res = await this.fetch(storeDomain, accessToken, false, path);
    const payload = await res.json() as SapoListResponse<SapoOrder>;
    const key = Object.keys(payload).find((k) => Array.isArray(payload[k]));
    return key ? payload[key] : [];
  }

  // ─── Webhooks ───────────────────────────────────────────────────

  async getWebhooks(storeDomain: string, accessToken: string): Promise<SapoWebhook[]> {
    const res = await this.fetch(storeDomain, accessToken, false, '/webhooks.json');
    const payload = await res.json() as { webhooks?: SapoWebhook[] };
    return payload.webhooks ?? [];
  }

  async createWebhook(storeDomain: string, accessToken: string, topic: string, address: string): Promise<SapoWebhook | null> {
    try {
      const url = this.buildUrl(storeDomain, '/webhooks.json');
      const res = await this.throttledRequest(storeDomain, false, async () => {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'X-Sapo-Access-Token': accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
        });
        if (!r.ok && r.status !== 409 && r.status !== 422) {
          throw new BadRequestException(`Webhook create failed: ${r.status}`);
        }
        return r;
      });
      if (res.status === 409 || res.status === 422) {
        this.logger.warn(`Webhook may already exist: topic=${topic}`);
        return null;
      }
      const payload = await res.json() as { webhook?: SapoWebhook };
      return payload.webhook ?? null;
    } catch (error) {
      this.logger.error(`Sapo createWebhook failed topic=${topic}`, error);
      throw error;
    }
  }

  async deleteWebhook(storeDomain: string, accessToken: string, webhookId: string): Promise<void> {
    assertNumericId(webhookId, 'webhookId');
    await this.fetch(storeDomain, accessToken, false, `/webhooks/${webhookId}.json`, { method: 'DELETE' });
  }

  // ─── ScriptTags ─────────────────────────────────────────────────

  async getScriptTags(storeDomain: string, accessToken: string): Promise<SapoScriptTag[]> {
    const res = await this.fetch(storeDomain, accessToken, false, '/script_tags.json');
    const payload = await res.json() as { script_tags?: SapoScriptTag[] };
    return payload.script_tags ?? [];
  }

  async createScriptTag(storeDomain: string, accessToken: string, src: string): Promise<SapoScriptTag> {
    const url = this.buildUrl(storeDomain, '/script_tags.json');
    const res = await this.throttledRequest(storeDomain, false, async () => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'X-Sapo-Access-Token': accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ script_tag: { src, event: 'onload' } }),
      });
      if (!r.ok) throw new BadRequestException(`ScriptTag create failed: ${r.status}`);
      return r;
    });
    const payload = await res.json() as { script_tag?: SapoScriptTag };
    if (!payload.script_tag) throw new BadRequestException('Failed to create script tag');
    return payload.script_tag;
  }

  async deleteScriptTag(storeDomain: string, accessToken: string, scriptTagId: string): Promise<void> {
    assertNumericId(scriptTagId, 'scriptTagId');
    await this.fetch(storeDomain, accessToken, false, `/script_tags/${scriptTagId}.json`, { method: 'DELETE' });
  }
}

class ResponseError extends Error {
  constructor(public readonly status: number, public readonly headers: Headers) {
    super(`HTTP ${status}`);
  }
}
