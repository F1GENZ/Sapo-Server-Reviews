# Hồ sơ listing Sapo App Store - F1GENZ Reviews

Hồ sơ này gom các mục cần nộp khi bấm "Yêu cầu xác nhận" trên Partner portal (app 3833). Mọi dữ kiện kỹ thuật dưới đây lấy từ code và test trong repo; mục nào Sapo chưa công bố tiêu chí thì ghi rõ.

## 1. Thông tin cơ bản

| Mục | Giá trị |
|---|---|
| Tên app | F1GENZ Reviews - Đánh giá sản phẩm |
| Embedded | Bật (admin SPA nhúng trong trang quản trị Sapo) |
| Application URL | `https://api-sapo-reviews.f1genz.dev/api/oauth/install/callback` (đọc từ portal app 3833; Admin SPA ở `https://reviews-sapo.f1genz.dev`) |
| Callback URL (install) | `https://api-sapo-reviews.f1genz.dev/api/oauth/install/callback` |
| Login callback | `https://api-sapo-reviews.f1genz.dev/api/oauth/install/login/callback` |
| Webhook URL | `https://api-sapo-reviews.f1genz.dev/api/oauth/install/webhooks` |
| Scopes | `read_products,write_products,read_orders,write_content` (`worker/wrangler.jsonc`, bản production; xem mục 2 về `write_content`) |
| Mô hình bán | 119.000đ/tháng đặt ở form đăng listing; app không có code kiểm tra trả phí (xem mục 7) |

## 2. Giải trình scope

| Scope | Dùng để | Vị trí code |
|---|---|---|
| `read_products` | Đồng bộ danh mục sản phẩm để gắn đánh giá | `src/catalog/catalog-sync.service.ts`, `getProducts/getProduct` |
| `write_products` | Ghi metafield điểm đánh giá (`f1genz_reviews.rating_avg`, `rating_count`, `public_summary`) và `f1genz.config` | `createProductMetafield/updateProductMetafield`, `createMetafield/updateMetafield` |
| `read_orders` | Nhận webhook `orders/*` và đối chiếu người mua đã mua sản phẩm (cổng "đã mua hàng") | `src/sapo/webhook.service.ts`, `src/purchase/*`. App không gọi API đọc đơn hàng nào: đơn chỉ được ghi từ webhook nhận được sau khi cài |
| `write_content` | Chưa có giải trình đã kiểm chứng | Code không gọi tài nguyên nào Sapo gán cho scope này (Article, Blog, Comment, Page, Redirect; `support.sapo.vn/oauth`): chỉ có `/products/{id}/metafields.json` và `/metafields.json` trong `src/sapo/sapo-api.service.ts` và `worker/src/core/sapo/sapo-api.service.ts`. [INFERENCE] Sapo có thể gán metafield cấp cửa hàng (`f1genz.config`, `f1genz.api_url`, `f1genz.store_domain`) vào scope này; chưa thử bỏ nó. Quyết định giữ hay bỏ: `docs/sapo-publish-playbook.md` mục 5 |

Không xin: scope theme, script tag, customer. `write_content` được xin (hàng trên) dù code không dùng tài nguyên nào của nó. Giải trình `write_products` cho metafield shop-level là suy luận, và việc Sapo yêu cầu `read_orders` để đăng ký webhook đơn hàng cũng chưa đo được; cả hai cần xác nhận bằng lần cài thật (mục 8).

## 3. Dữ liệu app lưu

