# E2E Validation & Launch Readiness Checklist

## Install Lifecycle

- [ ] P01 — OAuth install on Sapo sandbox: `https://{store}.mysapo.net/admin/oauth/authorize` redirects correctly
- [ ] P02 — HMAC verification passes (sorted A-Z, SHA256, base64, timestamp ±5min)
- [ ] P03 — Token exchange succeeds: code → access_token
- [ ] P04 — Store identity verified via `GET /admin/shop.json`
- [ ] P05 — Install persisted in DB (shop, appInstall rows), token encrypted
- [ ] P06 — Webhooks registered for all 11 topics
- [ ] P07 — Storefront config metafield `f1genz.config` written to shop
- [ ] P08 — Session handoff → HttpOnly cookie set, redirect to admin SPA
- [ ] P09 — Uninstall clears token material, tombstones domains

## Admin SPA

- [ ] A01 — Admin SPA loads after install, session probe returns storeDomain + status
- [ ] A02 — Dashboard: KPIs render (reviews, questions, ratings, response rate)
- [ ] A03 — Reviews: list renders with pagination, status filters work
- [ ] A04 — Reviews: approve/hide/spam moderation works
- [ ] A05 — Reviews: reply to review works
- [ ] A06 — Q&A: list renders, approve/hide/answer works
- [ ] A07 — Settings: widget config save/load works
- [ ] A08 — Ops: health check shows DB/Redis/webhook status
- [ ] A09 — Ops: resync config, resync webhooks, backfill catalog actions succeed

## Storefront Widget

- [ ] S01 — Widget JS/CSS served at `/storefront/f1genz-storefront.{js,css}` with correct CORS
- [ ] S02 — Shop metafield `f1genz.config` readable via `.bwt` — `{{ shop.metafields.f1genz.config }}`
- [ ] S03 — Product metafield `public_summary` readable via `.bwt` — `{{ product.metafields.reviews.public_summary }}`
- [ ] S04 — `<f1genz-reviews>` renders approved reviews on product page
- [ ] S05 — `<f1genz-qna-panel>` renders answered questions on product page
- [ ] S06 — `<f1genz-rating-badge>` renders SSR rating badge on collection page
- [ ] S07 — JSON-LD structured data renders on product page, passes Google Rich Results Test
- [ ] S08 — Public review submission works from storefront
- [ ] S09 — Public Q&A submission works from storefront

## Webhooks

- [ ] W01 — `products/create`, `products/update`, `products/delete` received and idempotent
- [ ] W02 — `orders/create`, `orders/paid`, `orders/cancelled`, `orders/fulfilled` received
- [ ] W03 — `app/uninstalled` triggers cleanup (token nulled, domains tombstoned)
- [ ] W04 — `shop/update` updates known_domains list
- [ ] W05 — Webhook signature verified (HMAC-SHA256, timing-safe compare)
- [ ] W06 — Deterministic event-id (provider delivery ID, no randomBytes fallback)
- [ ] W07 — Out-of-order/replayed events handled (monotonic upsert guard)

## Security

- [ ] S01 — `grep -ri "haravan\|orgid\|id_token\|jwks\|oidc" server/src client/src` → zero hits
- [ ] S02 — Tokens encrypted at rest (AES-GCM), never exposed to frontend JS
- [ ] S03 — Session cookie HttpOnly, SameSite=None, Secure
- [ ] S04 — `APP_SESSION_SECRET` ≠ `SAPO_CLIENT_SECRET` ≠ `SAPO_WEBHOOK_SECRET` (distinct)
- [ ] S05 — CORS allowlist fail-closed (not permissive reflector)
- [ ] S06 — Rate limit: auth endpoints throttled, 429 handled
- [ ] S07 — Per-product Redis write lock (acquireLock/releaseLock) guards public_summary writes

## Data Integrity

- [ ] D01 — Catalog backfill syncs products from Sapo API to Postgres
- [ ] D02 — Order mirror syncs customer purchases for verified-buyer checks
- [ ] D03 — public_summary metafield matches Postgres summary (no drift)
- [ ] D04 — Concurrent review status changes don't lose data (Redis lock F1)

## Media

- [ ] M01 — Upload ticket created (HMAC-signed)
- [ ] M02 — Worker accepts PUT with valid X-Upload-Token
- [ ] M03 — CDN URL returns uploaded image
- [ ] M04 — Media attached to reviews renders correctly

## Build & Verify

- [ ] B01 — `npm run verify` green (server lint/test/build, client lint/build)
- [ ] B02 — `prisma generate` succeeds
- [ ] B03 — `prisma migrate deploy` applies all migrations cleanly
- [ ] B04 — PM2 ecosystem.config.cjs starts both api + worker processes

## Launch Readiness

- [ ] L01 — Sapo Partner dashboard: app registered with correct URLs and scopes
- [ ] L02 — Production env vars set on DO droplet and Cloudflare Pages
- [ ] L03 — Worker deployed with `wrangler deploy`, UPLOAD_SECRET set
- [ ] L04 — Health endpoints: `/livez` 200, `/readyz` 200
- [ ] L05 — Sapo app listing requirements reviewed (privacy, screenshots, scopes)
- [ ] L06 — Storefront install guide published for merchants
