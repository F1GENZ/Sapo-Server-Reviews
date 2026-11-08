import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

export interface SqlStorageLike {
  exec(query: string, ...bindings: unknown[]): {
    toArray(): Array<Record<string, unknown>>;
  };
}

export interface PrismaQueryArgs {
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy?: unknown;
  cursor?: Record<string, unknown>;
  skip?: number;
  take?: number;
  by?: string | string[];
  _count?: boolean | Record<string, unknown>;
  _avg?: Record<string, unknown>;
  _max?: Record<string, unknown>;
  _min?: Record<string, unknown>;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
  skipDuplicates?: boolean;
}

export interface PrismaModelDelegate {
  findUnique(args?: PrismaQueryArgs): Promise<Record<string, unknown> | null>;
  findFirst(args?: PrismaQueryArgs): Promise<Record<string, unknown> | null>;
  findMany(args?: PrismaQueryArgs): Promise<Array<Record<string, unknown>>>;
  count(args?: PrismaQueryArgs): Promise<number>;
  aggregate(args?: PrismaQueryArgs): Promise<Record<string, unknown>>;
  groupBy(args: PrismaQueryArgs): Promise<Array<Record<string, unknown>>>;
  create(args: PrismaQueryArgs): Promise<Record<string, unknown>>;
  createMany(args: PrismaQueryArgs): Promise<{ count: number }>;
  update(args: PrismaQueryArgs): Promise<Record<string, unknown>>;
  updateMany(args: PrismaQueryArgs): Promise<{ count: number }>;
  upsert(args: PrismaQueryArgs): Promise<Record<string, unknown>>;
  delete(args: PrismaQueryArgs): Promise<Record<string, unknown>>;
  deleteMany(args?: PrismaQueryArgs): Promise<{ count: number }>;
}

type ModelConfig = {
  table: string;
  dateFields: string[];
  bigIntFields: string[];
  intFields: string[];
  boolFields: string[];
  jsonFields: string[];
  defaults: Record<string, () => unknown>;
  uniqueKeys: string[][];
  updatedAtType?: 'date' | 'bigint' | 'none';
  createdAtType?: 'date' | 'bigint' | 'none';
};

const SNAKE_TO_CAMEL: Record<string, string> = {
  shop_id: 'shopId',
  store_domain: 'storeDomain',
  product_id: 'productId',
  product_title: 'productTitle',
  product_name: 'productName',
  product_handle: 'productHandle',
  product_image: 'productImage',
  product_type: 'productType',
  review_id: 'reviewId',
  question_id: 'questionId',
  replied_at: 'repliedAt',
  answered_by: 'answeredBy',
  answered_at: 'answeredAt',
  source_raw_json: 'sourceRawJson',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  deleted_at: 'deletedAt',
  raw_payload: 'rawPayload',
  order_id: 'orderId',
  order_code: 'orderCode',
  email_hash: 'emailHash',
  phone_hash: 'phoneHash',
  financial_status: 'financialStatus',
  fulfillment_status: 'fulfillmentStatus',
  cancelled_at: 'cancelledAt',
  refunded_at: 'refundedAt',
  purchased_at: 'purchasedAt',
  hash_version: 'hashVersion',
  source_updated_at: 'sourceUpdatedAt',
  last_error: 'lastError',
  next_attempt_at: 'nextAttemptAt',
  endpoint_id: 'endpointId',
  max_attempts: 'maxAttempts',
  response_status: 'responseStatus',
  delivered_at: 'deliveredAt',
  secret_ciphertext: 'secretCiphertext',
  secret_iv: 'secretIv',
  secret_tag: 'secretTag',
  secret_prefix: 'secretPrefix',
  last_status: 'lastStatus',
  last_delivered_at: 'lastDeliveredAt',
  consecutive_failures: 'consecutiveFailures',
  disabled_reason: 'disabledReason',
};

