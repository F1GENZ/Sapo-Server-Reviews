# Phase 18 — Deployment & Infrastructure

**Goal:** Deployable stack: API + queue worker (DigitalOcean/PM2), client (Cloudflare Pages), R2 worker, env, DNS.
**Depends on:** 03–17

## Red Team Hardening (S2) — MUST DO
- **[F10 High] Only ONE process runs migrations.** `CREATE TABLE IF NOT EXISTS` is NOT concurrency-safe in
  Postgres — two sessions racing throw `duplicate key on pg_type_typname_nsp_index`. Both api + worker boot
  `DatabaseService` (reference `worker.ts:10-16`). Choose ONE:
  (a) Wrap `runMigrations()` in `pg_advisory_lock(<const>)` / `pg_advisory_xact_lock` (second process blocks
      then no-ops); **or**
  (b) Set `DB_MIGRATE_ON_STARTUP=false` on the worker and only run migrations from the api process; **or**
  (c) Run migrations as a dedicated one-shot step before either process boots (Kubernetes initContainer /
      PM2 pre-hook).
  Recommend (a) so any process order works.
- **[F19 Med] `.env.example` block enforces distinct secrets.**
  `SAPO_CLIENT_SECRET`, `SAPO_WEBHOOK_SECRET`, `APP_SESSION_SECRET` — all three required, all three distinct,
  no fallback chains. Server bootstrap fails fast if any is missing or duplicated (Phase 03/F19).
- **[F11 Follow-through] `SAPO_TOKEN_LIFETIME_HINT` env** (or docs note) — record Phase 01's discovered token
  lifetime so ops know when queue-pause events are expected.

## Reference

- `docs/deploy-digitalocean-pm2-cloudflare.md`, `docs/cloudflare-r2-setup.md`, `docs/operations/*`.
- `client/functions/api/[[path]].js` (+ `public/_redirects`, `_routes.json`) — Pages proxy to API.
- Process model: `PROCESS_ROLE=api` (main) + `PROCESS_ROLE=worker` (queue) from `main.ts`/`worker.ts`.
- `server/.env.example` (structure to mirror with `SAPO_*`).

## Build (new project)

- `server/.env.example` — finalize: `PORT`, `API_URL`, `FRONTEND_URL`, CORS, Redis, DB (Supabase),
  `SAPO_*` (authorize/token URLs, client id/secret, callback URLs, scopes, webhook secret, `SAPO_MAX_CONCURRENT`,
  `SAPO_MIN_INTERVAL_MS`), R2 (`R2_*`), session (`APP_SESSION_SECRET`, `APP_SESSION_TTL`), BullMQ prefix.
- `client` env: `API_URL`, `FRONTEND_URL`; `functions/api/[[path]].js` proxy + `_redirects` + `_routes.json`.
- `worker/wrangler.toml` — new bucket + `UPLOAD_SECRET`.
- PM2 ecosystem (api + worker processes); deploy docs adapted.

## Steps

1. Provision: Supabase DB, Redis, R2 bucket + worker, API host (DigitalOcean droplet/PM2), Cloudflare Pages.
2. Register the app in the Sapo Partner dashboard ‹VERIFY›: app URL, OAuth redirect URLs, scopes, webhook URL.
3. Set env/secrets on each surface; new domains (`api-*.f1genz.dev`, `reviews-sapo.f1genz.dev` ‹confirm›).
4. Deploy API + worker (two PM2 processes); deploy Pages; deploy R2 worker (`wrangler`).
5. Run DB migration on first boot (`DB_MIGRATE_ON_STARTUP`).

## Contracts / notes

- Redirect/callback URLs registered in Sapo must exactly match `SAPO_*_CALLBACK_URL`.
- Worker `UPLOAD_SECRET` must equal server `R2_UPLOAD_SECRET`/`UPLOAD_SECRET`.
- CORS production requires explicit storefront origins (`STOREFRONT_ALLOWED_ORIGINS`).

## Tests / validation

- Staging deploy; health checks pass; queue worker consumes jobs; Pages proxy reaches API.
- Full sandbox install through the deployed stack (not localhost).

## Acceptance

- App installs + runs end-to-end on deployed infrastructure with a Sapo sandbox store.

## Risks

- Callback URL mismatch → install fails silently; double-check registered vs env.
- Two-process split misconfig (queue worker not running) → webhooks/imports stall; verify `PROCESS_ROLE`.
