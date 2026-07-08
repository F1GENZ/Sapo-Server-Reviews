# Phase 03 — Server Foundation & Shared Infra

**Goal:** Port the platform-neutral backbone: config, Redis, Postgres+schema, common utils/guards/pipes/CORS,
and the store-domain identity type. No Sapo API calls yet.
**Depends on:** 02

## Red Team Hardening (S2) — MUST DO
- **[F17 Med] Port the REAL CORS allowlist gate — not just the permissive reflector.** `public-cors.ts` reflects
  arbitrary `Origin` with `Allow-Credentials: true` (`public-cors.ts:12`); it is only safe in the reference
  because the actual allowlist gate lives in `main.ts` middleware (`isStorefrontOrigin`/`isPublicStorefrontPath`,
  `main.ts:137,166`). Add explicit Build items for **both**: (a) port the `main.ts` origin-allowlist middleware
  retuned to `.mysapo.net` + configured custom domains, (b) **invert the default to fail-closed**
  (`ALLOW_CUSTOM_STOREFRONT_ORIGINS` defaults `false` in code, not just `.env`), (c) drop `credentials:true`
  on public endpoints that do not need credentials.
- **[F19 Med] Enforce distinct secrets at bootstrap.** `.env` schema (typed getters) MUST require:
  `APP_SESSION_SECRET` (JWT), `SAPO_CLIENT_SECRET` (OAuth), `SAPO_WEBHOOK_SECRET` (webhook HMAC), all distinct
  and non-empty. Fail startup if any is missing or two are equal. No fallback chains (reference collapses these,
  `haravan.service.ts:459`).

## Reference

- `server/src/redis/redis.{module,service}.ts`
- `server/src/database/database.{module,service}.ts` + `server/DATABASE.md` (tables + URL resolution order)
- `server/src/common/{public-cors.ts, guards/shop-auth.guard.ts, pipes/numeric-id.pipe.ts, utils/{queue-job-id.ts, sanitize.ts}}`
- `server/src/main.ts`, `worker.ts`, `app.module.ts`, `worker.module.ts`

## Build (new project)

- `src/redis/*` — port as-is (ioredis client, get/set/del/setNx/scanKeys). Prefix `f1genz-sapo:*`.
- `src/database/*` — port; keep URL resolution order (Supabase pooler → DATABASE_URL → host parts) and
  `DB_MIGRATE_ON_STARTUP`. <!-- Updated: Validation Session 1 — full 11-table schema (verification fix). -->
  Migrations create **all 11 tables** (verified in reference `database.service.ts`):
  `schema_migrations`, `review_products`, `qna_questions`, `import_job_payloads`, `catalog_products`,
  `customer_purchases`, `webhook_events`, `background_jobs`, `widget_config_revisions`, `storefront_sync_state`,
  `audit_logs` — plus their indexes/ALTERs. All keyed by `shop_id` (value = store domain).
- `src/common/identity.ts` — **NEW**: `type StoreIdentity = string /* {store}.mysapo.net */`, plus
  `normalizeStoreDomain()` (port from `normalizeShopDomain`, retune regex for `.mysapo.net` + custom domains).
- `src/common/guards/shop-auth.guard.ts` — port session-token guard; identity claim = store domain.
- `src/common/pipes/numeric-id.pipe.ts`, `utils/*` — port as-is.
- `src/common/public-cors.ts` — port; storefront origins now Sapo store domains (`*.mysapo.net` + custom).
- `src/config/*` — ConfigModule wiring; typed getters for DB/Redis/session/SAPO_*.

## Steps

1. Port Redis + Database modules; run migration on a scratch Postgres → tables exist.
2. Replace identity: everywhere reference used `orgid`/`normalizeOrgid`, use `StoreIdentity`/`normalizeStoreDomain`.
   Column `shop_id` **stays** (now holds the store domain string) → zero schema rename.
3. Port common guard/pipe/utils/CORS with identity swap.
4. Wire `app.module.ts` (API) + `worker.module.ts` (queue) with Config/Redis/Database only.

## Contracts / notes

- `shop_id` column semantics: string = store domain. Keep the name to minimize churn; document meaning.
- <!-- Red Team S2: F17 — allowlist gate + fail-closed default in CODE. -->
  CORS: production requires explicit `STOREFRONT_ALLOWED_ORIGINS`; `ALLOW_CUSTOM_STOREFRONT_ORIGINS` defaults
  **`false` in code** (not just `.env`). Public endpoints route through the ported `main.ts` allowlist middleware,
  not the bare reflector.
- Session JWT (`createSessionToken`) is platform-neutral — its home is Phase 05, but the guard that reads it lives here.

## Tests / validation

- Port `shop-auth.guard.spec.ts` with store-domain fixtures; passes.
- DB integration: boot with `DB_MIGRATE_ON_STARTUP=true` against a local PG → tables created; a store-domain
  round-trip insert/select works.
- `npm --prefix server run build && lint && test` green.

## Acceptance

- App boots (API + worker roles) with Config/Redis/DB; identity helpers validate `{store}.mysapo.net`.

## Risks

- `normalizeStoreDomain` must accept custom shop domains + `*.mysapo.net`; over-strict regex breaks installs
  → derive allowed shapes from Phase 01.