const cuid = (): string => `c${Date.now().toString(36)}${randomUUID().replace(/-/g, '').slice(0, 16)}`;

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  shop: {
    table: 'Shop',
    dateFields: ['createdAt', 'updatedAt'],
    bigIntFields: [],
    intFields: [],
    boolFields: [],
    jsonFields: [],
    defaults: {},
    uniqueKeys: [['id'], ['storeDomain']],
    createdAtType: 'date',
    updatedAtType: 'date',
  },
  appInstall: {
    table: 'AppInstall',
    dateFields: ['installedAt', 'uninstalledAt', 'webhookRegisteredAt', 'createdAt', 'updatedAt'],
    bigIntFields: [],
    intFields: ['tokenVersion', 'lifecycleGeneration'],
    boolFields: ['featuresUnlocked', 'dataPreserved'],
    jsonFields: ['metadata'],
    defaults: {
      status: () => 'trial',
      accessTokenCiphertext: () => null,
      accessTokenIv: () => null,
      accessTokenTag: () => null,
      featuresUnlocked: () => true,
      tokenVersion: () => 0,
      lifecycleGeneration: () => 0,
      installedAt: () => null,
      uninstalledAt: () => null,
      dataPreserved: () => true,
      webhookRegistrationStatus: () => 'not_configured',
      webhookRegisteredAt: () => null,
      webhookRegistrationError: () => null,
      metadata: () => null,
    },
    uniqueKeys: [['id'], ['shopId'], ['storeDomain']],
    createdAtType: 'date',
    updatedAtType: 'date',
  },
  shopDomain: {
    table: 'ShopDomain',
    dateFields: ['tombstonedAt', 'createdAt', 'updatedAt'],
    bigIntFields: [],
    intFields: [],
    boolFields: ['active'],
    jsonFields: [],
    defaults: {
      kind: () => 'alias',
      active: () => true,
      tombstonedAt: () => null,
      source: () => null,
    },
    uniqueKeys: [['id'], ['shopId', 'domain']],
    createdAtType: 'date',
    updatedAtType: 'date',
  },
  shopBilling: {
    table: 'ShopBilling',
    dateFields: ['expiresAt', 'createdAt', 'updatedAt'],
    bigIntFields: [],
    intFields: [],
    boolFields: ['isActive', 'isPaid'],
    jsonFields: ['payload'],
    defaults: {
      plan: () => 'Free',
      status: () => 'active',
      isActive: () => true,
      isPaid: () => false,
      expiresAt: () => null,
      payload: () => null,
    },
    uniqueKeys: [['id'], ['shopId'], ['storeDomain']],
    createdAtType: 'date',
    updatedAtType: 'date',
  },
  subscriptionSnapshot: {
    table: 'SubscriptionSnapshot',
    dateFields: ['expiresAt', 'syncedAt', 'createdAt', 'updatedAt'],
    bigIntFields: [],
    intFields: [],
    boolFields: ['isActive', 'isPaid'],
    jsonFields: ['payload'],
    defaults: {
      shopId: () => null,
      storeDomain: () => null,
      domain: () => null,
      subscriptionId: () => null,
      plan: () => 'Free',
      isActive: () => false,
      isPaid: () => false,
      expiresAt: () => null,
      syncedAt: () => new Date(),
      payload: () => null,
    },
    uniqueKeys: [['id'], ['correlationKey']],
    createdAtType: 'date',
    updatedAtType: 'date',
  },
  webhookEvent: {
    table: 'WebhookEvent',
    dateFields: ['receivedAt', 'nextRetryAt', 'processedAt', 'createdAt', 'updatedAt'],
    bigIntFields: [],
    intFields: ['attempts', 'maxAttempts', 'lifecycleGeneration'],
    boolFields: [],
    jsonFields: ['payload', 'headers'],
    defaults: {
      shopId: () => null,
      providerEventId: () => null,
      resolvedStoreDomain: () => null,
      resolvedDomain: () => null,
      resourceType: () => null,
      resourceId: () => null,
      payload: () => null,
      headers: () => null,
      status: () => 'received',
      attempts: () => 0,
      maxAttempts: () => 8,
      lastError: () => null,
      receivedAt: () => new Date(),
      nextRetryAt: () => null,
      processedAt: () => null,
      lifecycleGeneration: () => null,
    },
    uniqueKeys: [['id'], ['idempotencyKey']],
    createdAtType: 'date',
    updatedAtType: 'date',
  },
  catalogProduct: {
    table: 'catalog_products',
    dateFields: ['createdAt'],
    bigIntFields: ['deletedAt', 'updatedAt'],
    intFields: [],
    boolFields: ['published'],
    jsonFields: ['rawPayload'],
    defaults: {
      title: () => '',
      handle: () => '',
      image: () => null,
      vendor: () => null,
      productType: () => null,
      tags: () => null,
      status: () => null,
      published: () => null,
      deletedAt: () => null,
      rawPayload: () => null,
      source: () => 'sapo',
      updatedAt: () => BigInt(Date.now()),
    },
    uniqueKeys: [['id'], ['shopId', 'productId']],
    createdAtType: 'date',
    updatedAtType: 'none',
  },
  customerPurchase: {
    table: 'customer_purchases',
    dateFields: ['createdAt'],
    bigIntFields: ['cancelledAt', 'refundedAt', 'purchasedAt', 'sourceUpdatedAt', 'updatedAt'],
    intFields: ['hashVersion'],
    boolFields: [],
    jsonFields: ['rawPayload'],
    defaults: {
      orderCode: () => null,
      emailHash: () => null,
      phoneHash: () => null,
      financialStatus: () => null,
      fulfillmentStatus: () => null,
      cancelledAt: () => null,
      refundedAt: () => null,
      rawPayload: () => null,
      hashVersion: () => 1,
      sourceUpdatedAt: () => null,
      updatedAt: () => BigInt(Date.now()),
    },
    uniqueKeys: [['id'], ['shopId', 'productId', 'orderId']],
    createdAtType: 'date',
    updatedAtType: 'none',
  },
  reviewProduct: {
    table: 'review_products',
    dateFields: [],
    bigIntFields: ['repliedAt', 'createdAt', 'updatedAt'],
    intFields: ['rating'],
    boolFields: ['verified', 'pinned'],
    jsonFields: ['media'],
    defaults: {
      productTitle: () => null,
      productName: () => null,
      productHandle: () => null,
      productImage: () => null,
      email: () => null,
      phone: () => null,
      title: () => null,
      media: () => null,
      status: () => 'pending',
      verified: () => false,
      pinned: () => false,
      reply: () => null,
      repliedAt: () => null,
      sourceRawJson: () => null,
      createdAt: () => BigInt(Date.now()),
      updatedAt: () => BigInt(Date.now()),
    },
    uniqueKeys: [['id'], ['shopId', 'productId', 'reviewId']],
    createdAtType: 'bigint',
    updatedAtType: 'none',
  },
  qnaQuestion: {
    table: 'qna_questions',
    dateFields: [],
    bigIntFields: ['answeredAt', 'createdAt', 'updatedAt'],
    intFields: [],
    boolFields: [],
    jsonFields: [],
    defaults: {
      productTitle: () => null,
      productName: () => null,
      productHandle: () => null,
      productImage: () => null,
      email: () => null,
      phone: () => null,
      answer: () => null,
      answeredBy: () => null,
      status: () => 'pending',
      answeredAt: () => null,
      sourceRawJson: () => null,
      createdAt: () => BigInt(Date.now()),
      updatedAt: () => BigInt(Date.now()),
    },
    uniqueKeys: [['id'], ['shopId', 'productId', 'questionId']],
    createdAtType: 'bigint',
    updatedAtType: 'none',
  },
  metafieldSyncPending: {
    table: 'metafield_sync_pending',
    dateFields: ['nextAttemptAt', 'createdAt', 'updatedAt'],
    bigIntFields: [],
    intFields: ['attempts'],
    boolFields: [],
    jsonFields: [],
    defaults: {
      attempts: () => 0,
      lastError: () => null,
      nextAttemptAt: () => new Date(),
    },
    uniqueKeys: [['id'], ['storeDomain', 'productId']],
    createdAtType: 'date',
    updatedAtType: 'date',
  },
  widgetConfigRevision: {
    table: 'widget_config_revisions',
    dateFields: ['createdAt'],
    bigIntFields: [],
    intFields: [],
    boolFields: [],
    jsonFields: ['config'],
    defaults: {},
    uniqueKeys: [['id']],
    createdAtType: 'date',
    updatedAtType: 'none',
  },
  importRun: {
    table: 'import_runs',
    dateFields: ['createdAt'],
    bigIntFields: [],
    intFields: ['total', 'created', 'updated', 'skipped', 'failed'],
    boolFields: [],
    jsonFields: ['errors'],
    defaults: {
      total: () => 0,
      created: () => 0,
      updated: () => 0,
      skipped: () => 0,
      failed: () => 0,
      errors: () => null,
    },
    uniqueKeys: [['id']],
    createdAtType: 'date',
    updatedAtType: 'none',
  },
  outboundWebhookEndpoint: {
    table: 'outbound_webhook_endpoints',
    dateFields: ['lastDeliveredAt', 'createdAt', 'updatedAt'],
    bigIntFields: [],
    intFields: ['lastStatus', 'consecutiveFailures'],
    boolFields: ['active'],
    jsonFields: ['events'],
    defaults: {
      active: () => true,
      description: () => null,
      secretCiphertext: () => null,
      secretIv: () => null,
      secretTag: () => null,
      secretPrefix: () => null,
      lastStatus: () => null,
      lastError: () => null,
      lastDeliveredAt: () => null,
      consecutiveFailures: () => 0,
      disabledReason: () => null,
    },
    uniqueKeys: [['id']],
    createdAtType: 'date',
    updatedAtType: 'date',
  },
  outboundWebhookDelivery: {
    table: 'outbound_webhook_deliveries',
    dateFields: ['nextAttemptAt', 'deliveredAt', 'createdAt', 'updatedAt'],
    bigIntFields: [],
    intFields: ['attempts', 'maxAttempts', 'responseStatus'],
    boolFields: [],
    jsonFields: ['payload'],
    defaults: {
      status: () => 'pending',
      attempts: () => 0,
      maxAttempts: () => 5,
      nextAttemptAt: () => new Date(),
      responseStatus: () => null,
      lastError: () => null,
      deliveredAt: () => null,
    },
    uniqueKeys: [['id']],
    createdAtType: 'date',
    updatedAtType: 'date',
  },
};