| Dữ liệu | Nơi lưu | Ghi chú |
|---|---|---|
| Access token Sapo | `AppInstall.accessTokenCiphertext` | Mã hoá AES-256-GCM, không trả về trình duyệt; xoá khi gỡ app |
| Danh mục sản phẩm | `catalog_products` | Tên, handle (alias Sapo), ảnh, tag, trạng thái |
| Đơn hàng (đối chiếu người mua) | `customer_purchases` | Email và số điện thoại chỉ lưu dạng hash (HMAC, `hash_version = 2`); không có địa chỉ hay tên người mua. Chỉ gồm đơn nhận qua webhook sau khi cài, không có backfill |
| Nhật ký webhook | `WebhookEvent` (Prisma model không có `@@map`, nên tên bảng là `WebhookEvent`) | Với `orders/*` chỉ lưu bản chiếu không có PII: `id`, `order_number`, `name`, trạng thái, mốc thời gian, `line_items: [{ product_id }]`, `email_hash`, `phone_hash`. Topic khác giữ payload nguyên (không chứa dữ liệu người mua). Header nhạy cảm bị lọc |
| Đánh giá, hỏi đáp | `review_products`, `qna_questions` | Tên tác giả, email, số điện thoại do khách tự nhập |
| Ảnh/video đính kèm đánh giá | Cloudflare R2 (bucket `f1genz-sapo-reviews-media`, binding `MEDIA_BUCKET` của Worker); URL lưu trong `review_products.media` | Khoá đối tượng do server đặt tên theo loại nội dung; tên file khách gửi không còn nằm trong ticket. Giới hạn 5 MB ảnh, 2 MB video |
| Cấu hình widget | metafield và `AppInstall` | Không chứa dữ liệu khách |

Nơi lưu thật ở production (`worker/wrangler.jsonc`, `worker/src/index.ts`, `worker/src/store-do.ts`, `worker/src/db/prisma-sqlite.ts`): Worker `f1genz-sapo-reviews-api` giữ toàn bộ bảng ở trên trong SQLite của một Durable Object `StoreDO` (`idFromName('global')`, `locationHint: 'apac'`); mọi cửa hàng dùng chung đối tượng này và tách nhau bằng cột `storeDomain`. Tên bảng giữ như liệt kê (`Shop`, `AppInstall`, `WebhookEvent`, `catalog_products`, `customer_purchases`, `review_products`, `qna_questions`...). Cron `*/5 * * * *` và queue `f1genz-sapo-reviews-events-queue` chạy bộ dọn nền; hằng số lưu giữ (30 ngày, 90 ngày) trong `worker/src/core/ops/durability-sweep.service.ts` trùng với mục dưới. Bản Node/PostgreSQL/PM2 trong `docs/deploy-sapo.md` là runbook của stack cũ; mọi chỗ ghi "Postgres" trong hồ sơ này chỉ đúng với stack đó.

API công khai (`/api/public/*`) chỉ trả các trường trong whitelist: không có email, số điện thoại, `source_raw_json` (kiểm thử: `test/security.test.ts`).

Sau khi gỡ app: webhook `app/uninstalled` vô hiệu token, tombstone domain, đặt `dataPreserved=true` và xoá `payload`, `headers` của mọi dòng `WebhookEvent` của store. Bộ dọn nền (`src/ops/durability-sweep.service.ts`, hằng số trong code, không cấu hình qua env) xoá:

- dòng `WebhookEvent` trạng thái `processed`/`ignored` sau 30 ngày, `failed` đã hết lượt thử sau 90 ngày;
- `customer_purchases` và `WebhookEvent` của store sau 90 ngày kể từ `uninstalledAt`, nếu store vẫn ở trạng thái đã gỡ (cài lại trong khoảng đó thì giữ nguyên).

Ảnh/video của đánh giá nằm trên R2, không nằm trong bảng dữ liệu. Ở production, Worker xoá đối tượng bằng binding `MEDIA_BUCKET` khi merchant xoá đánh giá hoặc gỡ media; stack Node cũ gọi Worker media `DELETE /<key>` theo kiểu best-effort. Bộ dọn nền còn quét "mồ côi": xoá đối tượng tải lên hơn 24 giờ mà không dòng `review_products.media` nào của store đó tham chiếu (đối tượng của store không có dòng install thì được giữ). Bước này bị bỏ qua khi chưa cấu hình `R2_WORKER_URL`, `R2_UPLOAD_SECRET`, `R2_PUBLIC_DOMAIN`. Đánh giá, hỏi đáp và danh mục sản phẩm là nội dung của merchant, không bị xoá tự động. Metafield mà app đã ghi lên store (`f1genz.*`, `f1genz_reviews.*`) app không xoá được vì token bị thu hồi lúc gỡ; các bước merchant tự gỡ nằm ở `docs/security-checklist.md`. Chủ app cần xác nhận mốc 90 ngày trước khi nộp (mục 8).

## 4. Chính sách bảo mật và vận hành (chứng cứ)

