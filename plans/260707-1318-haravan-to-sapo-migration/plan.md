---
title: "Build F1GENZ Review Sapo"
description: "Greenfield migration plan from Haravan reference patterns to a standalone Sapo build."
status: pending
priority: P1
branch: "master"
tags: ["migration", "sapo"]
blockedBy: ["260709-0155-review-finding-stabilization"]
blocks: []
createdBy: "manual"
source: legacy-plan
---

# Plan — Build "F1GENZ Review Sapo" (new standalone project)

Status: **DRAFT (plan-only)** — decisions D1+D3 resolved; D2 pending Phase 1 discovery
Created: 2026-07-07 · Detailed rev: 2026-07-07 13:37
Reference repo (read-only): `C:\Users\Admin\Desktop\F1GENZ Review`
Target project: `C:\Users\Admin\Desktop\F1GENZ Review Sapo`
Scout report: [../reports/scout-260707-1318-haravan-to-sapo-migration-report.md](../reports/scout-260707-1318-haravan-to-sapo-migration-report.md)

## Decisions (user, 2026-07-07)

- **D1 — New greenfield project.** Build a brand-new Sapo app at `C:\Users\Admin\Desktop\F1GENZ Review Sapo`.
  The Haravan repo is **reference-only** — read to port patterns, **never edit it**. No adapter, no dual-platform.
- **D3 — Identity = Sapo store domain** everywhere (Redis keys, session JWT `sub`, Postgres `shop_id` value,
  webhook routing, storefront config). No `orgid`, no id_token/JWKS. Fresh DB, no data migration.
- **D4 — Storefront metafield = `public_summary` only** (validated S1; **revised S2 red-team**). Write ONLY the
  small `public_summary` metafield (`{avg,count,distribution}`) that feeds the SSR rating badge + JSON-LD
  `aggregateRating`. **Cut** the `chunk_*` / `data_chunk_*` / `summary` families + `CHUNK_SIZE_LIMIT` + chunking +
  delete-excess. Rationale (red-team, evidence-backed): those chunk arrays are written but **never read** — grep
  shows `chunk_`/`data_chunk_` only in the 2 writer files, `loadSummary` has 0 callers, storefront reads only
  `public_summary`; Postgres is the source of truth and the review LIST already comes from the API.
- **D5 — Billing free-first** (validated 2026-07-07). v1 launches with **no paid gating** — all installs run
  feature-unlocked. Phase 07 (billing/Pro-Free) is **deferred to post-launch**. **S2:** decouple "all features on"
  from `isProPlan()` — keep session TTL + inactive-status gating driven by real install/token state (do NOT
  hardcode `isProPlan()=true`); use a separate `featuresUnlocked=true` flag. Drop trial/quota fields for v1.
- **D2 — GATE:** does Sapo expose **`shop`/`product` metafields to `.bwt`** themes? Still required so `.bwt` can
  read `public_summary` for the SSR badge/JSON-LD. If NOT exposed → badge/JSON-LD move to an API-fetched
  (`/public/summaries`) path; storefront review data is unaffected (already API). Resolved in Phase 1.

**Scope (validated 2026-07-07):** full feature parity in one build (all phases), except billing is free-first (D5).
Full DB schema ported as-is (see snapshot + Phase 03).

## Objective

Ship a Reviews + Q&A app for **Sapo (Bizweb)** at feature parity with the Haravan app: reviews, Q&A,
moderation, rating badge + JSON-LD, catalog/order sync, Pro/Free billing, embedded admin, storefront widget.

## How to read this plan

- **20 phases in 6 stages.** Each phase file has: Goal · Depends on · Reference (source files to read) ·
  Build (files to create in the new project) · Steps · Contracts/Notes · Tests · Acceptance · Risks.
- "Port X" = recreate X in the new project reading the reference; identity keyed by **store domain**.
- `‹VERIFY›` = value that must come from current Sapo docs + sandbox (Phase 1) — never invent (skill rule).

## Stages & phases

### Stage A — Foundation
| # | Phase | Depends |
|---|---|---|
| 01 | [Discovery & feasibility (Sapo facts + sandbox)](phase-01-discovery-and-feasibility.md) | — (GATE) |
| 02 | [Project scaffold & tooling](phase-02-project-scaffold-and-tooling.md) | 01 |
| 03 | [Server foundation & shared infra](phase-03-server-foundation-shared-infra.md) | 02 |