const toDate = (val: unknown): Date | null => {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number' || typeof val === 'bigint') return new Date(Number(val));
  if (typeof val === 'string') {
    const s = val.trim();
    const iso = /Z$|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(' ', 'T')}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? new Date(s) : d;
  }
  return null;
};

const toBigInt = (val: unknown): bigint | null => {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'bigint') return val;
  if (val instanceof Date) return BigInt(val.getTime());
  if (typeof val === 'number') return BigInt(Math.trunc(val));
  if (typeof val === 'string') {
    try {
      return BigInt(val.trim());
    } catch {
      const d = toDate(val);
      return d ? BigInt(d.getTime()) : null;
    }
  }
  return null;
};

const normalizeInputKeys = (raw: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const camel = SNAKE_TO_CAMEL[k] ?? k;
    if (out[camel] === undefined) {
      out[camel] = v;
    }
  }
  return out;
};

const hydrateRow = (cfg: ModelConfig, rawInput: Record<string, unknown>): Record<string, unknown> => {
  const row = normalizeInputKeys(rawInput);
  for (const f of cfg.dateFields) {
    if (f in row) row[f] = toDate(row[f]);
  }
  for (const f of cfg.bigIntFields) {
    if (f in row) row[f] = toBigInt(row[f]);
  }
  for (const f of cfg.intFields) {
    if (f in row && row[f] !== null && row[f] !== undefined) row[f] = Number(row[f]);
  }
  for (const f of cfg.boolFields) {
    if (f in row && row[f] !== null && row[f] !== undefined) row[f] = Boolean(row[f]);
  }
  for (const f of cfg.jsonFields) {
    if (row[f] === Prisma.DbNull || row[f] === Prisma.JsonNull) {
      row[f] = null;
    }
  }
  return row;
};

const serializeRow = (_cfg: ModelConfig, row: Record<string, unknown>): string => {
  const plain: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === Prisma.DbNull || v === Prisma.JsonNull) {
      plain[k] = null;
    } else if (v instanceof Date) {
      plain[k] = v.toISOString();
    } else if (typeof v === 'bigint') {
      plain[k] = v.toString();
    } else {
      plain[k] = v;
    }
  }
  return JSON.stringify(plain);
};

const compareValues = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
};

