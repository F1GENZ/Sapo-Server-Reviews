# Scout Report — F1GENZ Review Sapo Project Analysis

Date: 2026-07-08
Source: Full 20-phase Haravan-to-Sapo migration plan + Haravan reference repo

## Project Identity

**F1GENZ Review Sapo** — a greenfield Sapo (Bizweb) app porting the existing F1GENZ Reviews + Q&A Haravan app. The Haravan repo (`C:\Users\Admin\Desktop\F1GENZ Review`) is **read-only reference**; this project is a new standalone build.

## Current State

- **No code yet** — plan-only phase. 20 phase files authored and validated.
- **5 key decisions** resolved (D1–D5): greenfield build, store-domain identity, `public_summary`-only metafield, free-first billing (deferred), D2 metafield exposure pending Phase 1 discovery.
- **Red Team review** completed (Session 2): 27 raw findings → 21 accepted (6 Critical, 9 High, 6 Medium), all applied to phase files.
- **Haravan reference repo** mapped: 85 TS server files, 41 client files, Cloudflare Worker, Postgres (11 tables), Redis, BullMQ.

## Architecture (to port)

| Layer | Stack | Files |
|---|---|---|
| Server | NestJS (api + worker roles via `PROCESS_ROLE`) | `server/src/` — modules: common, config, database, redis, sapo, catalog, product, review, qna, media, purchase, dashboard, jobs, ops, storefront |
| Database | Postgres/Supabase | 11 tables, all keyed by `shop_id` = store domain |
| Cache/Queue | Redis + BullMQ | Session/token state, job queues, per-product write locks |
| Admin Client | Vite React 19 + antd + react-query + react-router 7 | 41 files, embedded in Sapo admin |
| Worker | Cloudflare Worker (R2) | Image upload pipeline |
| Storefront | Web Components | `<f1genz-reviews>`, `<f1genz-reviews-panel>`, `<f1genz-qna-panel>`, `<f1genz-rating-badge>` |
| Deployment | DigitalOcean (PM2) + Cloudflare Pages | Server on DO, client on CF Pages, worker on CF Workers |

## Plan Structure — 20 Phases, 6 Stages

### Stage A — Foundation (Phases 01–03)
| # | Phase | Status |
|---|---|---|
| 01 | Discovery & feasibility — Sapo sandbox fact-finding; resolves D2 gate (metafield `.bwt` exposure) | GATE |
| 02 | Project scaffold & tooling — NestJS + Vite + scripts | Depends on 01 |
| 03 | Server foundation & shared infra — DB (11 tables), Redis, config, CORS, logging | Depends on 02 |

### Stage B — Sapo Platform Layer (Phases 04–07)
| # | Phase | Status |
|---|---|---|
| 04 | Sapo REST API client — per-store client, throttle/retry, concurrency limiter | Depends on 01, 03 |
| 05 | Sapo OAuth, identity & session — OAuth2 code→token, HMAC, session JWT, store-domain identity | Depends on 01, 03, 04 |
| 06 | Webhook pipeline — event store, idempotency, DLQ, BullMQ queues | Depends on 04, 05 |
| 07 | Billing & subscription gating | **DEFERRED post-launch (D5)** |

### Stage C — Domain & Data (Phases 08–12)
| # | Phase | Status |
|---|---|---|
| 08 | Catalog & order sync — product/order webhooks → Postgres | Depends on 04, 05 |
| 09 | Reviews domain — CRUD, moderation, metafield (`public_summary`-only per D4), per-product write lock | Depends on 04, 05, 08 |
| 10 | Q&A domain — questions, answers, moderation, metafield | Depends on 04, 05, 08 |
| 11 | Media pipeline — R2 worker for image uploads | Depends on 03 |
| 12 | Dashboard, stats, jobs & ops — analytics, CSV import, background jobs, ops resync | Depends on 09, 10 |

### Stage D — Storefront (Phases 13–14)
| # | Phase | Status |
|---|---|---|
| 13 | Storefront backend — asset serving, `writeStorefrontConfig()`, `GET /public/summaries` endpoint, CORS | Depends on 04, 05, 09 |
| 14 | Storefront theme integration — Sapo `.bwt` snippets, web component widget, two modes (metafield SSR vs API-only based on D2) | Depends on 01, 13 |

### Stage E — Admin Client (Phases 15–17)
| # | Phase | Status |
|---|---|---|
| 15 | Admin SPA foundation — Vite React 19 project, antd, react-query, react-router 7, shared components | Depends on 02 |
| 16 | Admin SPA auth & embedded SDK — Sapo Embedded App SDK + session token, store-domain routing | Depends on 05, 15 |
| 17 | Admin SPA feature pages — reviews, Q&A, dashboard, settings, ops pages | Depends on 09, 10, 12, 16 |