### Stage B — Sapo platform layer
| # | Phase | Depends |
|---|---|---|
| 04 | [Sapo REST API client](phase-04-sapo-rest-api-client.md) | 01, 03 |
| 05 | [Sapo OAuth, identity & session](phase-05-sapo-oauth-identity-session.md) | 01, 03, 04 |
| 06 | [Webhook pipeline](phase-06-webhook-pipeline.md) | 04, 05 |
| 07 | [Billing & subscription gating](phase-07-billing-subscription-gating.md) — **DEFERRED post-launch (D5)** | 05, 06 |

### Stage C — Domain & data
| # | Phase | Depends |
|---|---|---|
| 08 | [Catalog & order sync](phase-08-catalog-and-order-sync.md) | 04, 05 |
| 09 | [Reviews domain](phase-09-reviews-domain.md) | 04, 05, 08 |
| 10 | [Q&A domain](phase-10-qna-domain.md) | 04, 05, 08 |
| 11 | [Media pipeline (R2 + worker)](phase-11-media-pipeline-r2-worker.md) | 03 |
| 12 | [Dashboard, stats, jobs & ops](phase-12-dashboard-stats-jobs-ops.md) | 09, 10 |

### Stage D — Storefront
| # | Phase | Depends |
|---|---|---|
| 13 | [Storefront backend (assets + config + ScriptTag)](phase-13-storefront-backend-assets-config.md) | 04, 05, 09 |
| 14 | [Storefront theme integration (Sapo .bwt widget)](phase-14-storefront-theme-integration.md) | 01, 13 |

### Stage E — Admin client
| # | Phase | Depends |
|---|---|---|
| 15 | [Admin SPA foundation](phase-15-admin-spa-foundation.md) | 02 |
| 16 | [Admin SPA auth & embedded SDK](phase-16-admin-spa-auth-embedded-sdk.md) | 05, 15 |
| 17 | [Admin SPA feature pages](phase-17-admin-spa-feature-pages.md) | 09, 10, 12, 16 |

### Stage F — Ship
| # | Phase | Depends |
|---|---|---|
| 18 | [Deployment & infrastructure](phase-18-deployment-infrastructure.md) | 03–17 |
| 19 | [Documentation](phase-19-documentation.md) | 03–17 |
| 20 | [E2E validation & launch readiness](phase-20-e2e-validation-launch-readiness.md) | 18, 19 |

### Critical path & parallelism
`01 → 02 → 03 → 04 → 05` then **fan out**: {06}, {08→09,10}, {11}, {13→14}, {15→16→17} run largely in
parallel (distinct file ownership) → converge at **18/19 → 20**. Phase **07 (billing) is off the launch path**
— deferred post-launch (D5).

## Global acceptance criteria

1. Install on Sapo sandbox via OAuth; token stored server-side; install HMAC verified.
2. Admin SPA loads embedded in Sapo admin; store-domain identity resolves; reviews/Q&A CRUD works.
3. Storefront widget renders reviews, Q&A, rating badge, JSON-LD on a Sapo theme.
4. Webhooks (product/order/uninstall/store-update + billing) verified, idempotent.
5. ~~Pro/Free gating driven by Sapo billing.~~ **Deferred post-launch (D5)** — v1 is free-first, all features on.
6. Catalog + order sync populate Postgres keyed by store domain.
7. New project `npm run verify` green (client build/budget/smoke + server build/lint/test + worker test).
8. `grep -ri "haravan\|orgid\|apis.haravan"` in the new project → zero hits.

## Reference architecture snapshot (what exists to port)

- **server** (NestJS): entrypoints `main.ts` (API) + `worker.ts` (queue worker), `PROCESS_ROLE=api|worker`.
  Modules: `common` (guards/pipes/utils/cors), `config`, `database`, `redis`, `catalog`, `purchase`,
  `product`, `review`, `qna`, `media`, `dashboard`, `jobs`, `ops`, `storefront`, `haravan`(→sapo).
  <!-- Red Team S2: dropped `stats` (empty dir in reference) + `debug` page (empty) from scope. -->
  (`stats` module + `debug` page are empty in the reference — do NOT port.)