- Khởi chạy admin xác thực HMAC-SHA256 (Base64, tham số sắp A-Z), timing-safe: `test/lifecycle.test.ts`.
- Webhook xác thực chữ ký (header `x-sapo-hmac-sha256`, Base64 HMAC-SHA256 trên raw body, đo trên một delivery thật). Idempotent theo `x-sapo-event-id` khi header có giá trị; delivery đo được có header này nhưng rỗng, nên thực tế khoá là hash nội dung kèm `lifecycleGeneration` cho topic `app/*` và `store/*`. Store xác định từ payload; header `x-sapo-shop-domain` chỉ là gợi ý không ký và được đối chiếu với id sản phẩm/đơn hàng đã lưu (giả định id Sapo là duy nhất giữa các store chưa kiểm chứng): `test/lifecycle.test.ts`, `test/durability.test.ts`, `test/s3-privacy-webhooks.test.ts`.
- Thao tác ghi cần Bearer token, cookie không đủ; CORS credential chỉ cho origin admin; header bảo mật: `test/security.test.ts`.
- Rate limit theo `X-Sapo-Api-Call-Limit`, giới hạn đọc công khai theo client và theo store.
- Health: `GET /livez`, `GET /readyz` (có token).

## 5. Hướng dẫn cài cho merchant

Nguồn: `storefront/snippets/theme/README.md` và trang `/dev` trong admin (`client/src/pages/dev/index.jsx`). Bước chính: nhúng loader widget, thêm `{% include 'f1genz-product-schema' %}` để xuất JSON-LD, tuỳ chọn badge điểm đánh giá từ metafield. Cú pháp `.bwt` chưa chạy thử trên theme Sapo thật.

## 6. Kiểm thử

| Bộ test | Lệnh |
|---|---|
| Server unit/contract | `npm run verify` |
| Server HTTP contract | `npm run test:e2e` (trong CI chạy với Postgres và Redis thật; chạy cục bộ không có Redis cần `E2E_ALLOW_MEMORY_STATE=1`, khi đó Redis chưa được thử) |
| Admin SPA, widget storefront | `npm --prefix client run test:e2e` |
| Client unit | `npm --prefix client run test:unit` |

Hồ sơ này không ghi số lượng test hay kết quả: số liệu cũ trong `plans/reports/port-*.md` thuộc giai đoạn trước các bản sửa gần đây. Lấy số liệu từ lần chạy mới nhất trước khi nộp.

## 7. Billing

Giá niêm yết 119.000đ/tháng được đặt ở form "Đăng ứng dụng" (`PricingType` = theo kỳ hạn, `Period` = 1). Sapo không công bố API charge và repo không có code charge hay kiểm tra trạng thái trả phí: app chạy đủ tính năng với mọi cửa hàng đã cài. Chưa xác minh cách Sapo báo cho app khi merchant ngừng trả phí; cần hỏi Sapo hoặc đo trên một lần cài thật có tính phí.

## 8. Cần chủ app cung cấp hoặc xác nhận trước khi bấm "Yêu cầu xác nhận"

1. URL chính sách bảo mật và điều khoản (Sapo form có thể yêu cầu).
2. Email và kênh hỗ trợ.
3. Ảnh chụp màn hình: đã có 5 ảnh trong `docs/listing-assets/` (chụp trên `f1genz-seafoods.mysapo.net`, không phải `f1genz-purity`); chưa có ảnh JSON-LD.
4. Xác nhận chính sách lưu trữ dữ liệu khách: code hiện xoá `customer_purchases` và nhật ký webhook 90 ngày sau khi gỡ app, nhật ký đã xử lý sau 30 ngày; đánh giá và hỏi đáp được giữ.
5. Callback URL và Application URL của app 3833 đã là domain production (đọc từ portal ngày 2026-11-10); không còn tunnel `trycloudflare`.
6. Kết quả lần cài thật: scope đủ (metafield, webhook trả 2xx), `.bwt` render, giới hạn kích thước giá trị metafield `public_summary` (chưa đo), và việc Sapo có giữ metafield của app sau khi gỡ hay không (chưa đo). Header chữ ký webhook và secret đã đo trên một delivery `products/create` thật; các topic khác chưa đo.
