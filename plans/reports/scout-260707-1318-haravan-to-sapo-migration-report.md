# Scout Report — F1GENZ Reviews: Haravan Coupling Surface

Date: 2026-07-07 13:18
Goal: map every Haravan-platform coupling point to scope a migration to Sapo (Bizweb).

## App summary

F1GENZ Reviews = product **Reviews + Q&A** app for Haravan stores (Judge.me/Yotpo class).

- `server/` — NestJS API (85 TS files). Modules: `haravan` (platform adapter), `catalog`, `product`, `review`, `qna`, `media`, `purchase`, `stats`, `dashboard`, `jobs`, `ops`, `storefront`, `database`, `redis`.
- `client/` — Vite React admin SPA (41 files), embedded in Haravan admin; deployed on Cloudflare Pages (`functions/api/[[path]].js` proxy).
- `worker/` — Cloudflare Worker (R2 image uploads).
- **Postgres/Supabase** = primary app DB (`DatabaseService`); **Redis** = install/session/token state + cache + BullMQ queues.

## Coupling layers (Haravan-specific)

### 1. REST API client — `server/src/haravan/haravan.api.ts`
- Base `https://apis.haravan.com/com`, auth `Authorization: Bearer {token}`.
- Resources: `products.json`, `products/count.json`, `products/{id}.json`, product metafields, `metafields.json` (shop/page/product), `shop.json`, `orders.json`, `webhooks.json`; connect-webhook subscribe `https://webhook.haravan.com/api/subscribe`.
- Custom concurrency limiter + 429 retry (`retry-after`).

### 2. OAuth / OpenID Connect + identity — `server/src/haravan/haravan.service.ts` (2523 lines)
- **OpenID Connect**: `accounts.haravan.com/connect/authorize` + `/connect/token`; `id_token` (JWT RS256) verified against JWKS; claims `orgid` + `orgsub` are the store identity.
- **`orgid` is the primary key everywhere** — Redis keys, session JWT `sub`, webhook routing, storefront config, Postgres `shop_id`.
- App-launch **HMAC** over **unsorted** query params (explicitly *not* Shopify-sorted).
- Token refresh, 15-day trial, Pro/Free plan gating.

### 3. Webhooks + billing — same service + `webhook-event-store.service.ts`
- HMAC header `x-haravan-hmacsha256` over rawBody; topic header `x-haravan-topic`; org header `x-haravan-org-id`.
- Topics: `app_subscriptions/update`, `app/uninstalled`, `shop/update`, `products/*`, `orders/*`.
- `app_subscriptions/update` drives Pro/Free billing state.
- BullMQ queue + event store + idempotency + DLQ-ish retry.

### 4. Data model stored INSIDE Haravan metafields
- Reviews & Q&A serialized to **product metafields** (namespace `reviews`): chunked JSON `chunk_*` (approved/public), `data_chunk_*` (all), `summary`, `public_summary`. See `review/review-metafield.service.ts`, `qna/qna-metafield.service.ts`.
- Also mirrored to Postgres (`review-product-store`, `catalog-product-store`, `purchase-store`, keyed by `shop_id = orgid`) → **app is already dual-storage**, which de-risks migration.

### 5. Storefront widget — `server/storefront/snippets/f1genz-storefront.{js,css}` + `docs/storefront/widget-installation.mdx`
- Web components `<f1genz-reviews>`, `<f1genz-reviews-panel>`, `<f1genz-qna-panel>`, `<f1genz-rating-badge>`.
- Theme (Haravan Liquid) injects `shop.metafields.f1genz.config` → `{apiUrl, orgid}`, then loads CSS/JS from `apiUrl`.
- Rating badge reads `product.metafields.reviews.public_summary` in Liquid (SSR, avoids API in loops).
- Runtime host resolution already supports fallback: `window.__F1GENZ_STOREFRONT_CONFIG` → `data-api-url` on script tag → script origin → legacy host. **ScriptTag-based config works even without storefront metafields.**
- Config written server-side: `writeStorefrontConfig()` → shop metafield `f1genz.config`.

### 6. Admin SPA (client) identity coupling
- `orgid`-centric: `common/authFlow.js`, `AuthStorage.js`, `AuthService.js`, `config/AxiosConfig.js`, `hooks/useOrgRoute.js`, `common/routes.js`, `pages/auth/login`, `pages/auth/grandservice`, `App.jsx`.
- Auth callback params include `id_token`, `session_token`, `code`, `state` (OpenID hybrid).

### 7. Config — `server/.env.example`
- `HRV_URL_AUTHORIZE`, `HRV_URL_CONNECT_TOKEN`, `HRV_CLIENT_ID/SECRET`, `HRV_NONCE`, `HRV_*_CALLBACK_URL`, `HRV_SCOPE_LOGIN/INSTALL`, `HRV_WEBHOOK_URL/SECRET`, `HARAVAN_MAX_CONCURRENT`, `HARAVAN_MIN_INTERVAL_MS`.
- Scopes: `com.read_shop com.read_products com.write_products grant_service offline_access`.

## Haravan → Sapo delta (headline)

| Concern | Haravan (now) | Sapo (target) | Migration weight |
|---|---|---|---|
| Auth | OpenID Connect + id_token + JWKS, `orgid` | OAuth2 code→token, HMAC signature, `{store}.mysapo.net` | **Heavy** (identity model) |
| API host | central `apis.haravan.com/com` | per-store `{store}.mysapo.net/admin` | Medium |
| Auth header | `Authorization: Bearer` | `X-Sapo-Access-Token` | Low |
| Metafields | product+shop, storefront-exposed | Metafield resource exists; **storefront exposure unverified** | **Risk / gating** |
| Webhooks | `x-haravan-*` headers, connect-subscribe | webhook resource CRUD, different headers/sign | Medium |
| Billing | `app_subscriptions/update` | Sapo app charge model (unverified) | Medium |
| Storefront theme | Haravan Liquid | Bizweb `.bwt` + different metafield syntax | Medium |
| Embedded SDK | Haravan App SDK + session token | Sapo Embedded App SDK (unverified) | Medium |

## Unresolved questions (need current Sapo docs + sandbox validation)

1. Does Sapo expose **product + shop metafields to storefront `.bwt` templates**? (Make-or-break for the badge SSR + config-via-metafield path; ScriptTag fallback exists if not.)
2. Sapo **metafield limits**: per-value size (Haravan chunking assumes ~80K), `value_type` json/string support, product-owned metafields.
3. Exact Sapo **OAuth** authorize/token URLs, HMAC param ordering, and whether any id_token/identity claim exists (else identity = store domain).
4. Sapo **webhook** topic names, signature header + algorithm, and subscribe/register endpoint.
5. Sapo **billing/app charge** model + webhook for Pro/Free gating.
6. Sapo **Embedded App SDK** + session-token equivalent for admin identity.
7. Sapo **ScriptTag** resource availability for asset injection.
