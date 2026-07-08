# Phase 12 — Dashboard, Jobs & Ops

**Goal:** Admin-support surfaces: dashboard aggregates, import jobs, and ops/maintenance endpoints.
**Depends on:** 09, 10

## Red Team Hardening (S2) — MUST DO
- **[F20 Med] Drop the phantom `stats` module.** `server/src/stats/` is empty in the reference — do NOT port it,
  do NOT create a placeholder. Remove from scope.
- **[F4 follow-through] Drop the "metafield verify" ops action** — it existed to police the dead chunk arrays
  cut by D4. Keep: `writeStorefrontConfig` resync, webhook re-subscribe, order resync.

## Reference

- `server/src/dashboard/{dashboard.service.ts, dashboard.controller.ts, dashboard.module.ts, spec}` — KPIs
  (review/Q&A counts, ratings, recent activity) reading Postgres + Sapo product data.
- `server/src/jobs/{jobs.service.ts, jobs.controller.ts, jobs.module.ts, spec}` — CSV/JSON import jobs
  (BullMQ `import` queue; payload in `import_job_payloads`; per-store concurrency).
- `server/src/ops/{ops.service.ts, ops.controller.ts, ops.module.ts, specs}` — maintenance:
  storefront-config resync, webhook re-subscribe, order resync, metafield verify (mirrors reference `ops` uses of
  `HaravanService` methods like `ensureWebhookSubscription`, `syncRecentOrders`, `writeStorefrontConfig`).
- ~~`server/src/stats/`~~ (empty; dropped per F20).
- `server/src/product/{product.service.ts, product.controller.ts, dto, spec}` — product search/lookup for admin.

## Build (new project)

- Port `product/*` (product search backed by catalog mirror + `SapoApiService`).
- Port `dashboard/*` (KPIs from Postgres + product mirror).
- Port `jobs/*` (import queue + `import_job_payloads`); identity=store domain in `makeQueueJobId`.
- Port `ops/*`; repoint maintenance ops to Sapo services (`SapoAuthService.ensureWebhookSubscription`,
  catalog/order resync P08, `writeStorefrontConfig` P13).

## Steps

1. Port product lookup/search.
2. Port dashboard aggregates; verify KPI queries against store-domain-keyed tables.
3. Port import jobs (reviews/Q&A CSV/JSON) + worker under `PROCESS_ROLE=worker`.
4. Port ops controller; wire each maintenance action to its Sapo equivalent.

## Contracts / notes

- Ops endpoints are Pro/admin-guarded; keep the reference guards.
- Import payloads stored in Postgres, not Redis (only `{store, jobId}` in BullMQ) — preserve.

## Tests / validation

- Port `dashboard.service.spec.ts`, `jobs.service.spec.ts`, `ops.{service,controller}.spec.ts`,
  `product.service.spec.ts` with store-domain + mocked Sapo API; all pass.
- Sandbox: run a demo import; dashboard KPIs reflect it; ops resync re-writes storefront config + re-subscribes webhooks.

## Acceptance

- Dashboard/stats render; imports run; ops maintenance actions succeed against Sapo.

## Risks

- Ops actions call several Sapo endpoints → ensure each was built in P04–P08 before wiring.
