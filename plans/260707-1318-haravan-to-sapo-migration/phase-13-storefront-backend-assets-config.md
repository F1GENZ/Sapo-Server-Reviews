# Phase 13 — Storefront Backend (assets + config injection)

**Goal:** Serve the storefront widget bundle, publish store config (apiUrl + store domain), register asset injection.
**Depends on:** 04, 05, 09

## Red Team Hardening (S2) — MUST DO
- **[F4 D4 revised] Storefront metafield writes are `public_summary`-only (product-owned) + `f1genz.config`
  (store-owned).** No chunk/data_chunk writes exist to sync from Postgres.
- **[F13 High] CORS + config broadcast covers `known_domains[]`.** Publish `f1genz.config` under the canonical
  `store_domain`; if `.bwt` alt-domain reads are needed, resolve at Phase 01. CORS `STOREFRONT_ALLOWED_ORIGINS`
  must be derived from install `known_domains[]` (F13/Phase 05), not just the canonical.
- **[F17 Med] Public endpoints go through the ported `main.ts` allowlist middleware** (Phase 03), never through
  the bare origin reflector. Do not set `credentials:true` on `/public/*` endpoints — they do not need cookies.

## Reference

- `server/src/storefront/{storefront-asset.controller.ts, storefront.module.ts}` — serves `/storefront/f1genz-storefront.{js,css}`.
- `server/storefront/snippets/f1genz-storefront.{js,css}` (bundle) + `server/scripts/copy-storefront-assets.js` (build copy).
- `haravan.service.ts` `writeStorefrontConfig()` — shop metafield `f1genz.config` = `{apiUrl, orgid}`.
- Widget runtime host resolution + `f1genz.config` reads: `docs/storefront/widget-installation.mdx`.
- Public read endpoints: `public-review.controller.ts`, `public-qna.controller.ts`, `public-media.controller.ts`,
  `common/public-cors.ts`.

## Build (new project)

- Port `storefront/*` asset controller + module + `copy-storefront-assets.js` build step (server `build` script).
- Port the widget bundle `storefront/snippets/*` (widget code adapted in P14).
- `writeStorefrontConfig(storeDomain)` on `SapoAuthService`/storefront service:
  <!-- Red Team S2: D4 revised — public_summary only + store config; badge fallback via API. -->
  - Write **store metafield** `f1genz.config` = `{apiUrl, storeDomain}` via `SapoApiService` (namespace/key per Phase 01).
  - Product review data uses `public_summary` (F4/D4) written from Phase 09; no chunk syncing.
- `GET /public/summaries?product_ids=` batched endpoint — **always build** (fallback for D2 = no metafield
  exposure). Reads Postgres `public_summary` view (already source of truth); aggressively cache (short TTL).

## Steps

1. Port asset controller (correct content-type, cache headers, CORS to store origins).
2. Implement `writeStorefrontConfig` for the chosen D2 path; run in post-install automation (P05) + ops resync (P12).
3. Always add batched `GET /public/summaries` endpoint (feeds mode B badge + Q&A widget summary needs).
4. Confirm public review/Q&A endpoints are CORS-open to Sapo store domains.

## Contracts / notes

- Widget host resolution order (keep): `window.__F1GENZ_STOREFRONT_CONFIG.apiUrl` → aliases → `data-api-url` →
  script origin → warn. This makes Path B viable with no theme metafield.
- Config value carries **store domain** (not orgid) — update the widget attribute names in P14.

## Tests / validation

- Unit: `writeStorefrontConfig` idempotency (skip if unchanged, port reference behavior); ScriptTag registration
  (used by mode B loader); `/public/summaries` batching + cache headers.
- Sandbox: assets served + reachable from store origin; config metafield/ScriptTag present after install.

## Acceptance

- Storefront can discover the API host + store identity and load the bundle on a Sapo store (either path).

## Risks

- CORS/origin mismatch for `*.mysapo.net` + custom domains → derive allowed origins from install data + config.
- Batched-summary endpoint must be cache-friendly to avoid rate issues on large listings.