### Stage F — Ship (Phases 18–20)
| # | Phase | Status |
|---|---|---|
| 18 | Deployment & infrastructure — DO droplet, PM2, Cloudflare Pages, CI/CD, env vars | Depends on 03–17 |
| 19 | Documentation — app setup, auth flow, deployment, storefront install guides | Depends on 03–17 |
| 20 | E2E validation & launch readiness — full OAuth install → admin CRUD → storefront render → webhook verification | Depends on 18, 19 |

## Critical Path

```
01 → 02 → 03 → 04 → 05
                       ├→ 06 (webhooks)
                       ├→ 08 → 09, 10 (catalog → reviews/qna)
                       ├→ 11 (media, parallel)
                       ├→ 13 → 14 (storefront, parallel)
                       └→ 15 → 16 → 17 (admin, parallel)
                                          ↓
                                    18, 19 → 20 (converge)
```

Phase 07 (billing) is **off the critical path** — deferred post-launch.

## Haravan → Sapo Migration Deltas

| Concern | Haravan | Sapo | Weight |
|---|---|---|---|
| Auth | OpenID Connect + id_token + JWKS, `orgid` | OAuth2 code→token, HMAC, store domain | **Heavy** |
| API host | Central `apis.haravan.com/com` | Per-store `{store}.mysapo.net/admin` | Medium |
| Auth header | `Authorization: Bearer` | `X-Sapo-Access-Token` | Low |
| Metafields | Product+shop, storefront-exposed | Exists; `.bwt` exposure **unverified (D2 gate)** | **Risk** |
| Webhooks | `x-haravan-*` headers | Different headers/signature | Medium |
| Billing | `app_subscriptions/update` | Sapo app charge (deferred) | Medium |
| Storefront | Haravan Liquid | Bizweb `.bwt` | Medium |
| Embedded SDK | Haravan App SDK | Sapo Embedded App SDK | Medium |

## Phase-Level Detail

### Phase 01 — Discovery & Feasibility (GATE)

**Goal:** Resolve every `‹VERIFY›` marker before any code is written. Produce a Sapo platform-facts verification table with status `CONFIRMED | ASSUMED | BLOCKED` per concern. Deliver definitive D2 verdict on `.bwt` metafield exposure.

**7 discovery areas:** (1) OAuth/identity, (2) REST Admin API, (3) Metafields (make-or-break), (4) Webhooks, (5) Billing, (6) Embedded App SDK, (7) ScriptTag.

**Output:** `plans/reports/from-scout-to-planner-sapo-platform-facts-verification-report.md`

### Phase 02 — Project Scaffold & Tooling

**Goal:** Stand up empty workspace — NestJS + Vite + Worker packages build/lint/test green with stubs. Zero `haravan`/`orgid` strings.

**Key files:** Root `package.json`, `server/` (NestJS bootstrap stubs), `client/` (Vite shell), `worker/` (wrangler.toml), `docs/` (docs.json shell). Root `verify` script: client build+budget+smoke, server build+lint+test, worker test. Rename `haravan-reviews:*` BullMQ prefixes to `f1genz-sapo:*`.

**Risk:** Dependency drift vs reference lockfiles.

### Phase 03 — Server Foundation & Shared Infra

**Goal:** Port platform-neutral backbone — Config, Redis, Postgres (11-table schema), common utils/guards/pipes/CORS, store-domain identity type (`StoreIdentity = string`).

**Key policies:** CORS allowlist fail-closed (not permissive reflector), distinct secrets enforced at bootstrap (`APP_SESSION_SECRET` ≠ `SAPO_CLIENT_SECRET` ≠ `SAPO_WEBHOOK_SECRET`), `normalizeStoreDomain()` for `.mysapo.net` + custom domains.

**Tables:** `schema_migrations`, `review_products`, `qna_questions`, `import_job_payloads`, `catalog_products`, `customer_purchases`, `webhook_events`, `background_jobs`, `widget_config_revisions`, `storefront_sync_state`, `audit_logs`. All keyed by `shop_id`.

### Phase 04 — Sapo REST API Client

**Goal:** Build Sapo-native REST client covering every resource the domain layer needs, with per-store throttle and 429 retry. Mirrors `haravan.api.ts` surface: products, metafields, orders, shop info, webhooks, scriptTags.

