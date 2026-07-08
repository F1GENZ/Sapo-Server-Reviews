# Phase 06 — Webhook Pipeline

**Goal:** Receive, verify, queue, and process Sapo webhooks idempotently; register them on install.
**Depends on:** 04, 05

## Red Team Hardening (S2) — MUST DO
- **[F2 Critical] Tenant identity from SIGNED sources only + replay guard.** The reference reads tenant from
  unsigned `x-haravan-org-id` header / `req.query.orgid` / body (`haravan.service.ts:1660`), while HMAC covers
  `rawBody` only (`:1607`). Sapo port MUST derive `store_domain` **exclusively from the HMAC-signed body** or
  from a Sapo header that Sapo itself includes in the signature (Phase 01 blocking fact). **Never** trust
  query/other unsigned headers. Also add mandatory replay defense: require Sapo's `delivery-id` + `timestamp`;
  reject stale deliveries (>5 min drift); include `delivery-id` in the idempotency key so replayed-but-retargeted
  events collapse in dedup.
- **[F9 High] Deterministic event-id — no `randomBytes` fallback.** The reference `toEventId` suffixes
  `randomBytes(4)` when no stable delivery id header is present (`webhook-event-store.service.ts:67`) — every
  duplicate delivery becomes a new id and runs again. Make "Sapo emits a stable per-delivery id" a Phase 01
  blocking fact; if yes, map it into `toEventId` as primary + mandatory. If no, replace the random suffix with a
  deterministic hash of `{store, topic, resourceId, occurred_at}` so redeliveries collapse to one id.
- **[F12 High] Monotonic guard on upserts; delete is sticky.** The reference upserts webhook payloads with an
  unconditional `updated_at = EXCLUDED.updated_at` and can resurrect deleted rows
  (`catalog-product-store.service.ts:214-226`). Under BullMQ retry + DLQ replay a stale event can land after a
  newer one and win. Add `WHERE EXCLUDED.updated_at > catalog_products.updated_at` on every webhook-driven
  upsert; make delete sticky against stale updates (`deleted_at IS NULL AND EXCLUDED.updated_at > deleted_at`).
- **[F11 High] Pause queues on background 401 (see Phase 05).** Do NOT let webhook/catalog jobs burn 8 BullMQ
  retries into the DLQ when a store's token has expired. On 401 from Sapo, mark session `needs_reauth`, drain
  and **pause** that store's queue, surface a re-auth prompt.
- **[F19 Med] Distinct webhook secret.** Do NOT reuse the OAuth client secret for webhook HMAC (the reference
  accepts either, `haravan.service.ts:1632`). Require `SAPO_WEBHOOK_SECRET` separately; fail startup if unset.

## Reference

- `haravan.service.ts`: `handleWebhook`, `verifyWebhookHmac`, topic constants + aliases, `getHeaderValue`,
  `extractWebhookOrgid`/`extractWebhookShopDomains`/`resolveOrgidFromWebhookShop`, `extractWebhookResourceId`,
  `processWebhookQueueJob`/`processWebhookEvent`, BullMQ queue setup (`webhook` queue, attempts/backoff/DLQ),
  uninstall + shop-update handlers (`syncAppUninstallWebhook`, `syncShopUpdateWebhook`), audit_logs writes.
- `server/src/haravan/webhook-event-store.service.ts` — **platform-neutral**, port as-is.

## Build (new project)

- `src/platform/sapo/sapo-webhook.service.ts`:
  - `verifySapoSignature(headers, rawBody)` ‹VERIFY› (header + algo per Phase 01; base64/hex; timing-safe).
  - Topic extraction from Sapo header ‹VERIFY› → map Sapo topic → **internal topic constant** (keep stable
    internal names: `products/create|update|delete`, `orders/create|paid|fulfilled|cancelled`,
    `app/uninstalled`, `shop/update`, `app_subscriptions/update`).
  - Identity: resolve **store domain** ONLY from the HMAC-signed body / signature-covered headers (F2) ‹VERIFY›.
    Reject events whose store isn't in the install `known_domains[]` set (F13, Phase 05).
  - `extractResourceId` (product/order id) for idempotency.
  - Content-type branch: JSON default; XML parser if Sapo sends XML ‹VERIFY›.
- `src/platform/sapo/webhook-event-store.service.ts` — ported neutral event store (queued/processing/processed/failed).
- `src/platform/sapo/sapo-webhook.controller.ts` — `GET` verify-challenge (if Sapo uses one) + `POST` receiver;
  needs `rawBody` (configure body parser to retain raw buffer, as reference does).
- Queue: port `webhook` BullMQ queue + worker (runs under `PROCESS_ROLE=worker`), attempts/backoff/DLQ retention.

## Steps

1. Port event store + queue setup (neutral) → prefix `f1genz-sapo:*`.
2. Implement signature verify + tests.
3. Build Sapo→internal topic map (unit-tested table).
4. Implement receiver: verify → resolve store → create queued event → enqueue; fast 200 ack.
5. Implement `processWebhookEvent` dispatch → hand product/order events to domain sync (P08/P09/P10),
   uninstall/shop-update to session cleanup + audit (port), subscription to billing (P07).
6. Register webhooks in post-install automation (P05 hook) via `SapoApiService.createWebhook`.

## Contracts / notes

- Idempotency key from `{store, topic, resourceId, deliveryId?}`; make handlers idempotent.
- Uninstall preserves data (audit-only), mirroring reference `dataPreserved:true`.
- Raw-body capture is mandatory for signature verify — set at bootstrap, not per-route.

## Tests / validation

- Unit: signature verify, topic map (every Sapo topic), resource-id extraction, idempotent replay.
- Sandbox: trigger product update + order create → event queued, processed once, Postgres mirror updated; uninstall
  clears session + writes audit.

## Acceptance

- Webhooks verified, queued, processed exactly-once; registration succeeds on install.

## Risks

- No verify-challenge or different header casing → normalize headers (port `getHeaderValue`).
- XML payloads → add parser; prefer JSON registration if selectable.