const valueEquals = (actual: unknown, expected: unknown): boolean => {
  if (expected === Prisma.DbNull || expected === Prisma.JsonNull) return actual === null || actual === undefined;
  if (actual instanceof Date || expected instanceof Date) {
    const da = toDate(actual);
    const db = toDate(expected);
    return da !== null && db !== null && da.getTime() === db.getTime();
  }
  if (typeof actual === 'bigint' || typeof expected === 'bigint') {
    const ba = toBigInt(actual);
    const bb = toBigInt(expected);
    return ba !== null && bb !== null && ba === bb;
  }
  return actual === expected;
};

const matchesFieldCondition = (actual: unknown, cond: unknown): boolean => {
  if (cond === undefined) return true;
  if (cond === null || cond === Prisma.DbNull || cond === Prisma.JsonNull) {
    return actual === null || actual === undefined;
  }
  if (cond instanceof Date || typeof cond !== 'object' || Array.isArray(cond)) {
    return valueEquals(actual, cond);
  }
  const c = cond as Record<string, unknown>;
  const modeInsensitive = c.mode === 'insensitive';
  const normStr = (v: unknown): string => (modeInsensitive ? String(v ?? '').toLowerCase() : String(v ?? ''));

  if ('equals' in c) {
    if (c.equals === null || c.equals === Prisma.DbNull || c.equals === Prisma.JsonNull) {
      if (!(actual === null || actual === undefined)) return false;
    } else if (modeInsensitive) {
      if (actual === null || actual === undefined || normStr(actual) !== normStr(c.equals)) return false;
    } else if (!valueEquals(actual, c.equals)) {
      return false;
    }
  }
  if ('not' in c) {
    if (matchesFieldCondition(actual, c.not)) return false;
  }
  if ('in' in c && Array.isArray(c.in)) {
    if (!c.in.some((item) => valueEquals(actual, item))) return false;
  }
  if ('notIn' in c && Array.isArray(c.notIn)) {
    if (c.notIn.some((item) => valueEquals(actual, item))) return false;
  }
  if ('contains' in c && c.contains !== undefined) {
    if (actual === null || actual === undefined) return false;
    if (!normStr(actual).includes(normStr(c.contains))) return false;
  }
  if ('startsWith' in c && c.startsWith !== undefined) {
    if (actual === null || actual === undefined) return false;
    if (!normStr(actual).startsWith(normStr(c.startsWith))) return false;
  }
  if ('endsWith' in c && c.endsWith !== undefined) {
    if (actual === null || actual === undefined) return false;
    if (!normStr(actual).endsWith(normStr(c.endsWith))) return false;
  }
  if ('gt' in c && c.gt !== undefined) {
    if (actual === null || actual === undefined || compareValues(actual, c.gt) <= 0) return false;
  }
  if ('gte' in c && c.gte !== undefined) {
    if (actual === null || actual === undefined || compareValues(actual, c.gte) < 0) return false;
  }
  if ('lt' in c && c.lt !== undefined) {
    if (actual === null || actual === undefined || compareValues(actual, c.lt) >= 0) return false;
  }
  if ('lte' in c && c.lte !== undefined) {
    if (actual === null || actual === undefined || compareValues(actual, c.lte) > 0) return false;
  }
  return true;
};

const expandCompoundWhere = (cfg: ModelConfig, where: Record<string, unknown> | undefined): Record<string, unknown> => {
  if (!where) return {};
  const expanded: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    const matchedCompound = cfg.uniqueKeys.find((uk) => uk.length > 1 && uk.join('_') === k);
    if (matchedCompound && v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(expanded, v as Record<string, unknown>);
    } else {
      expanded[k] = v;
    }
  }
  return expanded;
};

const matchesWhere = (cfg: ModelConfig, row: Record<string, unknown>, rawWhere?: Record<string, unknown>): boolean => {
  if (!rawWhere) return true;
  const where = expandCompoundWhere(cfg, rawWhere);
  for (const [key, val] of Object.entries(where)) {
    if (val === undefined) continue;
    if (key === 'AND') {
      const list = Array.isArray(val) ? val : [val];
      if (!list.every((sub) => matchesWhere(cfg, row, sub as Record<string, unknown>))) return false;
      continue;
    }
    if (key === 'OR') {
      const list = Array.isArray(val) ? val : [val];
      if (list.length === 0) return false;
      if (!list.some((sub) => matchesWhere(cfg, row, sub as Record<string, unknown>))) return false;
      continue;
    }
    if (key === 'NOT') {
      const list = Array.isArray(val) ? val : [val];
      if (list.some((sub) => matchesWhere(cfg, row, sub as Record<string, unknown>))) return false;
      continue;
    }
    if (!matchesFieldCondition(row[key], val)) return false;
  }
  return true;
};

const sortRows = (rows: Array<Record<string, unknown>>, orderBy?: unknown): Array<Record<string, unknown>> => {
  if (!orderBy) return rows;
  const specs = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Array<Record<string, unknown>>;
  if (specs.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      for (const [field, dirRaw] of Object.entries(spec)) {
        if (!dirRaw) continue;
        const dir =
          typeof dirRaw === 'string'
            ? dirRaw.toLowerCase()
            : typeof (dirRaw as Record<string, unknown>)?.sort === 'string'
              ? String((dirRaw as Record<string, unknown>).sort).toLowerCase()
              : 'asc';
        const cmp = compareValues(a[field], b[field]);
        if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
      }
    }
    return 0;
  });
};

const projectRow = (
  row: Record<string, unknown>,
  select?: Record<string, unknown>,
): Record<string, unknown> => {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(select)) {
    if (v) out[k] = row[k];
  }
  return out;
};