- **Postgres schema (11 tables, verified in `database.service.ts`)** — port all: `schema_migrations`,
  `review_products`, `qna_questions`, `import_job_payloads`, `catalog_products`, `customer_purchases`,
  `webhook_events`, `background_jobs`, `widget_config_revisions`, `storefront_sync_state`, `audit_logs`.
  All keyed by `shop_id` (value = store domain).
- **client** (Vite React 19 + antd + react-query + react-router 7): `common/*`, `config/AxiosConfig.js`,
  `hooks/*`, `components/*`, `pages/{auth,dashboard,reviews,qna,settings,ops,contact,guide,debug,dev}`.
  Scripts: `build`, `budget`, `smoke`.
- **worker** (Cloudflare R2): `worker/src/index.js`, `wrangler.toml` (bucket `f1genz-images`, `UPLOAD_SECRET`).
- **storefront bundle**: `server/storefront/snippets/f1genz-storefront.{js,css}` served at `/storefront/*`.

## Validation Log

### Session 1 — 2026-07-07
**Trigger:** `/ck-plan validate` on the 20-phase plan.
**Questions asked:** 4

#### Verification Results
- **Tier:** Full (20 phases, all 4 roles)
- **Claims checked:** ~15 · **Verified:** 14 · **Failed:** 1 · **Unverified:** 0
- **Failures:**
  1. [Fact Checker] Phase 03/plan schema list incomplete — `database.service.ts` creates **11 tables**, plan
     listed 4. Missing: `catalog_products`, `customer_purchases`, `webhook_events`, `background_jobs`,
     `widget_config_revisions`, `storefront_sync_state`, `schema_migrations`. → Fixed (snapshot + Phase 03).
- **Verified samples:** webhook-event-store methods; `ensureWebhookSubscription`/`syncRecentOrders`/
  `writeStorefrontConfig`/`enqueueCatalogSync`/`syncOrder`; `haravan.cron.ts` `@Cron(EVERY_12_HOURS)`→`refreshToken`;
  `client/functions/api/[[path]].js`, `public/_redirects`, `_routes.json`; `shop_id` identity column.

#### Questions & Answers
1. **[Scope]** v1 scope: MVP-first vs full parity vs reviews+Q&A. **Answer:** Full parity in one build.
2. **[Architecture]** Storefront read model: API-only vs keep metafield chunking vs decide Phase 1.
   **Answer:** Keep metafield chunking → **D4** (makes D2 a hard gate).
3. **[Scope/Assumptions]** Billing in v1: free-first vs include vs trial-only. **Answer:** Free-first → **D5**
   (Phase 07 deferred post-launch).
4. **[Architecture]** DB schema: full port vs v1-only vs redesign. **Answer:** Port full schema as-is → 11 tables.

#### Confirmed Decisions
- Full parity build; billing deferred (free-first, D5); storefront = metafield chunking (D4); full 11-table schema.

#### Impact on Phases
- Phase 01: D2 elevated to blocking gate (D4); if metafields not `.bwt`-exposed → escalate.
- Phase 03: schema list corrected to 11 tables.
- Phase 05: install defaults all features on (free-first).
- Phase 07: marked deferred / post-launch (not a launch blocker).
- Phases 09/10/13/14: **superseded by S2** — see Red Team Review table (D4 revised: `public_summary`-only,
  storefront modes A + B both ship).
- Phase 17: no Pro/Free UI gating in v1 (superseded by S2 F14: `featuresUnlocked` flag, not `isProPlan`).
- Phase 20: billing row deferred; storefront row verifies whichever mode Phase 01 activated.

### Whole-Plan Consistency Sweep
- Files reread: plan.md + phase-01…20 (all authored this session, in context).
- Decision deltas checked: 4 (scope, D4 storefront, D5 billing, schema).
- Reconciled stale references: plan.md decisions + schema snapshot; phases 01/03/05/07/09/13/14/17/20 (see markers).
- Unresolved contradictions: 0.

## Red Team Review

### Session 2 — 2026-07-07
**Reviewers:** 4 (Full tier: Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic).
**Findings:** 27 raw → **21 accepted** after dedup/merge (all evidence-backed with `file:line`; 0 evidence-rejected).
**Severity:** 6 Critical, 9 High, 6 Medium. **Disposition:** all Accept; 2 touched user decisions → escalated → user chose (D4 cut to `public_summary`-only; D5 keep gating logic but feature-unlock v1).