**Key files:** `src/platform/sapo/sapo.api.ts` (per-store client factory, REST methods, throttle/retry), `src/platform/sapo/sapo.types.ts` (DTOs from Phase 01 samples).

**Critical risks:** [F3] Per-store rate limiter in Redis (not process-global singleton) — API + worker must coordinate. [F16] Token resolved per-call via `resolveAccessToken`, never cached in client. Per-store `https://{storeDomain}/admin` base URL is the largest structural departure from Haravan.

**VERIFY (5):** Base URL format, auth header name, Sapo paths/response envelopes per resource, leaky-bucket constants, pagination model (page vs cursor).

### Phase 05 — Sapo OAuth, Identity & Session

**Goal:** Complete OAuth2 install/login flow, derive store-domain identity from authenticated sources, persist install-session in Redis, issue HS256 session JWTs, implement token refresh with re-auth fallback.

**Key files:** `src/platform/sapo/sapo-auth.service.ts`, `sapo.controller.ts`, `sapo.module.ts`. Model `SapoInstallData` with `store_domain`, `known_domains[]`, `access_token`, `refresh_token?`, `status`, `installed_at` — drop orgid/orgsub/trial fields.

**Critical risks:** [F7] Store identity only from token-exchange response body (server-to-server TLS), never from redirect query param. [F8] Mandatory timestamp-based HMAC replay guard. [F11] If no refresh token: on 401, mark `needs_reauth`, pause queues, surface re-auth prompt. [F13] Multi-domain stores: persist `known_domains[]` + `domain→canonical` always. [F14] Decouple `featuresUnlocked` from `isProPlan()`. [F15] Single auth flow — do not port OpenID dual-flow unless Sapo has admin SSO. [F18] `HttpOnly` cookies, never echo token in URL.

**VERIFY (3):** Authorize URL format, install HMAC spec (header/algorithm/message/timestamp), OAuth scope list.

### Phase 06 — Webhook Pipeline

**Goal:** Receive, verify, queue, process Sapo webhooks idempotently. Port neutral event-store + BullMQ infrastructure, adapt signature verification and topic mapping to Sapo.

**Key files:** `sapo-webhook.service.ts` (signature verify, topic mapping, store-domain resolution), `webhook-event-store.service.ts` (platform-neutral event store), `sapo-webhook.controller.ts` (GET verify-challenge + POST receiver), BullMQ `webhook` queue + worker.

**Critical risks:** [F2] Tenant identity from HMAC-signed body only — never unsigned headers/query params. Mandatory replay defense: Sapo `delivery-id` + timestamp ±5min. [F9] Deterministic event-id (no `randomBytes` fallback) from Sapo delivery ID or `hash({store,topic,resourceId,occurred_at})`. [F12] Monotonic upsert guard on every webhook-driven write. [F11] On 401, pause store queues — don't burn DLQ retries. May need XML parser branch if Sapo sends XML.

**VERIFY (5):** Signature header/algorithm/encoding, topic header format, store-domain source (and whether HMAC-covered), content-type (JSON vs XML), verify-challenge GET handshake.

### Phase 07 — Billing & Subscription Gating

**DEFERRED post-launch (D5).** Not a launch blocker. v1 ships with all features unlocked. When activated: drives Pro/Free from Sapo charge model with billing webhook + cron fallback. Files: `sapo-billing.service.ts`, `sapo.cron.ts`. VERIFY (2, deferred): charge status mapping, charge lifecycle API endpoints.

### Phase 08 — Catalog & Order Sync

**Goal:** Populate Postgres product catalog + purchase mirror via install backfill + webhook incremental updates. Map Sapo product fields (id, title, handle, image, vendor, sku) and order fields (line items, customer email/phone, status). Post-install backfill must be serialized/staggered per store (F3). Catalog upserts must use monotonic `WHERE EXCLUDED.updated_at > catalog_products.updated_at` (F12).

**VERIFY:** Sapo `getOrders` filters and paging behavior.

### Phase 09 — Reviews Domain

**Goal:** Full reviews CRUD, moderation (approved/pending/hidden/spam), summaries, verified-buyer badge, admin + public APIs. Postgres source of truth; `public_summary`-only metafield sync (all `chunk_*`/`data_chunk_*`/`summary` dropped per D4). Per-product Redis write lock (`acquireLock`/`releaseLock`) guards every mutation that recomputes `public_summary` (F1).

### Phase 10 — Q&A Domain

**Goal:** Full Q&A CRUD, moderation, admin + public APIs. Postgres-only — no metafield sync in v1 (Q&A has no SSR badge). Entire `qna-metafield.service.ts` dropped per D4/F4. Postgres row-level locks sufficient.

