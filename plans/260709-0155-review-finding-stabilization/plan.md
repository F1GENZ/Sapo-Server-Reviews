---
title: "Fix confirmed review findings in current Sapo build"
description: "Stabilize verification, route contracts, webhook registration, persistence writes, and storefront config behavior confirmed by the full-project review."
status: completed
priority: P1
branch: "master"
tags: ["stabilization", "review-findings", "sapo"]
blockedBy: []
blocks: ["260707-1318-haravan-to-sapo-migration"]
created: "2026-07-08T19:03:59.796Z"
createdBy: "ck:plan"
source: skill
---

# Fix confirmed review findings in current Sapo build

## Overview

Current server code typechecks and builds, but the review surfaced five concrete defects that make the repository unreliable to verify and unsafe to deploy as-is:

1. `test/lifecycle.test.ts` still imports deleted `src/haravan/*` modules, so `npm test` and `npm run verify` fail before any real assertions run.
2. `.env.example` and several docs still point `SAPO_LOGIN_CALLBACK_URL` at `/api/oauth/login/callback`, while the controller only serves `/api/oauth/install/login/callback`.
3. Install-time webhook registration writes `${API_BASE_URL}/api/webhooks`, while the actual receiver is `/api/oauth/install/webhooks`.
4. `src/sapo/subscription.service.ts` writes `plan`, `subscriptionId`, `subscriptionStatus`, and `expiresAt` onto `AppInstall`, but those columns do not exist in `prisma/schema.prisma`, so charge webhooks can fail at runtime.
5. `src/storefront/storefront.service.ts` treats every metafield read error as "missing config" and falls back to unconditional create, which can mask transient failures and emit duplicate-create requests.

This plan fixes only those confirmed defects plus the minimum regression coverage and docs updates needed to keep them fixed.

## Scope

### In scope
- Restore trustworthy local verification (`npm test`, then `npm run verify`).
- Align callback/webhook route contracts across controller code, env samples, deploy docs, and setup docs.
- Fix webhook registration URL generation and keep manual ops resync on the same contract.
- Reconcile subscription webhook handling with the current free-first schema instead of writing nonexistent `AppInstall` fields.
- Harden storefront config metafield writes so update/create behavior is explicit and debuggable.
- Add or refresh regression coverage for the fixed paths.

### Out of scope
- New feature work, UI redesign, or broad refactors outside the five confirmed findings.
- Reintroducing deferred billing fields into `AppInstall` unless Phase 2 proves an active runtime dependency that is missing from current repo evidence.
- Renaming controller routes beyond aligning callers and docs to the routes already implemented.

## Related Plans

- Overlaps with `plans/260707-1318-haravan-to-sapo-migration/plan.md` on auth, webhook, storefront, and deployment contracts.
- Treat this stabilization plan as a blocker for any further work that assumes the current Sapo build is already safe to verify or deploy.

## Phases

| Phase | Name | Status | Depends | Objective |
|-------|------|--------|---------|-----------|
| 1 | [Restore verification and route contracts](./phase-01-restore-verification-and-route-contracts.md) | Done | — | Make local verification runnable again and remove route/env/doc drift around login and webhook paths. |
| 2 | [Fix webhook and persistence correctness](./phase-02-fix-webhook-and-persistence-correctness.md) | Done | 1 | Correct runtime bugs in webhook registration, subscription persistence, and storefront config writes. |
| 3 | [Validate and document stabilization](./phase-03-validate-and-document-stabilization.md) | Done | 1, 2 | Lock the fixes with regression coverage, repo-wide verification, and final documentation sync. |

## Acceptance Criteria

- `npm test` passes with current `src/sapo/*` modules and no stale `src/haravan/*` imports.
- `npm run verify` passes end-to-end.
- All callback and webhook setup references agree on:
  - login callback: `/api/oauth/install/login/callback`
  - install callback: `/api/oauth/install/callback`
  - webhook receiver: `/api/oauth/install/webhooks`
- Install-time webhook registration and admin ops resync both generate the real webhook receiver URL.
- Subscription webhook handling no longer writes nonexistent Prisma fields on `AppInstall`.
- Storefront config sync updates existing config when present, creates only when absent, and surfaces real failures instead of blindly retrying create.
- Documentation and sample env values match the fixed runtime contracts.

## Validation Strategy

1. Narrow checks first:
   - `npm test`
   - focused assertions/coverage for fixed route and persistence paths
2. Broad repo checks after Phases 1-2:
   - `npm run lint`
   - `npm run build`
   - `npm run verify`
3. Static drift checks:
   - grep for stale `/api/oauth/login/callback`
   - grep for stale `/api/webhooks` registration path where install webhooks are intended
   - grep for stale `src/haravan/` test imports

## Risks

- Subscription persistence fix can go wrong in either direction: over-trimming may drop real billing state, while adding columns back may undo the repo's current free-first scope. Phase 2 must verify actual consumers before choosing.
- Docs drift can reappear if runtime paths stay duplicated in multiple places. Prefer one runtime helper for generated webhook URLs and update docs immediately after code changes.
- Storefront config hardening must not hide Sapo API failures; callers need explicit error surfaces so install/resync degradation is visible.