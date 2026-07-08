# Phase 04 — Sapo REST API Client

**Goal:** A Sapo-native REST client covering every resource the domain layer needs, with throttle + 429 retry.
**Depends on:** 01 (facts), 03 (foundation)

## Red Team Hardening (S2) — MUST DO
- **[F3 Critical] Per-store rate limiter, not the reference singleton.** The reference limiter is process-global
  for one central host (`haravan.api.ts:121-127,232`); Sapo meters **per store**. (a) Key throttle/cooldown state
  **per store domain** (`Map<storeDomain, LimiterState>`), so one store's 429 never stalls others. (b) The
  api + worker are separate processes — a shared per-store token bucket must live in **Redis** (or pin all a
  store's calls to one process), else the two limiters never coordinate → retry storms on install backfill.
  Add Phase 01 fact: is Sapo's limit per-store or per-app?
- **[F16 Med] `SapoStoreClient` binds `storeDomain` at construction; NEVER cache the token in it.** Instantiate
  one bound client per request/job from resolved identity so no method can forget the store. Fetch the token via
  `resolveAccessToken(storeDomain)` **at call time** — do not bind a token into a long-lived client (the
  reference deliberately passes `token` per call, `haravan.api.ts:283-286`, to avoid refresh/uninstall staleness).

## Reference

- `server/src/haravan/haravan.api.ts` — full method surface + concurrency limiter + 429 retry to reproduce:
  `getProducts`, `getProductsCount`, `getProduct`, product metafields CRUD, `getMetafields`/`createMetafield`/
  `updateMetafield`/`deleteMetafield` (shop/page/product), `getShop`, `getOrders`, `createWebhook`,
  `assertNumericId`, `normalizeMetafieldPayload`, `buildQueryParams`, redaction in `buildAxiosErrorDetail`.

## Build (new project `src/platform/sapo/`)

- `sapo.api.ts` — `SapoApiService`:
  - Client factory: **per-store base** `https://{storeDomain}/admin` ‹VERIFY›, header `X-Sapo-Access-Token` ‹VERIFY›.
    Because base is per-store, methods take `storeDomain` (or a bound client) — thread it through.
  - Methods mirroring the reference surface, with Sapo paths/envelopes ‹VERIFY›: products list/count/get,
    product metafields CRUD, store-owned metafield CRUD, store info, orders (filters+paging), webhook create/list/delete,
    scriptTag create/list/delete (Phase 13).
  - Port the concurrency limiter + cooldown + `runBackground()` + 429 `Retry-After` handling; retune constants
    to Sapo leaky-bucket ‹VERIFY›.
  - Keep `assertNumericId` path-traversal guard; keep secret redaction in error detail.
- `sapo.types.ts` — response/DTO types (Product, Metafield, Order, Webhook, ScriptTag, Store) per Sapo shapes.

## Steps

1. Define `sapo.types.ts` from Phase 01 response samples.
2. Implement client factory keyed on `storeDomain` + token.
3. Port methods one-by-one; adjust query param names + pagination (page vs cursor ‹VERIFY›).
4. Port throttle/retry; set `SAPO_MAX_CONCURRENT`/`SAPO_MIN_INTERVAL_MS` config.
5. Unit-test each method against mocked Sapo responses.

## Contracts / notes

- Never expose the token to storefront JS (server-side only).
- Metafield `value_type` mapping (json/string) per Phase 01; keep `normalizeMetafieldPayload` behavior.
- If Sapo paginates by cursor, replace the reference page-loop in `getAllMetafieldPages` accordingly.

## Tests / validation

- Unit: success + 4xx/5xx + 429-retry + numeric-id guard + payload redaction, per method.
- Contract test: metafield create→get→update→delete round-trip against sandbox (guarded, opt-in).

## Acceptance

- All reference API capabilities have a Sapo equivalent method (or a documented BLOCKED with workaround).

## Risks

- Per-store base URL is the biggest structural change vs Haravan's central host → make `storeDomain` a required
  arg on every call; add a typed `SapoStoreClient` wrapper to avoid forgetting it.
- Cursor pagination differences → encapsulate paging in one helper.
