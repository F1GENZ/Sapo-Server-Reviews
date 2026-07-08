# Phase 01 — Discovery & Feasibility (Sapo facts + sandbox)

**Goal:** Resolve every `‹VERIFY›` before code. Produce a Sapo platform-facts table that unblocks all phases.
**Depends on:** — (hard gate)
**Skills:** `sapo-app`, `sapo-app-feasibility`, `sapo-theme-*` (for storefront exposure).

## Reference (read to know what parity requires)

- Scout report (coupling map).
- `server/src/haravan/haravan.api.ts` (API surface to reproduce), `haravan.service.ts` (auth/webhook/billing),
  `docs/storefront/widget-installation.mdx` (storefront metafield reads).

## Discovery items — each needs: doc link + sandbox observation + `CONFIRMED|ASSUMED|BLOCKED`

### 1. OAuth & identity
- Authorize URL shape `{store}.mysapo.net/admin/oauth/authorize` ‹VERIFY›; params (`client_id`, `scope`,
  `redirect_uri`, `state`, others?).
- Token exchange `POST /admin/oauth/access_token` ‹VERIFY›; request + response fields (access_token,
  refresh_token?, scope, expires?).
- Install-callback **HMAC/signature**: param set, hashed message construction, **sort order** (Sapo likely
  sorted — do NOT assume Haravan's unsorted scheme), header vs query.
- Identity: is there any store/user identifier beyond the store domain? If none → identity = store domain.

### 2. REST Admin API
- Per-store base host; auth header `X-Sapo-Access-Token` ‹VERIFY›.
- Exact paths + response envelopes for: Product (list/count/get), Product Metafield (list/create/update/delete),
  shop/Store Metafield, Store info, Order (list, filters, paging), Webhook (list/create/delete), ScriptTag.
- Pagination model (page vs cursor) + count endpoints.
- Rate limits (leaky-bucket): budget, refill, `429` + `Retry-After` semantics.

### 3. Metafields (D2 — make-or-break)
- Owner types: product + shop supported? `value_type` json/string?
- **Per-value size limit** (informational only — under D4-revised the largest metafield we write is
  `public_summary` ~100 bytes; no chunking anymore).
- **Storefront exposure**: can a Sapo/Bizweb `.bwt` theme read `product.metafields.*` and `shop.metafields.*`?
  (Confirm via `sapo-theme-snippets`/`sapo-theme-product-page` + sandbox theme.)
  <!-- Red Team S2: D4 revised, this is a soft branch, not a block. -->
  **Soft branch:** if `.bwt` reads `product.metafields.reviews.public_summary`, storefront uses SSR badge (mode A);
  if not, widget fetches from `/public/summaries` API (mode B — always built in P13). No user escalation needed.

### 4. Webhooks
- Topic identifiers for product create/update/delete, order create/paid/fulfilled/cancelled, app uninstall,
  store update, and any billing/charge event.
- Signature header + algorithm; payload format (JSON/XML); topic/shop headers.
- Registration endpoint + payload; delivery retry behavior.

### 5. Billing
- App charge / recurring charge model; which event signals active/canceled; how to query current charge.

### 6. Embedded app
- Sapo Embedded App SDK availability; iframe launch params; session-token/identity mechanism for admin.

### 7. ScriptTag
- Resource availability + scope (fallback asset injection if metafields not storefront-exposed).

## Deliverable

`plans/reports/from-scout-to-planner-sapo-platform-facts-verification-report.md` — table:
`Concern | Haravan value | Sapo confirmed value | Doc link | Sandbox note | Status`.
Plus a **D2 verdict** (metafield storefront exposure). Under D4-revised, either outcome ships:
yes → mode A (SSR badge); no → mode B (API-fetched badge, already built).

## Validation

- Sapo **dev/sandbox store only**. No production tokens/PII in notes (skill hard stop). Record request
  IDs/status classes, not bodies. Rotate any secret accidentally pasted.

## Acceptance

- Zero remaining `‹VERIFY›` for Phases 02–07 & 13–14. Each has a source. BLOCKED items have a written workaround.

## Risks / unknowns

- Metafields not storefront-exposed → mode B kicks in (API-fetched badge + ScriptTag config); Postgres always source of truth.
- Sapo value cap < Haravan → retune chunk size or move storefront read fully to API.
- No refresh token → design re-auth UX in Phase 05.
- No billing webhook → poll charge on cron in Phase 07.
