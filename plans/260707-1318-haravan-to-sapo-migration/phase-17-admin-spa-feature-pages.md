# Phase 17 — Admin SPA Feature Pages

**Goal:** Port all admin feature pages: reviews, Q&A, dashboard, settings, ops, contact, guide.
**Depends on:** 09, 10, 12, 16

## Reference

- `client/src/pages/`: `reviews/`, `qna/`, `dashboard/`, `settings/`, `ops/`, `contact/`, `guide/`, `debug/`, `dev/`.
- `client/src/components/`: `review/*` (incl. `ReviewForm.jsx`), `qna/*`, `dashboard/*`, `layout/*`.
- `client/src/hooks/`: `useCreateReview.js`, `useMediaUpload.js`.
- Backend APIs from P09/P10/P12/P11.

## Build (new project `client/src/pages` + `components` + `hooks`)

- Port **reviews** page + `components/review/*` + `useCreateReview.js`: list, filters, moderation (approve/hide/spam),
  reply, pin, verified badge, media preview, widget-config + spam-config editors.
- Port **qna** page + `components/qna/*`: question list, answer, moderation.
- Port **dashboard** page + `components/dashboard/*`: KPIs, recent activity.
- Port **settings** page: widget config, storefront install instructions (link to Sapo `.bwt` snippets P14), plan.
- Port **ops** page: maintenance actions (resync config, re-subscribe webhooks, resync orders) → Sapo ops (P12).
- Port **contact**, **guide** pages (static-ish; update platform wording Haravan→Sapo).
- Port **useMediaUpload.js** (media P11) + `common/mediaUrl.js`.
- <!-- Red Team S2: F20 — debug empty, drop; dev optional. --> `debug/` empty in reference — do NOT port.
  `dev/index.jsx` behind `DevGate` if kept; otherwise omit.

## Steps

1. Port page-by-page with store-domain identity + react-query keys.
2. Update all UI copy referencing "Haravan" → "Sapo"; storefront install guide points to `.bwt` snippets.
3. Wire media upload in review/Q&A submit forms.
4. Keep antd components + tailwind styling; respect performance budget.

## Contracts / notes

- <!-- Red Team S2: F14 revised — decouple feature-unlock from plan state. -->
  **v1 (D5, revised):** UI reads a single `featuresUnlocked` flag from `/session` endpoint (returns `true` for v1).
  Do NOT hardcode UI gating to any client-side "isPro" derivation; the flag is server-owned so Phase 07
  can flip it later per-store without a UI rewrite. Never block core install/login.
- Settings "storefront install" shows **both** snippet variants (metafield-SSR + ScriptTag/API-badge), selectable
  by which one the merchant's theme supports (P14 ships both).

## Tests / validation

- `npm --prefix client run build && budget && smoke` green.
- Sandbox: full admin walkthrough — moderate a review, answer a question, view dashboard, run an ops action,
  edit widget config, upload media.

## Acceptance

- All admin pages functional against the Sapo backend; no Haravan references in UI; budget/smoke pass.

## Risks

- Feature parity gaps if a page used a Haravan-only field → reconcile with domain APIs (P09/P10).
- Bundle growth from many pages → lazy-load routes to hold the budget.
