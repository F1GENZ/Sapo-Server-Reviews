# Phase 02 — Project Scaffold & Tooling

**Goal:** Stand up the empty `F1GENZ Review Sapo` workspace that builds/lints/tests green with stubs.
**Depends on:** 01

## Reference

- Root `package.json` (verify script), `server/package.json`, `server/nest-cli.json`,
  `server/tsconfig*.json`, `server/eslint.config.mjs`, `client/package.json`, `client/vite.config.js`,
  `worker/wrangler.toml`, `.github/`, `.vscode/`.

## Build (new project `C:\Users\Admin\Desktop\F1GENZ Review Sapo`)

- Root: `package.json` (workspace `verify` script mirroring reference), `.gitignore`, `README.md`, `.editorconfig`.
- `server/`: `package.json` (rename `f1genz-*`, keep deps: nest, axios, bullmq, ioredis, pg, jsonwebtoken),
  `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, `eslint.config.mjs`, `jest` config, empty `src/`.
- `client/`: `package.json`, `vite.config.js`, `index.html`, `scripts/check-performance-budget.js`,
  `scripts/smoke-routes.cjs`, `public/`, empty `src/`.
- `worker/`: `package.json`, `wrangler.toml` (new bucket name `f1genz-sapo-images` ‹confirm›).
- `docs/`: `docs.json` shell.

## Steps

1. Create folder tree; `git init` (no reference history).
2. Port build/lint/test configs verbatim; bump package names to `f1genz-review-sapo-*`.
3. Add root `verify` = client build+budget+smoke + server build+lint+test + worker test.
4. Create `src/main.ts` + `src/worker.ts` NestBootstrap stubs + empty `app.module.ts`.
5. Add `.env.example` placeholders (finalized Phase 18): DB, Redis, `SAPO_*`, R2, session.
6. Confirm `npm ci` in each package resolves.

## Contracts / notes

- Keep the two-entrypoint model (`main.ts` API, `worker.ts` queue worker) and `PROCESS_ROLE` switch — it is
  platform-neutral and used by the queue design (Phase 06).
- Rename any `haravan-reviews:*` BullMQ/Redis prefixes → `f1genz-sapo:*`.

## Tests / validation

- `npm --prefix server run build && npm --prefix server run lint` green (empty app).
- `npm --prefix client run build` green (placeholder index).
- Root `npm run verify` runs (may no-op on empty tests).

## Acceptance

- Fresh clone builds all three packages with no reference dependency, no `haravan`/`orgid` strings.

## Risks

- Dependency drift vs reference lockfiles → copy `package-lock.json` then prune unused (BullMQ/pg kept).