### Phase 11 — Media Pipeline (R2 + Worker)

**Goal:** Image/video upload via Cloudflare R2 with signed tickets. Platform-independent — ported near-verbatim. New bucket `f1genz-sapo-images`, new CDN domain, rotated `UPLOAD_SECRET`. Server + worker must share `R2_UPLOAD_SECRET`.

### Phase 12 — Dashboard, Stats, Jobs & Ops

**Goal:** Dashboard KPIs, CSV/JSON import (BullMQ), ops maintenance endpoints (config resync, webhook re-subscribe, order resync). **Do NOT port** `server/src/stats/` (empty in reference — F20). Drop "metafield verify" ops action (policed dead chunk arrays — F4).

### Phase 13 — Storefront Backend

**Goal:** Serve widget JS/CSS bundle with cache headers + CORS to Sapo origins. `writeStorefrontConfig()` writes store-level metafield `f1genz.config = {apiUrl, storeDomain}`. Batched `GET /public/summaries?product_ids=` endpoint with aggressive caching for Mode B badge fallback. CORS origins from install `known_domains[]` (not just canonical domain).

### Phase 14 — Storefront Theme Integration

**Goal:** Render reviews, Q&A, rating badges, JSON-LD on Sapo `.bwt` theme via web components. Two modes: **A** (metafield SSR badge, if D2=yes) and **B** (API-fetched via ScriptTag, if D2=no). Both ship; D2 gates which snippet to use. Updated web component with `store` attribute replacing `orgid`.

**VERIFY markers (4):** `.bwt` syntax for shop metafield access, product object paths (`product.id`, customer email/phone), product metafield access syntax, Sapo filter equivalents (image URL, money, canonical URL).

### Phase 15 — Admin SPA Foundation

**Goal:** Scaffold Vite React 19 SPA shell — routing, layout, Axios API client, react-query, error/toast infra, centralized `identity.js` (store domain replacing `orgid`). Port `useStoreRoute` from `useOrgRoute.js`.

### Phase 16 — Admin SPA Auth & Embedded SDK

**Goal:** Port install/login UX, session handling, Sapo Embedded App SDK abstraction. Strip `id_token` from auth flow. New `embedded.js` isolates SDK surface (launch params, session-token, navigation). Handle 3rd-party cookie constraints.

**Critical risk (F6):** Sapo Embedded SDK API is unknown — two-cell matrix (SDK yes/no × cookies yes/no) gates approach. **VERIFY:** SDK iframe launch params, session-token API, host-app navigation.

### Phase 17 — Admin SPA Feature Pages

**Goal:** Port all admin pages — reviews, Q&A, dashboard, settings, ops, contact, guide — wired to Sapo backend with store-domain identity + react-query. Update all copy from "Haravan" to "Sapo". Storefront install guide points to `.bwt` snippets. `debug/` NOT ported (empty); `dev/` only behind `DevGate`.

### Phase 18 — Deployment & Infrastructure

**Goal:** Deployable stack — API+worker on DO/PM2, client on Cloudflare Pages, R2 worker on CF Workers. Register app in Sapo Partner dashboard. DB migrations on first boot.

**Key risks:** Callback URL mismatch in Sapo dashboard, two-process misconfiguration (`PROCESS_ROLE`), concurrent migration race (wrap `runMigrations()` in `pg_advisory_lock` — F10).

**VERIFY:** App URL, OAuth redirect URLs, scopes, webhook URL in Sapo dashboard; new domains `api-*.f1genz.dev` and `reviews-sapo.f1genz.dev`.

### Phase 19 — Documentation

**Goal:** Sapo-specific docs — setup, auth flow, storefront install, deployment, operations. Rewrite Haravan docs removing OpenID/id_token/JWKS. Storefront guide covers both Mode A (.bwt metafield) and Mode B (ScriptTag + API).

**Files:** `getting-started/`, `sapo/app-setup.mdx`, `sapo/auth-flow.mdx`, `storefront/widget-installation.mdx`, `configuration/`, `deploy-*.md`, `operations/`.

### Phase 20 — E2E Validation & Launch Readiness

**Goal:** 9-row validation matrix on deployed Sapo sandbox. Prove full parity: install lifecycle, admin CRUD, storefront widget + JSON-LD, webhooks (verified/idempotent/replay-safe), sync (monotonic, per-store rate limited), 7 security red-team gates, concurrency (per-product lock), multi-domain, background auth, DDL safety, `npm run verify` green, zero Haravan references.

**Billing row deferred (D5).**

