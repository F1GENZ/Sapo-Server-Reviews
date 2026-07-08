# Phase 01 — Sapo Platform Facts Verification Report

Date: 2026-07-08
Sources: Sapo support docs (support.sapo.vn) + user sandbox confirmations

## D2 Verdict: `.bwt` Metafield Exposure

**CONFIRMED** — Sapo `.bwt` themes can read product and shop metafields.

→ Mode A (SSR badge + JSON-LD từ metafield) được kích hoạt.
→ Mode B (API fallback) vẫn ship trong bundle, nhưng không dùng trừ khi có custom domain bị lỗi.

---

## Fact Table

| # | Concern | Haravan Baseline | Sapo Value | Status |
|---|---------|-----------------|------------|--------|
| 1 | Auth model | OpenID Connect + id_token + JWKS | OAuth2 authorization code grant | CONFIRMED |
| 2 | Authorize URL | `accounts.haravan.com/connect/authorize` | `https://{store}.mysapo.net/admin/oauth/authorize` | CONFIRMED |
| 3 | Token exchange | POST với id_token | `POST /admin/oauth/access_token` (client_id, client_secret, code) | CONFIRMED |
| 4 | Auth header | `Authorization: Bearer` | `X-Sapo-Access-Token` | CONFIRMED |
| 5 | Install HMAC | Unsorted params, SHA256 | **Sorted A-Z**, SHA256, base64, header `hmac` | CONFIRMED |
| 6 | Refresh token | Có (24h) | **Không có** — token vĩnh viễn | CONFIRMED |
| 7 | Identity key | `orgid` (từ id_token) | `store` domain (từ token response hoặc shop API) | CONFIRMED |
| 8 | API base URL | `apis.haravan.com/com` (central) | `https://{store}.mysapo.net/admin` (per-store) | CONFIRMED |
| 9 | Webhook topics | `products/*`, `orders/*`, `app/uninstalled`, `app_subscriptions/update`... | `products/create\|update\|delete`, `orders/create\|updated\|paid\|cancelled\|fulfilled`, `app/uninstalled`, `store/update`, `app/charge` + 15+ khác | CONFIRMED |
| 10 | Webhook register | POST subscribe API | `POST /admin/webhooks.json` (CRUD REST) | CONFIRMED |
| 11 | Webhook format | JSON | `json` (default) hoặc `xml` → chọn json | CONFIRMED |
| 12 | Webhook signature | `x-haravan-hmacsha256` header | **Chưa rõ** — cần test sandbox | NEEDS TEST |
| 13 | Webhook store identity | `x-haravan-org-id` header | **Chưa rõ** — cần test sandbox | NEEDS TEST |
| 14 | Webhook delivery-id | Không có (tự generate randomBytes) | **Chưa rõ** — cần test sandbox | NEEDS TEST |
| 15 | Webhook verify-challenge | Không có | **Không thấy trong docs** — có vẻ không có GET handshake | ASSUMED NONE |
| 16 | ScriptTag | Không dùng (inject qua Liquid) | `POST /admin/script_tags.json`, event `onload`, src phải `https://` | CONFIRMED |
| 17 | Product metafield | `POST /com/products/{id}/metafields.json` | `POST /admin/products/{id}/metafields.json` | CONFIRMED |
| 18 | Shop metafield | Có | `POST /admin/metafields.json` với `owner_resource: "shop"` | CONFIRMED |
| 19 | Metafield value_type | string, json_string, integer | **Chỉ `string` và `integer`** — không có json/json_string | CONFIRMED |
| 20 | Metafield size limit | ~80KB (chunk ở mức đó) | **Chưa rõ** — cần test sandbox | NEEDS TEST |
| 21 | Metafield upsert | Không (update by ID) | Không (update by ID) | CONFIRMED |
| 22 | Pagination | page-based + cursor hỗn hợp | **Chưa rõ** — docs có cả `page`/`limit` lẫn `since_id` | ASSUMED PAGE |
| 23 | Rate limit | Không rõ, tự throttle | **Chưa rõ** — không thấy `X-RateLimit-*` trong docs | NEEDS TEST |
| 24 | Billing | `app_subscriptions/update` webhook | `app/charge` topic tồn tại, nhưng hoãn post-launch (D5) | DEFERRED |
| 25 | Embedded App SDK | Haravan App SDK + session token | **Bỏ qua** — test trực tiếp ở Phase 16 | SKIPPED |
| 26 | .bwt metafield read | N/A (Haravan Liquid) | `{{ product.metafields.reviews.public_summary }}` — đọc được | CONFIRMED |
| 27 | .bwt shop metafield | N/A | `{{ shop.metafields.f1genz.config }}` — đọc được | CONFIRMED |
| 28 | .bwt product.id | `{{ product.id }}` | Giữ nguyên | CONFIRMED |
| 29 | .bwt customer.email | `{{ customer.email }}` | Giữ nguyên | CONFIRMED |
| 30 | .bwt product_img_url | `{{ product.image.src }}` hoặc filter | Dùng filter tương đương của Sapo | CONFIRMED |
| 31 | .bwt money filter | `money_without_currency` | Dùng filter tương đương của Sapo | CONFIRMED |
| 32 | .bwt canonical_url | `{{ canonical_url }}` | Giữ nguyên | CONFIRMED |
| 33 | OAuth scopes | `com.read_shop com.read_products...` | `read_products write_products read_orders write_orders read_customers write_customers read_script_tags write_script_tags read_themes write_themes` | CONFIRMED |

## Scopes (chọn cho app)

```
read_products write_products
read_orders write_orders
read_customers write_customers
read_script_tags write_script_tags
read_themes write_themes
```

Không cần `read_content/write_content` (article/blog), không cần price_rules, không cần draft_orders.

## Key Differences from Haravan (thiết kế ảnh hưởng)

1. **HMAC sorted** — khác Haravan unsorted. Phải viết lại hàm verify HMAC.
2. **Không refresh token** — token vĩnh viễn → không cần cron refresh, nhưng phải bắt 401 để phát hiện token bị thu hồi (uninstall/reinstall).
3. **Không có id_token** — identity là store domain từ token response hoặc shop API.
4. **Per-store base URL** — mỗi store có URL API riêng, không phải central host.
5. **value_type chỉ string/integer** — JSON phải stringify khi ghi metafield.
6. **ScriptTag** — cần để inject widget bundle, Haravan không cần cái này.

## Remaining — Cần Test Sandbox

| # | Mục | Ưu tiên |
|---|-----|---------|
| 1 | Webhook signature header + algorithm | **Cao** (Phase 06) |
| 2 | Webhook store identity header/body field | **Cao** (Phase 06) |
| 3 | Webhook delivery-id (unique per delivery) | **Cao** (Phase 06) |
| 4 | Rate limit constants | Trung bình (Phase 04) |
| 5 | Metafield value size cap | Thấp (public_summary ~100 bytes) |

## Blockers Resolved

- **D2 (metafield `.bwt` exposure):** CONFIRMED — không blocker.
- **OAuth shape:** CONFIRMED — đủ để code Phase 04-05.
- **Webhook topics + đăng ký:** CONFIRMED — đủ để code Phase 06 structure.
- **ScriptTag:** CONFIRMED — đủ để code Phase 13.
- **.bwt variables:** CONFIRMED — đủ để code Phase 14.
