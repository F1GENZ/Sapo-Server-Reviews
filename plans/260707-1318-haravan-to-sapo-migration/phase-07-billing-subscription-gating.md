# Phase 07 — Billing & Subscription Gating

> <!-- Updated: Validation Session 1 — D5 free-first. --> **DEFERRED (post-launch, D5).** v1 launches with
> **no paid gating** — all installs run Pro-equivalent (see Phase 05). Build this phase **after** launch, once
> Sapo's charge/recurring API + billing webhook are confirmed (Phase 01 may leave these BLOCKED without impact).
> Not a launch blocker; not on the Phase 20 launch matrix.

**Goal:** Drive Pro/Free gating from Sapo's app charge model (event + polling fallback).
**Depends on:** 05, 06 · **Blocks launch:** No (deferred)

## Reference

- `haravan.service.ts`: `getSubscriptionPayload`, `normalizeSubscriptionStatus`, `getFirstDateMs`,
  `buildSubscriptionSnapshot`, `applySubscriptionToInstall`, `isProPlan`, `getInstallTtlSeconds`,
  subscription Redis key, `app_subscriptions/update` handling, quota fields (`quota_total/remaining`).
- `server/src/haravan/haravan.cron.ts` — periodic subscription/token refresh.

## Build (new project `src/platform/sapo/`)

- `sapo-billing.service.ts`:
  - Map Sapo charge/recurring-charge status ‹VERIFY› → `SubscriptionSnapshot { status, plan:'Pro'|'Free',
    is_active, expires_at?, synced_at }` (port shape unchanged).
  - `applySubscriptionToInstall()` + `isProPlan()` ported → keeps the rest of the app plan-agnostic.
  - Charge lifecycle helpers: create charge / activate / query current charge via `SapoApiService` ‹VERIFY›.
- `sapo.cron.ts`: periodic reconcile of charge status for active installs (fallback if no billing webhook) +
  proactive token refresh; port cadence from reference cron.
- Webhook hook (P06): subscription topic → `buildSubscriptionSnapshot` → persist → `applySubscriptionToInstall`.

## Steps

1. Confirm Sapo billing model (recurring vs one-time; trial support) from Phase 01.
2. Implement snapshot mapping + gating; keep Pro/Free semantics identical to reference.
3. Wire subscription webhook path (if exists) + cron reconcile (always, as safety net).
4. Enforce gating where the reference does: `resolveAccessToken`/install status checks + feature limits.

## Contracts / notes

- Keep `status`/`plan`/`expires_at`/`quota_*` fields so domain code (P09/P10/P17) reads plan the same way.
- <!-- Red Team S2: F14 — 15-day trial contradicts free-first; dropped. When Phase 07 undefers, choose a trial
      policy at that time. --> No hardcoded trial default; Phase 07 re-decides on undefer.
- Gating must fail closed for Free-limited features but never lock out install/login.

## Tests / validation

- Unit: status→snapshot for active/canceled/expired/trial; `isProPlan` transitions; TTL calc.
- Sandbox: approve a charge → Pro; cancel → Free; cron reconcile flips state without a webhook.

## Acceptance

- Pro/Free state is correct via webhook and/or cron; feature gating matches reference behavior.

## Risks

- No billing webhook → rely on cron polling (higher latency); document expected lag.
- Charge object fields differ → keep mapping isolated in `sapo-billing.service.ts`.