1. **Concurrent metafield writes lose data** — Redis per-product write lock (`acquireLock`) must be ported (Phase 09, 10)
2. **Webhook tenant identity from unsigned header** — Sapo may not provide signed store identity in webhook headers (Phase 06)
3. **Rate limiter process-global** — Sapo meters per-store; cross-store stall risk (Phase 04, 08)
4. **Chunk metafields are dead code** — only `public_summary` is read; D4 cut confirmed
5. **D2 metafield exposure is a hidden hard block** — if `.bwt` can't read metafields, badge/JSON-LD must go API-only
6. **Admin auth depends on unverified Embedded SDK + 3rd-party cookies** — no combined fallback (Phase 16)

## VERIFY Markers (Sapo Sandbox Required)

Phase 01 is the discovery gate — all `‹VERIFY›` markers across phases must be resolved against live Sapo docs + sandbox before implementation:

- **OAuth:** authorize/token URLs, HMAC param ordering, token format
- **Metafields:** `.bwt` exposure (D2 gate), per-value limits, `value_type` support
- **Webhooks:** topic names, signature header/algorithm, subscribe endpoint
- **Embedded SDK:** session token equivalent, admin iframe behavior
- **ScriptTag:** availability for asset injection
- **Theme objects:** `.bwt` equivalents for `product.id`, `customer.email`, `customer.phone`, image/money/URL filters

## Comprehensive VERIFY Inventory (All Phases)

**15 distinct `‹VERIFY›` items** require Sapo sandbox confirmation before their owning phases can proceed. All feed into Phase 01's fact table.

| # | Phase | Topic | What to Verify |
|---|-------|-------|---------------|
| 1 | P04 | Base URL | `https://{storeDomain}/admin` |
| 2 | P04 | Auth header | `X-Sapo-Access-Token` |
| 3 | P04 | Resource paths | Product/metafield/order/shop/webhook/scriptTag endpoints + response envelopes |
| 4 | P04 | Rate limits | Leaky-bucket constants (max concurrent, min interval) |
| 5 | P04 | Pagination | Page-based vs cursor-based |
| 6 | P05 | OAuth URLs | Install + login authorize/token endpoint format |
| 7 | P05 | Install HMAC | Header name, algorithm, message construction, sort order, timestamp |
| 8 | P05 | Scopes | Required OAuth scope list |
| 9 | P06 | Webhook signature | Header name, algorithm, encoding (base64 vs hex) |
| 10 | P06 | Topic header | Field that carries event topic string |
| 11 | P06 | Store identity | Which header/body field carries store domain, and whether HMAC-covered |
| 12 | P06 | Content-type | JSON-only or XML possible/selectable |
| 13 | P06 | Verify challenge | GET handshake for webhook registration |
| 14 | P07 | Charge status | Sapo charge status values → Pro/Free mapping **(deferred)** |
| 15 | P07 | Charge APIs | Create/activate/query charge lifecycle endpoints **(deferred)** |
| 16 | P08 | Orders API | `getOrders` filters and paging behavior |
| 17 | P14 | `.bwt` shop metafield | Exact syntax for reading `shop.metafields.f1genz.config` |
| 18 | P14 | `.bwt` product objects | `product.id`, customer email/phone object paths |
| 19 | P14 | `.bwt` product metafield | Exact syntax for `product.metafields.reviews.public_summary` |
| 20 | P14 | `.bwt` filters | Sapo equivalents for `product_img_url`, `money_without_currency`, `canonical_url` |
| 21 | P16 | Embedded SDK | Iframe launch params, session-token API, host-app navigation |
| 22 | P18 | Dashboard reg | App URL, OAuth redirect URLs, scopes, webhook URL in Sapo Partner dashboard |
| 23 | P19 | Doc scopes | Scopes listed in `sapo/app-setup.mdx` match sandbox |
| 24 | P20 | Listing reqs | Sapo app-review requirements (privacy, scopes justification, screenshots, pricing) |

## v1 Cut Candidates (if timeline overruns)

- Q&A domain (Phase 10 + surfaces in 14/17)
- CSV/JSON bulk import (`jobs` + `import_job_payloads`)
- Ops maintenance breadth (Phase 12)
- Billing scaffolding (already deferred, Phase 07)

## Unresolved Questions

1. Has Phase 01 (Sapo sandbox discovery) been executed yet? This is the blocking gate.
2. Is the Sapo sandbox accessible and configured for testing?
3. Are the Sapo skills (`sapo-app`, `sapo-liquid`, etc.) ready to handle `.bwt` theme work in Phase 14?
