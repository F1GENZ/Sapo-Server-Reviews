export type AppStatus =
  | 'trial'
  | 'active'
  | 'free'
  | 'canceled'
  | 'expired'
  | 'needs_reinstall'
  | 'declined'
  | 'uninstalled';

export type WebhookEventStatus = 'received' | 'processing' | 'processed' | 'failed' | 'ignored';
export type WebhookRegistrationStatus = 'not_configured' | 'pending' | 'registered' | 'degraded' | 'failed';
export type DomainKind = 'primary' | 'mysapo' | 'custom' | 'alias';

export interface Shop {
  id: string;
  storeDomain: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppInstall {
  id: string;
  shopId: string;
  storeDomain: string;
  status: AppStatus;
  accessTokenCiphertext: string | null;
  accessTokenIv: string | null;
  accessTokenTag: string | null;
  featuresUnlocked: boolean;
  tokenVersion: number;
  lifecycleGeneration: number;
  installedAt: Date | null;
  uninstalledAt: Date | null;
  dataPreserved: boolean;
  webhookRegistrationStatus: WebhookRegistrationStatus;
  webhookRegisteredAt: Date | null;
  webhookRegistrationError: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShopDomain {
  id: string;
  shopId: string;
  storeDomain: string;
  domain: string;
  kind: DomainKind;
  active: boolean;
  tombstonedAt: Date | null;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionSnapshot {
  id: string;
  shopId: string | null;
  correlationKey: string;
  storeDomain: string | null;
  domain: string | null;
  subscriptionId: string | null;
  payloadHash: string;
  status: string;
  plan: string;
  isActive: boolean;
  isPaid: boolean;
  expiresAt: Date | null;
  syncedAt: Date;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEvent {
  id: string;
  shopId: string | null;
  providerEventId: string | null;
  idempotencyKey: string;
  topic: string;
  normalizedTopic: string;
  resolvedStoreDomain: string | null;
  resolvedDomain: string | null;
  resourceType: string | null;
  resourceId: string | null;
  payloadHash: string;
  payload: unknown;
  headers: unknown;
  status: WebhookEventStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  receivedAt: Date;
  nextRetryAt: Date | null;
  processedAt: Date | null;
  lifecycleGeneration: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CatalogProduct {
  id: string;
  shopId: string;
  productId: string;
  title: string;
  handle: string;
  image: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string | null;
  status: string | null;
  published: boolean | null;
  deletedAt: bigint | null;
  rawPayload: unknown;
  source: string;
  createdAt: Date;
  updatedAt: bigint;
}

export interface CustomerPurchase {
  id: string;
  shopId: string;
  productId: string;
  orderId: string;
  orderCode: string | null;
  emailHash: string | null;
  phoneHash: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  cancelledAt: bigint | null;
  refundedAt: bigint | null;
  purchasedAt: bigint;
  rawPayload: unknown;
  hashVersion: number;
  sourceUpdatedAt: bigint | null;
  createdAt: Date;
  updatedAt: bigint;
}

export interface ReviewProduct {
  id: string;
  shopId: string;
  productId: string;
  productTitle: string | null;
  productName: string | null;
  productHandle: string | null;
  productImage: string | null;
  reviewId: string;
  rating: number;
  content: string;
  author: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  media: unknown;
  status: string;
  verified: boolean;
  pinned: boolean;
  reply: string | null;
  repliedAt: bigint | null;
  sourceRawJson: string | null;
  createdAt: bigint;
  updatedAt: bigint;
}

export interface QnaQuestion {
  id: string;
  shopId: string;
  productId: string;
  productTitle: string | null;
  productName: string | null;
  productHandle: string | null;
  productImage: string | null;
  questionId: string;
  question: string;
  author: string;
  email: string | null;
  phone: string | null;
  answer: string | null;
  answeredBy: string | null;
  status: string;
  answeredAt: bigint | null;
  sourceRawJson: string | null;
  createdAt: bigint;
  updatedAt: bigint;
}

export interface MetafieldSyncPending {
  id: string;
  storeDomain: string;
  productId: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WidgetConfigRevision {
  id: string;
  shopId: string;
  storeDomain: string;
  config: unknown;
  createdAt: Date;
}

export interface ImportRun {
  id: string;
  shopId: string;
  storeDomain: string;
  kind: string;
  mode: string;
  format: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: unknown;
  createdAt: Date;
}

export interface OutboundWebhookEndpoint {
  id: string;
  shopId: string;
  storeDomain: string;
  url: string;
  events: unknown;
  active: boolean;
  description: string | null;
  secretCiphertext: string | null;
  secretIv: string | null;
  secretTag: string | null;
  secretPrefix: string | null;
  lastStatus: number | null;
  lastError: string | null;
  lastDeliveredAt: Date | null;
  consecutiveFailures: number;
  disabledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutboundWebhookDelivery {
  id: string;
  endpointId: string;
  storeDomain: string;
  event: string;
  payload: unknown;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  responseStatus: number | null;
  lastError: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  endpoint?: OutboundWebhookEndpoint;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ModelDelegate<T = any> {
  findUnique(args?: unknown): Promise<T | null>;
  findFirst(args?: unknown): Promise<T | null>;
  findMany(args?: unknown): Promise<T[]>;
  count(args?: unknown): Promise<number>;
  create(args: unknown): Promise<T>;
  createMany(args: unknown): Promise<{ count: number }>;
  update(args: unknown): Promise<T>;
  updateMany(args: unknown): Promise<{ count: number }>;
  upsert(args: unknown): Promise<T>;
  delete(args: unknown): Promise<T>;
  deleteMany(args?: unknown): Promise<{ count: number }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aggregate(args: unknown): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  groupBy(
    args: { _count: true } & Record<string, unknown>,
  ): Promise<
    Array<
      T & {
        _count: number;
        _avg: Record<string, number | null>;
        _max: Record<string, string | null>;
      }
    >
  >;
  groupBy(
    args: Record<string, unknown>,
  ): Promise<
    Array<
      T & {
        _count: { id: number; _all: number } & Record<string, number>;
        _avg: Record<string, number | null>;
        _max: Record<string, string | null>;
      }
    >
  >;
}

export class PrismaClient {
  readonly shop!: ModelDelegate<Shop>;
  readonly appInstall!: ModelDelegate<AppInstall>;
  readonly shopDomain!: ModelDelegate<ShopDomain>;
  readonly subscriptionSnapshot!: ModelDelegate<SubscriptionSnapshot>;
  readonly webhookEvent!: ModelDelegate<WebhookEvent>;
  readonly catalogProduct!: ModelDelegate<CatalogProduct>;
  readonly customerPurchase!: ModelDelegate<CustomerPurchase>;
  readonly reviewProduct!: ModelDelegate<ReviewProduct>;
  readonly qnaQuestion!: ModelDelegate<QnaQuestion>;
  readonly metafieldSyncPending!: ModelDelegate<MetafieldSyncPending>;
  readonly widgetConfigRevision!: ModelDelegate<WidgetConfigRevision>;
  readonly importRun!: ModelDelegate<ImportRun>;
  readonly outboundWebhookEndpoint!: ModelDelegate<OutboundWebhookEndpoint>;
  readonly outboundWebhookDelivery!: ModelDelegate<OutboundWebhookDelivery>;

  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
  async $transaction<T>(fnOrOps: ((tx: PrismaClient) => Promise<T>) | Array<Promise<unknown>>): Promise<T> {
    if (typeof fnOrOps === 'function') return fnOrOps(this);
    return (await Promise.all(fnOrOps)) as unknown as T;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async $queryRaw<T = any>(_query: TemplateStringsArray | Prisma.Sql, ..._values: unknown[]): Promise<T> {
    return [] as unknown as T;
  }
  async $executeRaw(_query: TemplateStringsArray | Prisma.Sql, ..._values: unknown[]): Promise<number> {
    return 1;
  }
}

export namespace Prisma {
  export type InputJsonValue = unknown;
  export type InputJsonObject = Record<string, unknown>;
  export type JsonValue = unknown;
  export type JsonObject = Record<string, unknown>;
  export type PrismaPromise<T> = Promise<T>;
  export type ReviewProductWhereInput = Record<string, unknown>;
  export type ReviewProductOrderByWithRelationInput = Record<string, unknown> | Array<Record<string, unknown>>;
  export type QnaQuestionWhereInput = Record<string, unknown>;
  export type QnaQuestionOrderByWithRelationInput = Record<string, unknown> | Array<Record<string, unknown>>;
  export type WebhookEventWhereInput = Record<string, unknown>;
  export type CustomerPurchaseWhereInput = Record<string, unknown>;
  export type AppInstallUpdateManyMutationInput = Record<string, unknown>;
  export type AppInstallWhereInput = Record<string, unknown>;
  export type CatalogProductWhereInput = Record<string, unknown>;
  export type TransactionClient = PrismaClient;
  export const QueryMode = {
    default: 'default',
    insensitive: 'insensitive',
  } as const;
  export const DbNull = Symbol.for('Prisma.DbNull');
  export const JsonNull = Symbol.for('Prisma.JsonNull');

  export class Sql {
    constructor(
      public readonly strings: readonly string[],
      public readonly values: readonly unknown[],
    ) {}
  }

  export const sql = (strings: TemplateStringsArray, ...values: unknown[]): Sql =>
    new Sql(Array.from(strings), values);

  export const empty = new Sql([''], []);
  export const raw = (text: string): Sql => new Sql([text], []);
  export const join = (values: unknown[], separator = ','): Sql => {
    const strings = ['', ...new Array(Math.max(0, values.length - 1)).fill(separator), ''];
    return new Sql(strings, values);
  };

  export class PrismaClientKnownRequestError extends Error {
    code: string;
    meta?: Record<string, unknown>;
    constructor(message: string, opts: { code: string; clientVersion?: string; meta?: Record<string, unknown> }) {
      super(message);
      this.code = opts.code;
      this.meta = opts.meta;
    }
  }
}
