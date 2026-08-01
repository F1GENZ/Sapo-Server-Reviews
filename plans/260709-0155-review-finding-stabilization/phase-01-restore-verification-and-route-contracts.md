---
phase: 1
title: "Restore verification and route contracts"
status: completed
priority: P1
dependencies: []
---

# Phase 1: Restore verification and route contracts

## Overview

Repair the broken verification surface first, then align route/env/docs contracts so future setup and review work uses the same callback and webhook paths as the current controller implementation.

## Requirements

- Functional:
  - `npm test` must execute against the current `src/sapo/*` code instead of deleted `src/haravan/*` modules.
  - `.env.example` and setup/deploy/auth docs must use the login callback route actually served by `src/sapo/sapo.controller.ts`.
  - Webhook route references in docs must match the existing receiver path `/api/oauth/install/webhooks`.
- Non-functional:
  - Keep route naming stable unless there is a compelling reason to rename runtime endpoints.
  - Prefer the smallest contract-alignment changes that unblock verification and reduce drift.

## Architecture

Use the current controller as the source of truth for route names:
- login start: `/api/oauth/install/login`
- login callback: `/api/oauth/install/login/callback`
- install callback: `/api/oauth/install/callback`
- webhook receiver: `/api/oauth/install/webhooks`

The test suite should validate current Sapo lifecycle behavior, not legacy Haravan flows. If the existing lifecycle test is too stale to patch safely in place, split it into smaller Sapo-focused tests rather than preserving dead Haravan abstractions.

## Related Code Files

- Modify: `test/lifecycle.test.ts`
- Modify: `.env.example`
- Modify: `docs/getting-started-sapo.md`
- Modify: `docs/sapo-auth-flow.md`
- Modify: `docs/deploy-sapo.md`
- Modify: `docs/oauth-install-login.md`
- Inspect / confirm source of truth: `src/sapo/sapo.controller.ts`
- Optional create (only if duplication remains after patch): `src/sapo/sapo-route-contract.ts`

## Implementation Steps

1. Rewrite `test/lifecycle.test.ts` so it imports current `src/sapo/*` services/controllers and removes dead `src/haravan/*` references.
2. Decide whether to keep one broad lifecycle file or split it into a few smaller Sapo-focused test units; prefer the cheaper option that makes failures readable.
3. Update `.env.example` so `SAPO_LOGIN_CALLBACK_URL` matches `/api/oauth/install/login/callback`.
4. Sweep setup/deploy/auth docs for stale login callback and webhook route strings; update them to the controller contract.
5. If webhook/login paths are duplicated across runtime code beyond one or two call sites, add a tiny route-contract helper and point callers/tests at it. Skip this if a helper would be more ceremony than value.
6. Run `npm test` and fix any follow-on failures caused by the test rewrite before moving to Phase 2.

## Success Criteria

- [x] `npm test` runs without `MODULE_NOT_FOUND` or stale Haravan imports.
- [x] `.env.example` points login callback to `/api/oauth/install/login/callback`.
- [x] Auth/deploy docs no longer claim `/api/oauth/login/callback` or another stale login route.
- [x] Webhook receiver docs align with `/api/oauth/install/webhooks`.
- [x] No route rename is introduced unless every dependent reference is updated in the same phase.

## Risk Assessment

- The stale lifecycle test may embed Haravan-only assumptions beyond import paths. If so, forcing a line-by-line rename will waste time; prefer cutting it into current Sapo expectations.
- Docs drift is easy to miss because the same route appears across setup, deploy, and auth docs. End Phase 1 with a grep-based sweep, not spot fixes.