export class PrismaSqliteService {
  readonly shop: PrismaModelDelegate;
  readonly appInstall: PrismaModelDelegate;
  readonly shopDomain: PrismaModelDelegate;
  readonly shopBilling: PrismaModelDelegate;
  readonly subscriptionSnapshot: PrismaModelDelegate;
  readonly webhookEvent: PrismaModelDelegate;
  readonly catalogProduct: PrismaModelDelegate;
  readonly customerPurchase: PrismaModelDelegate;
  readonly reviewProduct: PrismaModelDelegate;
  readonly qnaQuestion: PrismaModelDelegate;
  readonly metafieldSyncPending: PrismaModelDelegate;
  readonly widgetConfigRevision: PrismaModelDelegate;
  readonly importRun: PrismaModelDelegate;
  readonly outboundWebhookEndpoint: PrismaModelDelegate;
  readonly outboundWebhookDelivery: PrismaModelDelegate;

  constructor(private readonly sql: SqlStorageLike) {
    this.initSchema();
    this.shop = this.createDelegate('shop');
    this.appInstall = this.createDelegate('appInstall');
    this.shopDomain = this.createDelegate('shopDomain');
    this.shopBilling = this.createDelegate('shopBilling');
    this.subscriptionSnapshot = this.createDelegate('subscriptionSnapshot');
    this.webhookEvent = this.createDelegate('webhookEvent');
    this.catalogProduct = this.createDelegate('catalogProduct');
    this.customerPurchase = this.createDelegate('customerPurchase');
    this.reviewProduct = this.createDelegate('reviewProduct');
    this.qnaQuestion = this.createDelegate('qnaQuestion');
    this.metafieldSyncPending = this.createDelegate('metafieldSyncPending');
    this.widgetConfigRevision = this.createDelegate('widgetConfigRevision');
    this.importRun = this.createDelegate('importRun');
    this.outboundWebhookEndpoint = this.createDelegate('outboundWebhookEndpoint');
    this.outboundWebhookDelivery = this.createDelegate('outboundWebhookDelivery');
  }

  private initSchema(): void {
    for (const cfg of Object.values(MODEL_CONFIGS)) {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS "${cfg.table}" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "shopId" TEXT,
          "storeDomain" TEXT,
          "productId" TEXT,
          "status" TEXT,
          "createdAt" INTEGER,
          "updatedAt" INTEGER,
          "data" TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS "idx_${cfg.table}_shopId" ON "${cfg.table}" ("shopId");
        CREATE INDEX IF NOT EXISTS "idx_${cfg.table}_storeDomain" ON "${cfg.table}" ("storeDomain");
        CREATE INDEX IF NOT EXISTS "idx_${cfg.table}_shop_product" ON "${cfg.table}" ("shopId", "productId");
      `);
    }
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS "Ephemeral" (
        "key" TEXT PRIMARY KEY NOT NULL,
        "value" TEXT NOT NULL,
        "expiresAt" INTEGER
      );
      CREATE INDEX IF NOT EXISTS "idx_Ephemeral_expiresAt" ON "Ephemeral" ("expiresAt");
    `);
  }

