# Phase 20 — E2E Validation & Launch Readiness

**Goal:** Prove parity end-to-end on a Sapo sandbox and pass Sapo app-listing requirements.
**Depends on:** 18, 19

## Reference

- Root `verify` script (client build/budget/smoke + server build/lint/test + worker test).
- Reference specs across modules (ported per phase) as the regression baseline.
- Global acceptance criteria in `plan.md`.

## Validation matrix (sandbox, deployed stack)

1. **Install/uninstall/reinstall**: OAuth install → token stored, HMAC verified; uninstall webhook → session cleared,
   data preserved + audit; reinstall → resumes.
2. **Admin**: embedded load, identity resolves, reviews + Q&A moderation, dashboard KPIs, settings, ops actions, media upload.
3. **Storefront**: widget renders reviews list (API) + Q&A + badge; JSON-LD passes Rich Results; approved-only;
   perf rules (single load, no full widget in listings). Verify the branch actually used (metafield-SSR badge
   OR `/public/summaries` badge per D2 outcome).
4. **Webhooks**: verified + idempotent + replay safe + **monotonic upserts don't regress state** (F12);
   store identity from signed body only (F2); deterministic event-id (F9).
5. **Billing**: <!-- Red Team S2: F14 revised. --> **DEFERRED (post-launch, D5)** — not in the v1 launch matrix.
   v1 confirms `featuresUnlocked=true` for every install AND that session TTL / inactive-status still gate
   correctly (not hardcoded Pro).
6. **Sync**: catalog + order backfill + deltas populate Postgres; **per-store rate limit holds under install
   burst** (F3); no cross-store head-of-line blocking.
7. **Security (red-team gates):** token never in client/theme JS; HMAC required + timestamp/replay guard (F8);
   webhook signature required, tenant from signed data only (F2); distinct secrets enforced at bootstrap (F19);
   session cookie `HttpOnly`, no token in URL (F18); CORS via allowlist (not reflector), fail-closed default
   (F17); least-privilege scopes.
7b. **Concurrency:** concurrent review approvals on the same product hold the per-product write lock (F1) —
    no lost updates on `public_summary`.
7c. **Multi-domain:** install with a custom domain + `.mysapo.net` — admin launch + webhook route via any
    `known_domains[]` entry to the canonical (F13).
7d. **Background auth:** simulate expired token — background job on that store pauses queue, does NOT DLQ 8
    retries; admin re-auth prompt appears (F11).
7e. **DDL safety:** simultaneous api + worker cold-start against empty DB completes migrations exactly once
    (F10, advisory lock).
8. **Regression**: full `npm run verify` green.
9. **Cleanliness**: `grep -ri "haravan\|orgid\|apis.haravan\|myharavan"` in new project → zero hits.

## Launch readiness

- Sapo app-listing/app-review requirements ‹VERIFY› satisfied (privacy, scopes justification, screenshots, pricing).
- Load check: reuse `client/scripts` budget + `server/scripts/load-test.js` (ported) against staging.
- Runbooks (P19 operations) verified: webhook re-subscribe, config resync, order resync.

## Steps

1. Execute the validation matrix on the deployed sandbox; log evidence.
2. Fix regressions in the owning phase (don't weaken tests).
3. Complete Sapo listing requirements; submit for review.
4. Sign-off checklist → production launch.

## Acceptance

- All 9 matrix rows pass; `verify` green; Sapo listing requirements met; sign-off recorded.

## Risks / unresolved

- Sapo app-review may impose requirements discovered late → check listing rules during Phase 1/18, not here.
- Any BLOCKED item from Phase 1 without a shipped workaround must be resolved or explicitly de-scoped before launch.
