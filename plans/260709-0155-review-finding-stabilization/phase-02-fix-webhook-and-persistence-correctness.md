---
phase: 2
title: "Fix webhook and persistence correctness"
status: completed
priority: P1
dependencies: [1]
---

# Phase 2: Fix webhook and persistence correctness

## Overview

Correct the runtime bugs that would still break production behavior even after verification and docs are repaired: wrong webhook registration URL, schema-invalid subscription writes, and storefront config sync that hides real failures.

## Requirements

- Functional:
  - Install-time webhook registration and admin webhook resync must generate the actual receiver URL.
  - Subscription webhook handling must stop writing fields that do not exist in `AppInstall`.
  - Storefront config sync must update existing metafields and create only when the config is truly absent.
  - Ops config resync should reuse the same storefront config writer instead of maintaining a parallel raw create path.
- Non-functional:
  - Preserve the repo's current free-first scope; do not silently reintroduce billing-schema expansion without evidence.
  - Surface degraded sync failures clearly instead of swallowing them behind broad `catch` blocks.
  - Keep changes small and local to the affected Sapo/storefront services.

## Architecture

Recommended direction: **align code to the current schema, not the other way around.**

Current evidence says:
- `AppInstall` does not store billing detail columns like `plan`, `subscriptionId`, `subscriptionStatus`, or `expiresAt`.
- `SubscriptionSnapshot` already exists for storing subscription payload state.
- Current review findings only prove that `SubscriptionService` is writing invalid `AppInstall` fields; they do not prove an active runtime consumer that needs those fields today.

So Phase 2 should:
- keep subscription detail in `SubscriptionSnapshot` (and `AppInstall.metadata` only if a small runtime view truly needs it),
- update `AppInstall` only through fields that exist in `prisma/schema.prisma`,
- use one shared absolute webhook URL builder derived from `AppEnv.API_BASE_URL` + the real controller path,
- use one storefront config writer for install automation and ops resync.

## Related Code Files

- Modify: `src/sapo/webhook-registration.service.ts`
- Modify: `src/ops/ops.service.ts`
- Modify: `src/sapo/subscription.service.ts`
- Modify: `src/storefront/storefront.service.ts`
- Inspect / confirm: `src/sapo/sapo.controller.ts`
- Inspect / confirm: `prisma/schema.prisma`
- Inspect / confirm: `src/sapo/sapo-api.service.ts`
- Optional create: `src/sapo/sapo-webhook-route.ts` or similar tiny shared helper
- Optional modify (only if evidence proves needed): `prisma/schema.prisma`

## Implementation Steps

1. Replace the hardcoded `${API_BASE_URL}/api/webhooks` registration path with the actual install webhook receiver path used by the controller.
2. Point `OpsService.resyncWebhooks()` at the same shared path or helper so install-time registration and manual resync cannot drift.
3. Audit `SubscriptionService.applySnapshotToInstall()` and remove writes to non-schema `AppInstall` fields.
4. Keep store-domain resolution via `snapshot.storeDomain` and `ShopDomain` mapping. Only add schema fields if a real current consumer is proven, not as a speculative billing restore.
5. Harden `StorefrontService.writeStorefrontConfig()`:
   - read existing config,
   - update when present,
   - create only when absent,
   - bubble real API failures so callers can log/report degraded state.
6. Refactor `OpsService.resyncConfig()` to call the hardened storefront writer instead of performing its own raw create request.
7. Add targeted regression coverage for:
   - webhook URL generation,
   - schema-safe subscription application,
   - storefront config update-vs-create behavior.

## Success Criteria

- [x] Install-time webhook registration targets `/api/oauth/install/webhooks`.
- [x] Admin webhook resync uses the same receiver URL as install-time registration.
- [x] No runtime path writes nonexistent `AppInstall` fields.
- [x] `SubscriptionService` remains compatible with free-first scope and current Prisma schema.
- [x] Storefront config sync updates existing metafields and only creates on confirmed absence.
- [x] Ops config resync reuses the shared storefront config writer.

## Risk Assessment

- If there is a hidden dashboard/API consumer of billing fields, trimming `SubscriptionService` too aggressively could remove needed data. Verify consumers before finalizing the schema-aligned path.
- Shared URL helpers can become needless abstraction if only two call sites exist. Keep the helper tiny or inline a shared constant; do not build a framework for one path.
- Storefront config writes run during install automation, so surfacing failures must degrade cleanly without aborting the entire install unless product behavior truly requires that.