  private loadModelRows(cfg: ModelConfig, rawWhere?: Record<string, unknown>): Array<Record<string, unknown>> {
    const where = expandCompoundWhere(cfg, rawWhere);
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (typeof where.id === 'string') {
      clauses.push('"id" = ?');
      params.push(where.id);
    }
    if (typeof where.shopId === 'string') {
      clauses.push('"shopId" = ?');
      params.push(where.shopId);
    }
    if (typeof where.storeDomain === 'string') {
      clauses.push('"storeDomain" = ?');
      params.push(where.storeDomain);
    }
    if (typeof where.productId === 'string') {
      clauses.push('"productId" = ?');
      params.push(where.productId);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rawRows = this.sql.exec(`SELECT "data" FROM "${cfg.table}" ${whereSql}`, ...params).toArray();
    const hydrated = rawRows.map((r) => hydrateRow(cfg, JSON.parse(String(r.data)) as Record<string, unknown>));
    return hydrated.filter((row) => matchesWhere(cfg, row, rawWhere));
  }

  private saveModelRow(cfg: ModelConfig, row: Record<string, unknown>): void {
    const id = String(row.id);
    const shopId = typeof row.shopId === 'string' ? row.shopId : null;
    const storeDomain = typeof row.storeDomain === 'string' ? row.storeDomain : null;
    const productId = typeof row.productId === 'string' ? row.productId : null;
    const status = typeof row.status === 'string' ? row.status : null;
    const createdAtMs =
      row.createdAt instanceof Date
        ? row.createdAt.getTime()
        : typeof row.createdAt === 'bigint'
          ? Number(row.createdAt)
          : typeof row.createdAt === 'number'
            ? row.createdAt
            : null;
    const updatedAtMs =
      row.updatedAt instanceof Date
        ? row.updatedAt.getTime()
        : typeof row.updatedAt === 'bigint'
          ? Number(row.updatedAt)
          : typeof row.updatedAt === 'number'
            ? row.updatedAt
            : null;
    const data = serializeRow(cfg, row);

    this.sql.exec(
      `INSERT OR REPLACE INTO "${cfg.table}" ("id", "shopId", "storeDomain", "productId", "status", "createdAt", "updatedAt", "data")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      shopId,
      storeDomain,
      productId,
      status,
      createdAtMs,
      updatedAtMs,
      data,
    );
  }

  private buildNewRow(cfg: ModelConfig, dataInput: Record<string, unknown>): Record<string, unknown> {
    const normalized = normalizeInputKeys(dataInput);
    const now = new Date();
    const row: Record<string, unknown> = {
      id: typeof normalized.id === 'string' && normalized.id ? normalized.id : cuid(),
    };
    for (const [k, fn] of Object.entries(cfg.defaults)) {
      row[k] = fn();
    }
    if (cfg.createdAtType === 'date' && normalized.createdAt === undefined) {
      row.createdAt = now;
    } else if (cfg.createdAtType === 'bigint' && normalized.createdAt === undefined) {
      row.createdAt = BigInt(now.getTime());
    }
    if (cfg.updatedAtType === 'date' && normalized.updatedAt === undefined) {
      row.updatedAt = now;
    } else if (cfg.updatedAtType === 'bigint' && normalized.updatedAt === undefined) {
      row.updatedAt = BigInt(now.getTime());
    }
    for (const [k, v] of Object.entries(normalized)) {
      if (v === undefined) continue;
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && 'increment' in (v as Record<string, unknown>)) {
        const inc = Number((v as Record<string, unknown>).increment ?? 0);
        row[k] = Number(row[k] ?? 0) + inc;
      } else {
        row[k] = v;
      }
    }
    return hydrateRow(cfg, row);
  }

  private applyUpdateToRow(
    cfg: ModelConfig,
    existing: Record<string, unknown>,
    updateInput: Record<string, unknown>,
  ): Record<string, unknown> {
    const normalized = normalizeInputKeys(updateInput);
    const updated: Record<string, unknown> = { ...existing };
    for (const [k, v] of Object.entries(normalized)) {
      if (v === undefined) continue;
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && 'increment' in (v as Record<string, unknown>)) {
        const inc = Number((v as Record<string, unknown>).increment ?? 0);
        updated[k] = Number(updated[k] ?? 0) + inc;
      } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && 'decrement' in (v as Record<string, unknown>)) {
        const dec = Number((v as Record<string, unknown>).decrement ?? 0);
        updated[k] = Number(updated[k] ?? 0) - dec;
      } else {
        updated[k] = v;
      }
    }
    if (cfg.updatedAtType === 'date' && normalized.updatedAt === undefined) {
      updated.updatedAt = new Date();
    } else if (cfg.updatedAtType === 'bigint' && normalized.updatedAt === undefined) {
      updated.updatedAt = BigInt(Date.now());
    }
    return hydrateRow(cfg, updated);
  }

  private assertUniqueConstraints(cfg: ModelConfig, candidate: Record<string, unknown>, ignoreId?: string): void {
    const allRows = this.loadModelRows(cfg);
    for (const uk of cfg.uniqueKeys) {
      if (uk.some((f) => candidate[f] === null || candidate[f] === undefined)) continue;
      const conflict = allRows.find(
        (r) => r.id !== ignoreId && uk.every((f) => valueEquals(r[f], candidate[f])),
      );
      if (conflict) {
        throw new Prisma.PrismaClientKnownRequestError(
          `Unique constraint failed on the fields: (${uk.join(', ')})`,
          { code: 'P2002', meta: { target: uk } },
        );
      }
    }
  }

  private async attachIncludes(
    modelName: string,
    row: Record<string, unknown>,
    include?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!include) return row;
    const out = { ...row };
    if (modelName === 'outboundWebhookDelivery' && include.endpoint) {
      out.endpoint = await this.outboundWebhookEndpoint.findUnique({
        where: { id: row.endpointId },
      });
    }
    return out;
  }

  private createDelegate(modelName: string): PrismaModelDelegate {
    const cfg = MODEL_CONFIGS[modelName];
    return {
      findUnique: async (args?: PrismaQueryArgs) => {
        const rows = this.loadModelRows(cfg, args?.where);
        const first = rows[0];
        if (!first) return null;
        const withInc = await this.attachIncludes(modelName, first, args?.include);
        return projectRow(withInc, args?.select);
      },
      findFirst: async (args?: PrismaQueryArgs) => {
        let rows = this.loadModelRows(cfg, args?.where);
        rows = sortRows(rows, args?.orderBy);
        if (typeof args?.skip === 'number' && args.skip > 0) rows = rows.slice(args.skip);
        const first = rows[0];
        if (!first) return null;
        const withInc = await this.attachIncludes(modelName, first, args?.include);
        return projectRow(withInc, args?.select);
      },
      findMany: async (args?: PrismaQueryArgs) => {
        let rows = this.loadModelRows(cfg, args?.where);
        rows = sortRows(rows, args?.orderBy);
        if (args?.cursor && typeof args.cursor.id === 'string') {
          const idx = rows.findIndex((r) => r.id === args.cursor?.id);
          if (idx >= 0) rows = rows.slice(idx);
        }
        if (typeof args?.skip === 'number' && args.skip > 0) rows = rows.slice(args.skip);
        if (typeof args?.take === 'number') rows = rows.slice(0, Math.max(0, args.take));
        const results: Array<Record<string, unknown>> = [];
        for (const r of rows) {
          const withInc = await this.attachIncludes(modelName, r, args?.include);
          results.push(projectRow(withInc, args?.select));
        }
        return results;
      },
      count: async (args?: PrismaQueryArgs) => {
        const rows = this.loadModelRows(cfg, args?.where);
        return rows.length;
      },
      aggregate: async (args?: PrismaQueryArgs) => {
        const rows = this.loadModelRows(cfg, args?.where);
        const res: Record<string, unknown> = {};
        if (args?._count) {
          if (args._count === true) {
            res._count = rows.length;
          } else {
            const countMap: Record<string, number> = {};
            for (const [k, v] of Object.entries(args._count)) {
              if (!v) continue;
              countMap[k] = k === '_all' ? rows.length : rows.filter((r) => r[k] !== null && r[k] !== undefined).length;
            }
            res._count = countMap;
          }
        }
        if (args?._avg) {
          const avgMap: Record<string, number | null> = {};
          for (const [k, v] of Object.entries(args._avg)) {
            if (!v) continue;
            const nums = rows.map((r) => r[k]).filter((val) => typeof val === 'number' || typeof val === 'bigint').map(Number);
            avgMap[k] = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
          }
          res._avg = avgMap;
        }
        if (args?._max) {
          const maxMap: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(args._max)) {
            if (!v) continue;
            const vals = rows.map((r) => r[k]).filter((val) => val !== null && val !== undefined);
            maxMap[k] = vals.length > 0 ? vals.reduce((acc, cur) => (compareValues(cur, acc) > 0 ? cur : acc)) : null;
          }
          res._max = maxMap;
        }
        if (args?._min) {
          const minMap: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(args._min)) {
            if (!v) continue;
            const vals = rows.map((r) => r[k]).filter((val) => val !== null && val !== undefined);
            minMap[k] = vals.length > 0 ? vals.reduce((acc, cur) => (compareValues(cur, acc) < 0 ? cur : acc)) : null;
          }
          res._min = minMap;
        }
        return res;
      },
      groupBy: async (args: PrismaQueryArgs) => {
        const rows = this.loadModelRows(cfg, args?.where);
        const byFields: string[] = Array.isArray(args.by) ? args.by : args.by ? [args.by] : [];
        const buckets = new Map<string, Array<Record<string, unknown>>>();
        for (const r of rows) {
          const key = JSON.stringify(byFields.map((f) => (typeof r[f] === 'bigint' ? r[f].toString() : r[f])));
          const list = buckets.get(key) ?? [];
          list.push(r);
          buckets.set(key, list);
        }
        const out: Array<Record<string, unknown>> = [];
        for (const groupRows of buckets.values()) {
          const sample = groupRows[0];
          const item: Record<string, unknown> = {};
          for (const f of byFields) item[f] = sample[f];
          if (args._count) {
            if (args._count === true) {
              item._count = groupRows.length;
            } else {
              const countMap: Record<string, number> = {};
              for (const [k, v] of Object.entries(args._count)) {
                if (!v) continue;
                countMap[k] = k === '_all' ? groupRows.length : groupRows.filter((r) => r[k] !== null && r[k] !== undefined).length;
              }
              item._count = countMap;
            }
          }
          if (args._avg) {
            const avgMap: Record<string, number | null> = {};
            for (const [k, v] of Object.entries(args._avg)) {
              if (!v) continue;
              const nums = groupRows.map((r) => r[k]).filter((val) => typeof val === 'number' || typeof val === 'bigint').map(Number);
              avgMap[k] = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
            }
            item._avg = avgMap;
          }
          if (args._max) {
            const maxMap: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(args._max)) {
              if (!v) continue;
              const vals = groupRows.map((r) => r[k]).filter((val) => val !== null && val !== undefined);
              maxMap[k] = vals.length > 0 ? vals.reduce((acc, cur) => (compareValues(cur, acc) > 0 ? cur : acc)) : null;
            }
            item._max = maxMap;
          }
          out.push(item);
        }
        return out;
      },
      create: async (args: PrismaQueryArgs) => {
        const data = (args?.data && !Array.isArray(args.data) ? args.data : {}) as Record<string, unknown>;
        const row = this.buildNewRow(cfg, data);
        this.assertUniqueConstraints(cfg, row);
        this.saveModelRow(cfg, row);
        return projectRow(row, args?.select);
      },
      createMany: async (args: PrismaQueryArgs) => {
        const items: Array<Record<string, unknown>> = Array.isArray(args?.data)
          ? args.data
          : args?.data
            ? [args.data]
            : [];
        let count = 0;
        for (const item of items) {
          const row = this.buildNewRow(cfg, item);
          try {
            this.assertUniqueConstraints(cfg, row);
            this.saveModelRow(cfg, row);
            count += 1;
          } catch (err) {
            if (!args?.skipDuplicates) throw err;
          }
        }
        return { count };
      },
      update: async (args: PrismaQueryArgs) => {
        const rows = this.loadModelRows(cfg, args?.where);
        const existing = rows[0];
        if (!existing) {
          throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025' });
        }
        const data = (args?.data && !Array.isArray(args.data) ? args.data : {}) as Record<string, unknown>;
        const updated = this.applyUpdateToRow(cfg, existing, data);
        this.assertUniqueConstraints(cfg, updated, String(existing.id));
        this.saveModelRow(cfg, updated);
        return projectRow(updated, args?.select);
      },
      updateMany: async (args: PrismaQueryArgs) => {
        const rows = this.loadModelRows(cfg, args?.where);
        const data = (args?.data && !Array.isArray(args.data) ? args.data : {}) as Record<string, unknown>;
        for (const existing of rows) {
          const updated = this.applyUpdateToRow(cfg, existing, data);
          this.saveModelRow(cfg, updated);
        }
        return { count: rows.length };
      },
      upsert: async (args: PrismaQueryArgs) => {
        const rows = this.loadModelRows(cfg, args?.where);
        const existing = rows[0];
        if (existing) {
          const updated = this.applyUpdateToRow(cfg, existing, args?.update ?? {});
          this.assertUniqueConstraints(cfg, updated, String(existing.id));
          this.saveModelRow(cfg, updated);
          return projectRow(updated, args?.select);
        }
        const created = this.buildNewRow(cfg, args?.create ?? {});
        this.assertUniqueConstraints(cfg, created);
        this.saveModelRow(cfg, created);
        return projectRow(created, args?.select);
      },
      delete: async (args: PrismaQueryArgs) => {
        const rows = this.loadModelRows(cfg, args?.where);
        const existing = rows[0];
        if (!existing) {
          throw new Prisma.PrismaClientKnownRequestError('Record to delete does not exist.', { code: 'P2025' });
        }
        this.sql.exec(`DELETE FROM "${cfg.table}" WHERE "id" = ?`, String(existing.id));
        return projectRow(existing, args?.select);
      },
      deleteMany: async (args?: PrismaQueryArgs) => {
        const rows = this.loadModelRows(cfg, args?.where);
        for (const r of rows) {
          this.sql.exec(`DELETE FROM "${cfg.table}" WHERE "id" = ?`, String(r.id));
        }
        return { count: rows.length };
      },
    };
  }

  async $queryRaw<T = unknown>(stringsOrSql: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T> {
    const queryText =
      stringsOrSql instanceof Prisma.Sql
        ? stringsOrSql.strings.join('?')
        : Array.isArray(stringsOrSql)
          ? stringsOrSql.join('?')
          : String(stringsOrSql);
    const params = stringsOrSql instanceof Prisma.Sql ? stringsOrSql.values : values;

    if (queryText.includes('UPDATE "AppInstall"') && queryText.includes('jsonb_set')) {
      const key = String(params[0] ?? '');
      const patchRaw = String(params[2] ?? '{}');
      const storeDomain = String(params[3] ?? '');
      const patch = JSON.parse(patchRaw) as Record<string, unknown>;
      const existing = await this.appInstall.findUnique({ where: { storeDomain } });
      if (!existing) return [] as unknown as T;
      const meta =
        existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
          ? { ...(existing.metadata as Record<string, unknown>) }
          : {};
      const currentSub =
        meta[key] && typeof meta[key] === 'object' && !Array.isArray(meta[key])
          ? { ...(meta[key] as Record<string, unknown>) }
          : {};
      const mergedSub = { ...currentSub, ...patch };
      meta[key] = mergedSub;
      await this.appInstall.update({
        where: { id: existing.id },
        data: { metadata: meta, updatedAt: new Date() },
      });
      return [{ value: mergedSub }] as unknown as T;
    }

    if (queryText.includes('FROM "review_products"') && queryText.toLowerCase().includes('to_char')) {
      const shopId = String(params[0] ?? '');
      const sinceMs = toBigInt(params[1]) ?? 0n;
      const rows = await this.reviewProduct.findMany({
        where: { shopId, createdAt: { gte: sinceMs } },
      });
      const counts = new Map<string, number>();
      const vnOffsetMs = 7 * 3600 * 1000;
      for (const r of rows) {
        const ms = Number(r.createdAt ?? 0n) + vnOffsetMs;
        const day = new Date(ms).toISOString().slice(0, 10);
        counts.set(day, (counts.get(day) ?? 0) + 1);
      }
      return Array.from(counts.entries()).map(([day, count]) => ({ day, count })) as unknown as T;
    }

    if (queryText.includes('COUNT(DISTINCT "order_id")') && queryText.includes('"customer_purchases"')) {
      const shopId = String(params[0] ?? '');
      const rows = await this.customerPurchase.findMany({ where: { shopId } });
      const distinct = new Set(rows.map((r: Record<string, unknown>) => String(r.orderId ?? '')).filter(Boolean));
      return [{ orders: BigInt(distinct.size) }] as unknown as T;
    }

    if (queryText.includes('SELECT 1')) {
      this.sql.exec('SELECT 1').toArray();
      return [{ '?column?': 1 }] as unknown as T;
    }

    return [] as unknown as T;
  }

  async $executeRaw(_stringsOrSql: TemplateStringsArray | Prisma.Sql, ..._values: unknown[]): Promise<number> {
    return 1;
  }

  async $transaction<T>(arg: Array<Promise<unknown>> | ((tx: PrismaSqliteService) => Promise<T>)): Promise<T> {
    if (Array.isArray(arg)) {
      return (await Promise.all(arg)) as unknown as T;
    }
    return await arg(this);
  }

  async ping(): Promise<boolean> {
    try {
      this.sql.exec('SELECT 1').toArray();
      return true;
    } catch {
      return false;
    }
  }

  importDatabaseDump(dump: Record<string, Array<Record<string, unknown>>>, reset = false): Record<string, number> {
    if (reset) {
      for (const cfg of Object.values(MODEL_CONFIGS)) {
        this.sql.exec(`DELETE FROM "${cfg.table}"`);
      }
    }
    const tableToModel = new Map<string, string>();
    for (const [modelName, cfg] of Object.entries(MODEL_CONFIGS)) {
      tableToModel.set(cfg.table, modelName);
      tableToModel.set(modelName, modelName);
    }
    const counts: Record<string, number> = {};
    for (const [tableName, rows] of Object.entries(dump)) {
      const modelName = tableToModel.get(tableName);
      if (!modelName || !Array.isArray(rows)) continue;
      const cfg = MODEL_CONFIGS[modelName];
      let inserted = 0;
      for (const rawRow of rows) {
        const hydrated = this.buildNewRow(cfg, rawRow);
        this.saveModelRow(cfg, hydrated);
        inserted += 1;
      }
      counts[cfg.table] = inserted;
    }
    return counts;
  }

  exportDatabaseStats(): Record<string, { count: number; idsJoined: string }> {
    const out: Record<string, { count: number; idsJoined: string }> = {};
    for (const cfg of Object.values(MODEL_CONFIGS)) {
      const rows = this.sql.exec(`SELECT "id" FROM "${cfg.table}" ORDER BY "id" ASC`).toArray();
      out[cfg.table] = {
        count: rows.length,
        idsJoined: rows.map((r) => String(r.id)).join(','),
      };
    }
    return out;
  }
}
