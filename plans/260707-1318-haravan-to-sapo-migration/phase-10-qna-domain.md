# Phase 10 — Q&A Domain

**Goal:** Full Q&A feature: questions/answers CRUD, moderation, admin + public APIs. Postgres source of truth;
NO metafield sync in v1 (Q&A has no storefront-side SSR badge equivalent).
**Depends on:** 04, 05, 08

## Red Team Hardening (S2) — MUST DO
- **[F4 Critical, D4 revised] Drop Q&A metafield sync entirely.** Q&A has no `public_summary` equivalent; the
  reference `qna-metafield.service.ts` writes chunks nothing reads (`qna.service.ts:408-412` reads Postgres,
  returns `metafields: []`). Storefront Q&A panel calls the API lazily (`docs/storefront/widget-installation.mdx`).
  Do **not** port `qna-metafield.service.ts`.
- **[F1 Critical] Per-question write lock** if Postgres transactions don't already cover the answer/status flow —
  Postgres row-level locks are sufficient for the DB store, so add lock only if a metafield write is reintroduced.

## Reference

- `server/src/qna/`: `qna.service.ts`, `qna-store.service.ts` (Postgres `qna_questions`),
  ~~`qna-metafield.service.ts`~~ (**dropped, F4/D4**),
  `qna.controller.ts` (admin), `public-qna.controller.ts` (storefront), `qna.module.ts`,
  `dto/*` (create/update question, answer), `interfaces/qna.interface.ts`, `qna.service.spec.ts`.

## Build (new project `src/qna/`)

- Port `qna.service.ts` + `qna-store.service.ts` (Postgres) as-is (identity=store domain).
- **Skip** `qna-metafield.service.ts` (F4/D4 cut).
- Port admin + public controllers + DTOs + interface + spec.

## Steps

1. Port Postgres Q&A store + service (question states, answer, moderation).
2. Port admin controller (list/create/update/answer/status) + public controller (list answered, submit question).
3. Reuse verified-buyer + customer identity fields consistent with reviews.

## Contracts / notes

- Public API returns approved/answered only; admin sees all.
- Storefront Q&A panel calls the API lazily (widget behavior, P14) — no metafield read/write path.

## Tests / validation

- Port `qna.service.spec.ts` with store-domain fixtures + mocked Sapo API; passes.
- Sandbox: submit question (storefront) → admin answers/approves → appears in public Q&A list.

## Acceptance

- Q&A CRUD + moderation + public/admin split work; storefront reads via API.

## Risks

- None from metafields (path removed). Ordinary Postgres/API risks only.
