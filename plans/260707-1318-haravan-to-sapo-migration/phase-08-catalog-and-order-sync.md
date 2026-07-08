# Phase 08 — Catalog & Order Sync

**Goal:** Populate Postgres product catalog + purchase mirror for a Sapo store (install backfill + webhook deltas).
**Depends on:** 04, 05

## Red Team Hardening (S2) — MUST DO
- **[F3 Critical] Serialize / stagger the post-install burst per store** — instead of
  `Promise.allSettled([subscribeWebhooks, syncRecentOrders, writeStorefrontConfig])` firing concurrently
  (reference `haravan.service.ts:2344-2348`), sequence them **or** gate them behind the per-store rate limiter
  from Phase 04 (F3). The worker also drains catalog-sync at the same time → uncoordinated bursts against a
  single store's leaky bucket.
- **[F12 High] Catalog upserts MUST be monotonic.** Add `WHERE EXCLUDED.updated_at > catalog_products.updated_at`
  on every webhook-driven catalog upsert (reference is unconditional, `catalog-product-store.service.ts:214-226`).
  Delete stays sticky: a stale update landing after `products/delete` MUST NOT resurrect the row. Same guard
  applies to purchase mirror rows.

## Reference

- `server/src/catalog/{catalog-product-store.service.ts, catalog.module.ts}` — product mirror in Postgres,
  paged catalog sync job (`catalog-sync` BullMQ queue in `haravan.service.ts`: `CatalogSyncJobPayload`,
  `enqueueCatalogSync`, `queueAutoCatalogSyncIfDue`, resume/full modes).
- `server/src/purchase/{purchase-store.service.ts, purchase.module.ts}` + `purchase-store.service.spec.ts` —
  order→purchase mirror (`syncOrder`, verified-buyer data).
- `haravan.service.ts`: `syncRecentOrders`/`syncRecentOrdersWithToken` (paged orders, 403 handling), post-install enqueue.

## Build (new project)

- `src/catalog/*` — port stores + `catalog-sync` queue/worker; product fetch via `SapoApiService.getProducts`
  (Sapo paging). Keyed by store domain.
- `src/purchase/*` — port order mirror; `getOrders` via Sapo (filters/paging ‹VERIFY›). Map Sapo order fields
  (line items, customer email/phone, financial/fulfillment status) → existing purchase schema.
- Wire into P05 post-install automation + P06 webhook deltas (`products/*`, `orders/*`).

## Steps

1. Port catalog store + sync queue; swap product fetch to Sapo; adapt field mapping (id/title/handle/image/vendor/sku).
2. Port purchase store; map Sapo order → purchase rows; keep verified-buyer matching (email/phone) used by reviews.
3. Wire install backfill (bounded pages) + webhook incremental updates.
4. Preserve throttling via `runBackground()` for bulk sync.

## Contracts / notes

- `review_products`/purchase tables keyed by `shop_id` = store domain.
- Order sync must tolerate missing scope → surface a clear "reinstall with order permission" error (port 403 message).
- Bounded backfill (page size + max pages from config) to respect Sapo rate limits.

## Tests / validation

- Unit: product mapping, order→purchase mapping, resume/full sync state, page-limit stop.
- Sandbox: install → catalog rows appear; create order → purchase row appears (webhook + backfill paths).

## Acceptance

- Catalog + purchase mirrors populate for a Sapo store via both backfill and webhooks; verified-buyer lookups work.

## Risks

- Sapo order field names differ (customer/line-item/status) → isolate mapping; cover with fixtures from Phase 01 samples.
- Rate limits on large catalogs → keep background concurrency low; resume on failure.
