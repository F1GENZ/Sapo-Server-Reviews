# Phase 19 — Documentation

**Goal:** Author the new project's docs (Sapo-specific), covering setup, auth, storefront install, deploy, operations.
**Depends on:** 03–17

## Reference

- `docs/`: `index.mdx`, `docs.json`, `getting-started/`, `configuration/`, `haravan/{app-setup,auth-flow}.mdx`,
  `haravan-auth-flow-detail-final.md`, `storefront/*` (`overview`, `widget-installation`, `media-upload`,
  `local-development`), `deploy-*.md`, `cloudflare-r2-setup.md`, `router-guide.md`, `performance-budget.md`, `api/`.

## Build (new project `docs/`)

- `docs.json` + `index.mdx` — nav shell for the Sapo app.
- `getting-started/` — local dev, prerequisites (Sapo dev store, credentials).
- `sapo/app-setup.mdx` — register app, scopes ‹VERIFY›, callback URLs, install flow.
- `sapo/auth-flow.mdx` — OAuth2 code exchange, HMAC/signature, session tokens, store-domain identity
  (rewrite of Haravan auth-flow, no OpenID/id_token/JWKS).
- `storefront/widget-installation.mdx` — Sapo `.bwt` snippets covering **both storefront modes**:
  Mode A (metafield SSR badge — if `.bwt` exposes metafields) and Mode B (ScriptTag + API-fetched badge —
  always works). Merchant picks the snippet that matches their theme's capabilities. Also: rating badge,
  JSON-LD, media-upload, overview, local-development.
- `configuration/` — env reference (`SAPO_*`, DB, Redis, R2, session).
- `deploy-*.md`, `cloudflare-r2-setup.md` — adapted for the new domains + Sapo credentials.
- `operations/` — webhook re-subscribe, config resync, order resync runbooks (ops P12).

## Steps

1. Port doc structure; rewrite Haravan-specific pages for Sapo from Phase 1 verified facts.
2. Replace all `orgid`/Haravan references with store-domain/Sapo.
3. Keep platform-neutral docs (media, performance-budget, router-guide) with minimal edits.
4. Verify code snippets compile/run against the new project.

## Contracts / notes

- No invented Sapo values — every endpoint/scope/topic cites the Phase 1 fact table.
- Docs live in the new project's `docs/` (Mintlify-style, per reference).

## Tests / validation

- `docs.json` validates; internal links resolve; snippets match shipped behavior.

## Acceptance

- A new developer can install, run, deploy, and install-on-Sapo using only the new docs.

## Risks

- Docs drift vs `‹VERIFY›` values → write docs after Phase 1 resolves them; cross-check at Phase 20.
