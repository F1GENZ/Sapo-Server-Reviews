import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { HmacVerifierService } from './hmac-verifier.service';
import { normalizeShopDomain, ShopDomainService } from './shop-domain.service';
import { SubscriptionService } from './subscription.service';
import { UninstallService } from './uninstall.service';
import { normalizeWebhookTopic } from './webhook-topic-normalizer';

export type RawBodyRequest = {
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
  rawBody?: Buffer;
};

const SENSITIVE_HEADER_REGEX = /^(authorization|cookie|set-cookie|x-forwarded-|cf-access-|cf-connecting-ip|x-real-ip)/i;

const asString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0].trim();
  return null;
};

const getHeader = (headers: Record<string, unknown>, names: string[]): string | undefined => {
  const normalized = new Map(Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  for (const name of names) {
    const value = normalized.get(name.toLowerCase());
    const text = asString(value);
    if (text) return text;
  }
  return undefined;
};

const payloadHash = (payload: unknown): string =>
  createHash('sha256').update(JSON.stringify(payload || {})).digest('hex');

const redactHeaders = (headers: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(headers || {}).filter(([key]) => !SENSITIVE_HEADER_REGEX.test(key)));

@Injectable()
export class WebhookService {
  private readonly db: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hmacVerifier: HmacVerifierService,
    private readonly shopDomains: ShopDomainService,
    private readonly subscriptions: SubscriptionService,
    private readonly uninstallService: UninstallService,
  ) {
    this.db = prisma as any;
  }

  verifyChallenge(query: Record<string, unknown>, expectedToken: string): string {
    const token = asString(query['hub.verify_token']);
    const challenge = asString(query['hub.challenge']);
    if (!expectedToken || token !== expectedToken || !challenge) {
      throw new BadRequestException('Invalid webhook challenge');
    }
    return challenge;
  }

  private getPayload(body: unknown): Record<string, unknown> {
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  }

  private compatibilityStoreDomain(input: RawBodyRequest): string | null {
    return (
      getHeader(input.headers, ['x-sapo-store-domain', 'x-sapo-store']) ||
      asString(input.query.storeDomain) ||
      asString(input.query.store_domain)
    );
  }

  private payloadStoreDomain(payload: Record<string, unknown>): string | null {
    return (
      asString(payload.storeDomain) ||
      asString(payload.store_domain)
    );
  }

  private async storeDomainFromDomains(input: RawBodyRequest, payload: Record<string, unknown>): Promise<{
    storeDomain: string | null;
    domain: string | null;
  }> {
    const domains = this.shopDomains.collectDomains(
      payload,
      {
        shop: input.query.shop,
        shop_domain: input.query.shop_domain,
        header_shop_domain: getHeader(input.headers, [
          'x-sapo-shop-domain',
          'x-shop-domain',
          'x-sapo-shop',
          'x-shop',
          'x-sapo-domain',
        ]),
      },
    );
    for (const domain of domains) {
      const storeDomain = await this.shopDomains.resolveStoreDomain(domain);
      if (storeDomain) return { storeDomain, domain };
    }
    return { storeDomain: null, domain: domains[0] || null };
  }

  private async resolveIdentity(input: RawBodyRequest, payload: Record<string, unknown>, topic: string): Promise<{
    storeDomain: string | null;
    domain: string | null;
  }> {
    const payloadStoreDomain = this.payloadStoreDomain(payload);
    const compatibilityStoreDomain = this.compatibilityStoreDomain(input);
    const domainIdentity = await this.storeDomainFromDomains(input, payload);

    if (payloadStoreDomain && domainIdentity.domain && !domainIdentity.storeDomain && topic !== 'app/charge' && topic !== 'app/uninstalled') {
      throw new BadRequestException('Webhook domain is not mapped to an active install');
    }
    if (payloadStoreDomain && domainIdentity.storeDomain && payloadStoreDomain !== domainIdentity.storeDomain) {
      throw new BadRequestException('Webhook payload/domain storeDomain mismatch');
    }

    const resolvedStoreDomain = domainIdentity.storeDomain || payloadStoreDomain;
    if (compatibilityStoreDomain && resolvedStoreDomain && compatibilityStoreDomain !== resolvedStoreDomain) {
      throw new BadRequestException('Webhook compatibility storeDomain mismatch');
    }

    return { storeDomain: resolvedStoreDomain, domain: domainIdentity.domain };
  }

  private buildIdempotencyKey(input: {
    providerEventId?: string;
    topic: string;
    storeDomain?: string | null;
    domain?: string | null;
    hash: string;
  }): string {
    const identity = input.storeDomain ? `store:${input.storeDomain}` : `domain:${normalizeShopDomain(input.domain || '')}`;
    if (input.providerEventId) return `provider:${input.topic}:${identity}:${input.providerEventId}`;
    return createHash('sha256').update(`${input.topic}:${identity}:${input.hash}`).digest('hex');
  }

  async handle(input: RawBodyRequest): Promise<Record<string, unknown>> {
    const signature = getHeader(input.headers, [
      'x-sapo-hmacsha256',
      'x-sapo-hmac-sha256',
      'x-sapo-hmac',
    ]);
    this.hmacVerifier.verifyWebhookBody(input.rawBody || Buffer.alloc(0), signature);

    const rawTopic = getHeader(input.headers, ['x-sapo-topic', 'x-sapo-webhook-topic']);
    const normalizedTopic = normalizeWebhookTopic(rawTopic);
    const payload = this.getPayload(input.body);
    const identity = await this.resolveIdentity(input, payload, normalizedTopic);

    if (normalizedTopic !== 'app/charge' && !identity.storeDomain && normalizedTopic !== 'app/uninstalled') {
      throw new BadRequestException('Missing webhook storeDomain');
    }
    if (normalizedTopic === 'app/uninstalled' && !identity.storeDomain) {
      identity.storeDomain = this.payloadStoreDomain(payload) || null;
    }

    const hash = payloadHash(payload);
    const providerEventId = getHeader(input.headers, ['x-sapo-webhook-id', 'x-sapo-id', 'x-request-id']);
    const idempotencyKey = this.buildIdempotencyKey({
      providerEventId,
      topic: normalizedTopic,
      storeDomain: identity.storeDomain,
      domain: identity.domain,
      hash,
    });

    let event: { id: string; status: string } | null = null;
    try {
      event = await this.db.webhookEvent.create({
        data: {
          providerEventId,
          idempotencyKey,
          topic: rawTopic || 'unknown',
          normalizedTopic,
          resolvedStoreDomain: identity.storeDomain,
          resolvedDomain: identity.domain,
          payloadHash: hash,
          payload,
          headers: redactHeaders(input.headers),
          status: 'received',
        },
        select: { id: true, status: true },
      });
    } catch (error) {
      const existing = await this.db.webhookEvent.findUnique({
        where: { idempotencyKey },
        select: { id: true, status: true },
      }).catch(() => null);
      if (existing && ['received', 'processing'].includes(String(existing.status))) {
        // Winner already holds the idempotency key and is mid-flight — do not run again.
        return { ok: true, inProgress: true, eventId: existing.id, topic: normalizedTopic };
      } else if (existing && String(existing.status) === 'failed') {
        await this.db.webhookEvent.update({
          where: { id: existing.id },
          data: { status: 'received', lastError: null, nextRetryAt: null },
        }).catch(() => undefined);
        event = { id: String(existing.id), status: 'received' };
      } else if (existing) {
        return { ok: true, duplicate: true, eventId: existing.id, topic: normalizedTopic };
      } else {
        throw error;
      }
    }

    if (!event) throw new Error('Webhook event was not created');

    try {
      await this.db.webhookEvent.update({ where: { id: event.id }, data: { status: 'processing', attempts: { increment: 1 } } });
      let result: Record<string, unknown> = { ok: true, ignored: true, topic: normalizedTopic };
      if (normalizedTopic === 'app/charge') {
        const snapshot = this.subscriptions.buildSnapshot(payload, {
          ...(identity.storeDomain ? { storeDomain: identity.storeDomain } : {}),
          ...(identity.domain ? { domain: identity.domain } : {}),
        });
        await this.subscriptions.saveSnapshot(snapshot);
        const applied = await this.subscriptions.applySnapshotToInstall(snapshot);
        result = {
          ok: true,
          topic: normalizedTopic,
          storeDomain: applied.storeDomain || snapshot.storeDomain,
          subscription: snapshot.status,
          installUpdated: applied.updated,
        };
      } else if (normalizedTopic === 'app/uninstalled' && identity.storeDomain) {
        result = await this.uninstallService.uninstall(identity.storeDomain, payload);
      } else if (normalizedTopic === 'shop/update' && identity.storeDomain) {
        for (const domain of this.shopDomains.collectDomains(payload)) {
          const resolved = await this.shopDomains.resolveStoreDomain(domain);
          if (resolved === identity.storeDomain) await this.shopDomains.saveMapping(identity.storeDomain, domain);
        }
        result = { ok: true, topic: normalizedTopic, storeDomain: identity.storeDomain };
      } else if (normalizedTopic.startsWith('products/') && identity.storeDomain) {
        // Phase 08: catalog sync will consume these events
        result = { ok: true, topic: normalizedTopic, storeDomain: identity.storeDomain, queued: true };
      } else if (normalizedTopic.startsWith('orders/') && identity.storeDomain) {
        // Phase 08: order sync will consume these events
        result = { ok: true, topic: normalizedTopic, storeDomain: identity.storeDomain, queued: true };
      }
      await this.db.webhookEvent.update({
        where: { id: event.id },
        data: { status: result.ignored ? 'ignored' : 'processed', processedAt: new Date(), lastError: null, nextRetryAt: null },
      });
      return { ...result, eventId: event.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook processing failed';
      await this.db.webhookEvent.update({
        where: { id: event.id },
        data: { status: 'failed', lastError: message, nextRetryAt: new Date(Date.now() + 120_000) },
      });
      throw error;
    }
  }
}