| # | Finding (root: "port as-is" drops guards in other files; ‹VERIFY› treated as doc-debt) | Sev | Applied to |
|---|---|---|---|
| 1 | Concurrent metafield writes lose data — Redis per-product write lock (`review.service.ts:2601 acquireLock`) missing from cited files | Crit | 09,10 |
| 2 | Webhook tenant identity from **unsigned** header/query (`haravan.service.ts:1660`) + may not contain store domain | Crit | 06 |
| 3 | Rate limiter process-global for one central host; Sapo meters per-store → cross-store stall + api/worker uncoordinated | Crit | 04,08 |
| 4 | Chunk metafields are **dead** (0 readers); only `public_summary` used → **D4 cut** | Crit | D4,09,10,13,14 |
| 5 | D2/D4 metafield exposure is a hidden hard block, not in dependency graph | Crit | 01,plan |
| 6 | Admin auth depends on unverified Embedded SDK **and** 3rd-party cookies, no combined fallback | Crit | 16 |
| 7 | Install-time store-domain identity has no authenticated source (post id_token removal) → takeover via redirect param | High | 05 |
| 8 | Launch HMAC replay guard only "if timestamp provided" (`haravan.service.ts:996`) | High | 05 |
| 9 | Webhook exactly-once degrades w/o stable delivery-id — `randomBytes` fallback (`webhook-event-store.service.ts:67`) | High | 06 |
| 10 | DDL race: api+worker both `CREATE TABLE` on boot, no advisory lock (`database.service.ts:284`) | High | 18 |
| 11 | No refresh token → background 401 storm; Pro path returns stale token (`haravan.service.ts:942`) | High | 05,06 |
| 12 | Out-of-order/replayed webhook overwrites newer state; delete→resurrect (`catalog-product-store.service.ts:214`) | High | 06,08 |
| 13 | Custom/multi-domain stores not modeled under D3 (`appMatchesShop`, `haravan.service.ts:589`) | High | 05,13 |
| 14 | D5: `isProPlan()=true` disables TTL+inactive gating (`:546,:802`); 15-day trial contradicts free-first | High | 05,07,17 |
| 15 | OpenID dual login/install flow over-ported though Sapo has no id_token (`loginApp`/`getAuthEntry`) | High | 05,16 |
| 16 | Per-store client must bind `storeDomain` at construction + not cache token (resolve per call) | Med | 04 |
| 17 | CORS: only permissive reflector (`public-cors.ts:12`) ported, not the allowlist gate (`main.ts:137,166`) | Med | 03,13 |
| 18 | Session cookie not `HttpOnly` + token echoed in URL (`haravan.service.ts:508,502`) | Med | 05,16 |
| 19 | Single secret signs JWT+launch-HMAC+webhook+client; require distinct `APP_SESSION_SECRET` (`:459`) | Med | 03,05,06 |
| 20 | Phantom porting: empty `stats` module + empty `debug` page listed as scope | Med | plan,12,17 |
| 21 | Deferred Phase 07 fully authored; add "v1 cut candidates" lever | Med | plan,07 |

**v1 cut candidates (documented lever if the 20-phase build overruns):** Q&A domain (Phase 10/14/17 surface),
CSV/JSON bulk import (`jobs` + `import_job_payloads`), ops maintenance breadth (Phase 12), billing scaffolding (already deferred).

### Whole-Plan Consistency Sweep (post red-team apply)
- Files reread/edited: plan.md + phases 01,03,04,05,06,08,09,10,12,13,14,16,17,18,20.
- Decision deltas: D4 chunk-cut; D5 gating-decouple; 21 hardening findings; stats/debug removed.
- Reconciled stale references: D4 chunking language across 09/10/13/14/20; `stats`/`debug` scope; `isProPlan` in 05/17.
- Unresolved contradictions: 0.

## Non-invention guardrail

Do not hardcode Sapo endpoints, scopes, webhook topics, signature schemes, or metafield limits until
confirmed in Phase 1. All later phases reference resolved `‹VERIFY›` values from Phase 1's fact table.
