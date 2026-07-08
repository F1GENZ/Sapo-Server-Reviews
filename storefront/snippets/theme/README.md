# Storefront Widget Installation

## D2 Status: CONFIRMED — `.bwt` reads metafields

Sapo `.bwt` themes can read `shop.metafields.*` and `product.metafields.*`.
**Mode A** (SSR badge via metafield) is active.

## Quick Install

1. Copy `theme/f1genz-sapo-widget.bwt` snippets into your Sapo theme.
2. The app automatically writes `shop.metafields.f1genz.config` on install.
3. All web components load from your API server's `/storefront/` endpoint.

## Snippets Required

| Template | Snippet | Purpose |
|---|---|---|
| `theme.bwt` | Global loader (before `</body>`) | Loads widget JS/CSS, sets `window.__F1GENZ_STOREFRONT_CONFIG` |
| `product.bwt` | Reviews section | `<f1genz-reviews>` web component |
| `product.bwt` | Q&A section | `<f1genz-qna-panel>` web component |
| `product.bwt` | JSON-LD (in `<head>`) | Google Rich Results structured data |
| `collection.bwt` | Rating badge | `<f1genz-rating-badge>` with SSR via `public_summary` metafield |

## Sapo `.bwt` Variables Used

| Variable | Purpose |
|---|---|
| `{{ product.id }}` | Product ID for reviews/Q&A queries |
| `{{ shop.domain }}` | Store domain for API routing |
| `{{ customer.email }}` | Verified buyer identification |
| `{{ shop.metafields.f1genz.config }}` | API server URL config (set by app) |
| `{{ product.metafields.reviews.public_summary }}` | Rating data `{avg, count, distribution}` |
| `{{ product.title }}` | JSON-LD product name |
| `{{ canonical_url }}` | JSON-LD product URL |
| `{{ product.image.src }}` | JSON-LD product image |
| `{{ product.vendor }}` | JSON-LD brand |
| `{{ product.sku }}` | JSON-LD SKU |

## Fallback: Mode B (API-only)

If metafields are unavailable, the widget falls back to fetching data from
`GET /api/public/reviews/:productId/summary` and `/api/public/reviews/:productId`.
Both modes ship in the bundle; Mode A is preferred for SSR performance.
