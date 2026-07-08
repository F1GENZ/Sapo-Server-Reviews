# Phase 09 — Reviews Domain

**Goal:** Full reviews feature: CRUD, moderation, summaries, verified-buyer, spam/widget config, admin + public APIs,
Postgres source-of-truth + storefront `public_summary` metafield sync.
**Depends on:** 04, 05, 08

## Red Team Hardening (S2) — MUST DO
- **[F4 Critical, D4 revised] Metafield sync is `public_summary`-ONLY.** Do **not** port `chunk_*`,
  `data_chunk_*`, or `summary` — evidence: grep finds `chunk_`/`data_chunk_` only in the 2 writer files
  (`review-metafield.service.ts:130-156`, `qna-metafield.service.ts` counterpart); `loadSummary` has **0 callers**;
  the storefront reads only `public_summary` (`docs/storefront/widget-installation.mdx:72-73`,`:102`); public
  review LIST comes from the API (`public-review.controller.ts:89`). Removes `CHUNK_SIZE_LIMIT`,
  `chunkReviews`, `writeChunkSet`, delete-excess loop, and eliminates F1's whole class of concurrency bugs.
- **[F1 Critical] Per-product Redis write lock is REQUIRED — port from `review.service.ts`.** Even for the
  small `public_summary` write, wrap every mutation path in `acquireLock('lock:reviews:${storeDomain}:${productId}')`
  → SETNX (reference: `review.service.ts:2601-2604`, used at `:1312,:2345,:2401,:2449`). It is what prevents
  lost updates across concurrent approvals + api/worker processes. The lock lives in `review.service.ts`,
  **not** in `review-metafield.service.ts`; do not port only the metafield file.

## Reference

- `server/src/review/`: `review.service.ts` (incl. `acquireLock`/`releaseLock`), `review-product-store.service.ts`
  (Postgres source), **`review-metafield.service.ts`** (port `public_summary` write path only — drop chunking),
  `review.controller.ts` (admin), `public-review.controller.ts` (storefront), `review-products.controller.ts`,
  `review.module.ts`, `dto/*`, `interfaces/*`, specs.

## Build (new project `src/review/`)

- Port `review.service.ts` + `review-product-store.service.ts` (Postgres) **as-is** (identity=store domain);
  **port the per-product write lock** (F1).
- Port `review-metafield.service.ts` → depend on `SapoApiService`, **`public_summary` only** (F4/D4):
  - Compute `public_summary = { avg, count, distribution }` from approved reviews; write/update via
    `SapoApiService.upsertProductMetafield(storeDomain, productId, { namespace: 'reviews', key: 'public_summary', value_type: 'json', value })`.
  - **Delete** these helpers/paths from the port: `chunkReviews`, `writeChunkSet`, `CHUNK_SIZE_LIMIT`,
    delete-excess loop, `data_chunk_*`/`summary` families.
  - D2 gate: if Phase 01 finds `.bwt` cannot read metafields at all, badge/JSON-LD move to an API-fetched
    `/public/summaries` (Phase 13); review LIST is API either way, so Postgres source of truth is unaffected.
- Port controllers (admin + public) + DTOs + interfaces + specs.

## Steps

1. Port Postgres review store + service (moderation states approved/pending/hidden/spam, reply, pin, verified);
   port `acquireLock`/`releaseLock` and wrap every mutation that recomputes `public_summary` (F1).
2. Port `public_summary`-only metafield sync (F4/D4); drop chunk/summary infrastructure entirely.
3. Port admin controller (list/create/update/status/reply/spam-config/widget-config) + public controller
   (list approved, submit review with media, summary).
4. Port summary math (`calculateSummary` admin, `calculatePublicSummary` storefront).
5. Wire verified-buyer check against purchase mirror (P08).

## Contracts / notes

- Public API returns approved-only; admin sees all. Preserve exactly.
- Media references (image/video URLs) come from P11; keep `media` field shape.
- Widget config + spam config stored per store (metafield or DB per reference) — keep read path the widget expects.

## Tests / validation

- Port `review.service.spec.ts` + `review-product-store.service.spec.ts` + `public-review.controller.spec.ts`
  with store-domain fixtures + mocked `SapoApiService`; all pass.
- Sandbox: submit review (storefront) → pending → approve (admin) → appears in public list + summary updates.

## Acceptance

- Reviews CRUD + moderation + summaries + verified-buyer work; storefront read path consistent with D2 decision.

## Risks

- `public_summary` is tiny (~100 bytes); metafield cap risk collapses to zero.
- Concurrent approvals recompute `public_summary` — the per-product write lock (F1) is the guard.
