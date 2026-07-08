# Phase 14 — Storefront Theme Integration (Sapo `.bwt` widget)

**Goal:** Render reviews, Q&A, rating badge, and JSON-LD on a Sapo/Bizweb theme via the web-component widget.
**Depends on:** 01 (D2), 13

## Red Team Hardening (S2) — MUST DO
- **[F4 D4 revised] Product review LIST is API-fetched everywhere.** Widget calls `/public/reviews?product_id=...`.
  No `.bwt` chunk reads (never existed anyway). Rating badge reads `product.metafields.reviews.public_summary`
  when `.bwt` exposes metafields (D2 = yes); otherwise fetches from `/public/summaries` (Phase 13).
- **[F5 Critical] Path decision is now a soft gate.** D4 revision means D2 = no falls back gracefully to
  API-fetched badge — no work stall, no user escalation needed. Update dependency diagram to reflect this.
**Skills:** `sapo-theme-snippets`, `sapo-theme-product-page`, `sapo-theme-collection-page`, `sapo-theme-seo-content`.

## Reference

- `docs/storefront/widget-installation.mdx` — Haravan Liquid snippets: global loader, `<f1genz-reviews>` /
  `<f1genz-reviews-panel>` / `<f1genz-qna-panel>` / `<f1genz-rating-badge>`, JSON-LD Product schema, host resolution.
- `server/storefront/snippets/f1genz-storefront.js` — web-component runtime (attributes: `product-id`, `orgid`,
  `customer-email`, `customer-phone`, `avg-rating`, `review-count`).

## Build (new project)

<!-- Red Team S2: D4 revised — only public_summary is metafield-SSR-eligible; review LIST always API. -->
**Two graceful modes based on D2 outcome:**
- **A · Metafield SSR (D2 = yes):** loader reads `shop.metafields.f1genz.config`; badge/JSON-LD read
  `product.metafields.reviews.public_summary`. Review LIST widget is API-fetched (no chunks).
- **B · API-only (D2 = no):** loader loaded via **ScriptTag** (P13) with `data-api-url` + `data-store`; badge
  fetches from `/public/summaries` (batched, P13); JSON-LD rendered client-side by widget after summary fetch.
Both modes ship; Phase 01 decides which the theme snippet uses.

- Update widget attributes: `orgid` → `store` (store domain) across the bundle + docs.
- Author Sapo `.bwt` snippets (equivalent of the Liquid ones):
  - **Global loader** (in `theme.bwt` before `</body>`): expose `window.__F1GENZ_STOREFRONT_CONFIG` + load CSS/JS.
    - Mode A: from `shop.metafields.f1genz.config` `.bwt` accessor ‹VERIFY›.
    - Mode B: hardcode via ScriptTag (P13) — no theme metafield; loader reads `data-*`/script origin.
  - **Product widget** (`product.bwt`): `<f1genz-reviews>` with `product.id`, customer email/phone from Sapo objects ‹VERIFY›.
  - **Rating badge** (product card / `collection.bwt`): Mode A reads `product.metafields.reviews.public_summary` ‹VERIFY›;
    Mode B fetches from `/public/summaries` (batched, P13).
  - **JSON-LD** (`product.bwt`): port the schema; replace Haravan Liquid filters (`product_img_url`,
    `money_without_currency`, `canonical_url`) with Sapo `.bwt` equivalents ‹VERIFY›; keep aggregateRating from summary.

## Steps

1. Confirm Sapo `.bwt` metafield exposure (Phase 01) → pick mode A or B; both ship in the widget/build.
2. Port web-component runtime with `store` attribute; keep single-load + no-full-widget-in-loop perf rules.
3. Author `.bwt` snippets via theme skills; validate object/filter names against Sapo docs + sandbox theme.
4. Validate JSON-LD via Rich Results test on a Sapo product page.

## Contracts / notes

- Approved-only on storefront; admin-only statuses never exposed.
- Keep asset single-load in layout; badges must not trigger full review-list fetches in listings.
- Customer identity fields (`customer.email`/`phone`) sourced from Sapo theme objects for verified-buyer prefill.

## Tests / validation

- Sandbox Sapo theme: product page renders reviews + Q&A + badge; submit-with-media respects widget config;
  collection page shows badge only; JSON-LD passes Rich Results.
- Console shows no fallback-host warning (config discovered correctly).

## Acceptance

- Full storefront experience works on a real Sapo theme for both D2 paths.

## Risks

- `.bwt` object/filter differences (image URL, money, canonical) → resolve names in Phase 01/here via theme skills.
- If Sapo objects lack `customer.phone` → drop phone prefill gracefully.
