// Sapo REST Admin API types
// Covers the subset of the Sapo API used by this application.

// ── Product ──────────────────────────────────────────────────────────

export interface SapoProductVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  position: number;
  compare_at_price: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  created_at: string;
  updated_at: string;
  barcode: string | null;
  inventory_quantity: number;
  weight: number;
  weight_unit: string;
  grams: number;
  taxable: boolean;
  requires_shipping: boolean;
  fulfillment_service: string;
  inventory_policy: string;
  inventory_management: string | null;
}

export interface SapoProductImage {
  id: number;
  product_id: number;
  position: number;
  src: string;
  alt: string | null;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
  variant_ids: number[];
}

export interface SapoProductOption {
  id: number;
  product_id: number;
  name: string;
  position: number;
  values: string[];
}

export interface SapoProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  published_scope: string;
  template_suffix: string | null;
  tags: string;
  variants: SapoProductVariant[];
  images: SapoProductImage[];
  options: SapoProductOption[];
}

export interface GetProductsParams {
  page?: number;
  limit?: number;
  title?: string;
  vendor?: string;
  handle?: string;
  product_type?: string;
  collection_id?: number;
  created_at_min?: string;
  created_at_max?: string;
  updated_at_min?: string;
  updated_at_max?: string;
  published_at_min?: string;
  published_at_max?: string;
  published_status?: 'published' | 'unpublished' | 'any';
  fields?: string;
  ids?: string;
  since_id?: number;
}

export interface GetProductsCountParams {
  vendor?: string;
  product_type?: string;
  collection_id?: number;
  created_at_min?: string;
  created_at_max?: string;
  updated_at_min?: string;
  updated_at_max?: string;
  published_at_min?: string;
  published_at_max?: string;
  published_status?: 'published' | 'unpublished' | 'any';
}

// ── Metafield ────────────────────────────────────────────────────────

/**
 * Sapo only supports value_type "string" and "integer".
 * When the logical value is a JSON object, serialize it with
 * JSON.stringify and use value_type "string".
 */
export type SapoMetafieldValueType = 'string' | 'integer';

export interface SapoMetafield {
  id: number;
  namespace: string;
  key: string;
  value: string | number;
  value_type: SapoMetafieldValueType;
  owner_id: number;
  owner_resource: string;
  created_at: string;
  updated_at: string;
  description?: string;
}

export type SapoMetafieldOwnerResource = 'shop' | 'product' | 'collection' | 'order' | 'customer';

export interface SapoMetafieldCreatePayload {
  namespace: string;
  key: string;
  value: string | number;
  value_type: SapoMetafieldValueType;
  owner_id?: number;
  owner_resource?: SapoMetafieldOwnerResource;
  description?: string;
}

export interface SapoMetafieldUpdatePayload {
  namespace?: string;
  value?: string | number;
  value_type?: SapoMetafieldValueType;
  description?: string;
}

export function normalizeMetafieldPayload(
  payload: SapoMetafieldCreatePayload | SapoMetafieldUpdatePayload,
): SapoMetafieldCreatePayload | SapoMetafieldUpdatePayload {
  const value = payload.value;
  if (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return {
      ...payload,
      value: JSON.stringify(value),
      value_type: 'string',
    };
  }
  return payload;
}

// ── Order ────────────────────────────────────────────────────────────

export interface SapoOrderLineItem {
  id: number;
  variant_id: number;
  product_id: number;
  title: string;
  name: string;
  price: string;
  quantity: number;
  sku: string;
  vendor: string;
}

export interface SapoOrderCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
}

export interface SapoOrder {
  id: number;
  order_number: number;
  name: string;
  email: string;
  financial_status: string;
  fulfillment_status: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  currency: string;
  line_items: SapoOrderLineItem[];
  customer: SapoOrderCustomer;
  note: string | null;
  tags: string;
  source_name: string;
  source_url: string | null;
}

export interface GetOrdersParams {
  page?: number;
  limit?: number;
  status?: 'open' | 'closed' | 'cancelled' | 'any';
  financial_status?: 'pending' | 'authorized' | 'paid' | 'partially_paid' | 'refunded' | 'partially_refunded' | 'voided';
  fulfillment_status?: 'shipped' | 'partial' | 'unshipped' | 'any';
  created_at_min?: string;
  created_at_max?: string;
  updated_at_min?: string;
  updated_at_max?: string;
  processed_at_min?: string;
  processed_at_max?: string;
  fields?: string;
  ids?: string;
  since_id?: number;
}

// ── Webhook ──────────────────────────────────────────────────────────

export interface SapoWebhook {
  id: number;
  topic: string;
  address: string;
  format: string;
  created_at: string;
  updated_at: string;
}

// ── ScriptTag ────────────────────────────────────────────────────────

export interface SapoScriptTag {
  id: number;
  src: string;
  event: string;
  display_scope: string;
  created_at: string;
  updated_at: string;
}

// ── Shop ─────────────────────────────────────────────────────────────

export interface SapoShop {
  id: number;
  name: string;
  domain: string;
  email: string;
  address1: string;
  city: string;
  province: string;
  country: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
  currency: string;
  timezone: string;
  myshopify_domain?: string;
}

// ── OAuth ────────────────────────────────────────────────────────────

export interface OAuthTokenPayload {
  access_token: string;
}

// ── API List Wrappers ────────────────────────────────────────────────

export interface SapoListResponse<T> {
  [key: string]: T[];
}

export interface SapoCountResponse {
  count: number;
}

// ── Internal helpers ─────────────────────────────────────────────────

export type RunMode = 'foreground' | 'background';

/**
 * Runtime config for API rate limiting, resolved per call.
 */
export interface SapoRateLimitConfig {
  maxConcurrent: number;
  minIntervalMs: number;
}

export interface LimiterState {
  inflight: number;
  waitQueue: Array<{ resolve: () => void }>;
  cooldownUntil: number;
  nextRequestAt: number;
}
