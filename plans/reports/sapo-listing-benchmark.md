# Benchmark listing Kho ứng dụng Sapo (apps.sapo.vn) cho F1GENZ Reviews

Thời điểm nghiên cứu: 2026-11-11. Phương pháp: tải HTML công khai bằng HTTP (curl/urllib, không đăng nhập, không gửi form). Toàn bộ 65 app đang hiển thị (endpoint công khai `/Home/Home/FilterAppJson?category=0`, TotalRecords = 65) cộng trang trống của app 3833 được tải và phân tích bằng script; 8 app được đọc sâu; kích thước của 240 ảnh chụp màn hình được đo bằng PIL; ảnh chụp của 11 app được xem trực tiếp. CSS `detail.min.css`, `home.min.css` và bản lưu Wayback 2021, 2023, 2025, 2026 được dùng để biết mỗi trường hiện ở đâu. Dữ liệu thô nằm ở `C:/Users/Admin/AppData/Local/Temp/sapo-bench/` (`analysis.json`, `shots.json`, `shots/sheet-*.jpg`).

## Mục lục

1. Kết luận chính
2. Mỗi trường của form hiện ở đâu trên trang công khai
3. Tám listing được đọc sâu
4. Thống kê trên 65 listing đã duyệt
5. Tổng hợp: thứ tự mục, độ dài, quy ước trình bày, yếu tố tạo cảm giác cao cấp, rủi ro bị từ chối
6. Áp dụng cho F1GENZ Reviews
7. Câu hỏi chưa giải quyết
8. Nguồn

## 1. Kết luận chính

- **Lợi điểm (SellingPoint1..3) không hiện ở đâu trên apps.sapo.vn.** Cả 66 trang chi tiết dùng chung một template; khảo sát class cho thấy chỉ `price-per` và `d-none` thay đổi giữa các trang, và không trang nào (kể cả trang chủ, trang danh mục, trang tìm kiếm, bản lưu 2021/2023/2025) chứa slot hay chuỗi nào cho lợi điểm. Vì vậy không thể chép "nguyên văn lợi điểm như hiển thị" của app nào. Không có giới hạn độ dài đo được; đề xuất ≤ 25-30 ký tự [INFERENCE].
- **Banner 970x380 và YoutubeUrl cũng không được hiển thị.** Banner 310x100 từng hiện cạnh tên app ở layout 2023 (`.block-banner`, bản lưu trang Đánh giá sản phẩm 2023-06-05, ảnh đo được 310x100) nhưng đã bị bỏ khỏi layout hiện tại, có từ trước 2025-04-17. 0/65 gallery có video; ba app muốn có video thì nhúng iframe YouTube ngay trong mô tả.
- **Ảnh chụp:** mỗi app có 3 ảnh (17 app) hoặc 4 ảnh (48 app), không app nào có trên 4, nên nhiều khả năng giới hạn là 4 [INFERENCE]. Kích thước phổ biến nhất là **822x477** (39/240 ảnh; 10 app dùng toàn bộ 822x477), khớp đúng ô gallery ở màn hình ≥ 1600 px. Tỷ lệ khung trung vị là 1,78.
- **Mô tả ngắn:** trung vị 119 ký tự, dài nhất 140 (11 app nằm trong khoảng 136-140, không app nào vượt 140), nên nhiều khả năng giới hạn là 140 [INFERENCE]. Bản nháp hiện tại của F1GENZ Reviews dài **158 ký tự**, vượt mức này. Thẻ app ở trang danh mục và trang tìm kiếm cắt mô tả ngắn ở khoảng 94 ký tự rồi thêm "...".
- **Inline style:** 57/65 mô tả có inline style, phần lớn là `span style="color:#000000"` do CKEditor sinh ra. Các listing được dàn trang kỹ (PageSpeed của F1GENZ, Effitrack) bọc nội dung trong một `div` có CSS inline đầy đủ.
- **Sapo duyệt khá lỏng:** nhiều listing đã duyệt vẫn có từ ngữ tuyệt đối ("duy nhất", "hàng đầu", "tốt nhất", "số 1"), số liệu không nguồn, số điện thoại trong ảnh, ảnh hỏng (CNV 28/28 ảnh trả 403) và rác của extension trình duyệt. Rủi ro thật nằm ở luật quảng cáo (mục 5.5), không ở việc Sapo soát kỹ.

## 2. Mỗi trường của form hiện ở đâu trên trang công khai

```text
.detail-container
├─ #leftInfoApp .infoApp (sticky, cột trái 4/12)
│   ├─ breadcrumb: Kho ứng dụng Sapo > {Danh mục} > {Tên}
│   ├─ .icon (icon lớn) + h1 {Tên app} + .price "{giá} đ" [+ .price-per " / N tháng"]
│   ├─ .info: Nhà phát triển | Kênh (tag: Đa kênh / Website / Cửa hàng) | Phiên bản hỗ trợ (d-none, ẩn)
│   │         | Thông tin nhà phát triển "{điện thoại} - {email}" (lấy từ hồ sơ partner) | Danh mục
│   └─ nút "Cài đặt ngay" (modal nhập tên miền mysapo.net)
├─ #rightContentApp (cột phải)
│   ├─ .gallery-top swiper: ảnh chụp (tối đa 4 đo được), bấm mở fancybox
│   └─ .block-content: [khung "Lưu ý" OmniAI do Sapo chèn] + FullDescription (HTML)
└─ .app-you-like "Ứng dụng có thể bạn sẽ thích": 8 thẻ cùng danh mục (tên + mô tả ngắn + danh mục)
```

| Trường form | Nơi hiển thị (đo ngày 2026-11-11) |
|---|---|
| ShortDescription | Thẻ app ở trang chủ (kẹp CSS 2-3 dòng), trang danh mục, trang tìm kiếm, mục "được sử dụng nhiều nhất" (server cắt ở khoảng 94 ký tự + "..."), thẻ "Ứng dụng có thể bạn sẽ thích" (kẹp 2 dòng, 16px/22px). Không hiện trong thân trang chi tiết. |
| MetaTitle | `<title>`. Khi để trống thì lấy tên app: trang trống của 3833 có `<title>` là "F1GENZ Reviews - Đánh giá sản phẩm". |
| MetaDescription | `<meta name="description">`. Trang trống của 3833 dùng tên app làm giá trị dự phòng; 26/65 app có meta description trùng tên app. |
| FullDescription | `.block-content`: 16px/26px, `text-align: justify` (14px/1.4 khi màn hình ≤ 1199 px). Mọi `div` con trực tiếp nhận `border-top` và `border-bottom` `1px #d0e0f0`, `padding: 24px 0`, `margin: 24px 0`. Ảnh bị ép `width/height:auto`, `max-width:100%`. |
| Ảnh chụp | Ô gallery cao cố định: 477 px (≥ 1500 px), 407 px (1200-1499), 350 px (768-1199), 199 px (≤ 767). Chiều rộng cột 822 px (≥ 1600), 703 px (1200-1599), 570 px (992-1199). Nền `#d6e3f5`, bo góc 12 px; ảnh `max-width/max-height:100%`, không phóng to, nên ảnh nhỏ sẽ có viền nền xanh. |
| SellingPoint1..3, appFeatureBanner, YoutubeUrl | Không hiện ở đâu (0/66 trang, cả bản lưu 2021/2023/2025). |
| appBanner 310x100 | Chỉ hiện ở layout 2023; layout hiện tại (có từ trước 2025-04) không hiện. |
| Giá | "Miễn phí" (43 app), "N đ / N tháng" (18), "N đ" (3, trả một lần), "N đ / tháng" (1: Đăng bán đa sàn "100,000 đ / tháng"). Gói 119.000đ/tháng nhiều khả năng hiện "119,000 đ / tháng" [INFERENCE]. |
| og:image | Ảnh bìa chung của Sapo cho mọi app; không có og:title hay og:description riêng. Form không chỉnh được phần này. |

Khung "Lưu ý" do Sapo chèn vào đầu mô tả ("Ứng dụng chỉ hỗ trợ các cửa hàng sử dụng Sapo OmniAI (Quản lý bán hàng hợp kênh ) - phiên bản mới có tính năng AI.") xuất hiện khi trường ẩn "Phiên bản hỗ trợ" là Sapo OmniAI hoặc Sapo Omni (31/66 trang). **Trang 3833 hiện đang có khung này** ("Phiên bản hỗ trợ: Sapo OmniAI"), chưa có danh mục và chưa có dòng "Kênh".

Tìm kiếm (`/search?key=`) quét cả mô tả đầy đủ: từ khoá "google" trả 16 app, "review" trả Ảnh Nổi và Đánh giá sản phẩm, "hỏi đáp" trả 0 app.

## 3. Tám listing được đọc sâu

Lựa chọn: app của F1GENZ (bắt buộc), 2 app đánh giá sản phẩm (đối thủ trực tiếp), 2 app trong "Hỗ trợ bán hàng" và 3 app "Marketing và CSKH" đang nằm ở các mục đề xuất, mới nhất hoặc được dùng nhiều nhất trên trang chủ. "Lợi điểm" của cả 8 app: **không hiển thị** (mục 1). Số ký tự đo sau khi gộp khoảng trắng.

### 3.1 Tối ưu PageSpeed Insight by F1GenZ (app F1GENZ, 3385)

- URL: https://apps.sapo.vn/toi-uu-pagespeed-insight-by-f1genz; danh mục: Quản trị website; giá: "9,000,000 đ"; nhà phát triển: Công Ty TNHH KTCN F1GENZ; Kênh: Đa kênh, Website.
- Mô tả ngắn (129): "Sapo cùng F1GENZ mang đến giải pháp tăng tốc website, cải thiện SEO, nâng trải nghiệm và tăng chuyển đổi rõ rệt cho doanh nghiệp."
- Meta title (34): "Tối ưu PageSpeed website by F1GenZ". Meta description (129): trùng mô tả ngắn.
- Mô tả đầy đủ: khoảng 776 từ. Một `div` bọc ngoài có CSS inline (Arial, `#333`, line-height 1.6, max-width 1000px, padding 20px); 81 phần tử có style; màu `#2c3e50`, `#34495e`, `#e74c3c` (dòng lưu ý). Thứ tự: h2 "Chi tiết dịch vụ" → 2 đoạn mở đầu đặt vấn đề → h3 "1. Google PageSpeed là gì?" (ul 3) → h3 "2. Rủi ro nếu không tối ưu" (h4 2.1-2.4) → h3 "3. Giải pháp" (h4 3.1, 3.2 + ul 4) → h3 "4. Bảng giá và cam kết dịch vụ" (bảng 2 gói) + dòng lưu ý màu đỏ → h3 "5. Quy trình" (bảng 7 bước) → h3 "6. Lý do bạn nên chọn" (ul 5, nhãn in đậm). Không có ảnh, emoji, link hay video.
- Ảnh chụp: 4 ảnh 800x455 PNG. Ba ảnh là kết quả PageSpeed chụp nguyên trạng; ảnh thứ tư là bảng tính có nhãn cam "Trước khi optimize pagespeed" / "Sau khi optimize pagespeed".

### 3.2 Ảnh Nổi - Đánh giá sản phẩm nâng cao (đối thủ trực tiếp)

- URL: https://apps.sapo.vn/anhnoi-product-review-danh-gia-san-pham; danh mục: Marketing và CSKH; giá: "1,200,000 đ / 12 tháng"; Kênh: Website.
- Mô tả ngắn (116): "Cho phép khách hàng đánh giá và gây ấn tượng với khách hàng bằng những đánh giá đẹp mắt video, hình ảnh và nội dung."
- Meta title (26): "Đánh giá sản phẩm nâng cao". Meta description (26): "Đánh giá sản phẩm nâng cao" (yếu: trùng title).
- Mô tả đầy đủ: khoảng 263 từ. h2 "Sức mạnh của đánh giá có hình ảnh" (số liệu 97%, 92%, 94% không ghi nguồn) → h2 "Ảnh Nổi là gì?" → h2 "So sánh App Ảnh Nổi với App đánh giá thông thường:" kèm bảng so sánh dạng ảnh (tự lưu trên S3 riêng) → "Hướng dẫn cài đặt:" (ol 3) → dòng cuối "Xem shop mẫu: Tại đây" (link shop demo, `rel=nofollow`). Inline style chỉ là span màu `#000000`; không emoji, không video.
- Ảnh chụp: 4 ảnh 1800x1000 PNG (tỷ lệ 1,8), là **ảnh marketing được thiết kế**: tiêu đề xanh cỡ lớn bên trái, mockup laptop hoặc ảnh ghép bên phải, khối trang trí. Chú thích trên ảnh: "Tự động sắp xếp những đánh giá có hình ảnh/video đầu tiên"; "Đánh giá bằng video tăng sự tin cậy của sản phẩm"; "Hệ thống tự động sắp xếp những đánh giá có Conversion Rate cao và gợi ý cho khách hàng"; "Hiển thị đánh giá tổng quan trong Google Search".

### 3.3 Đánh giá sản phẩm (Sapo Apps, đối thủ trực tiếp)

- URL: https://apps.sapo.vn/danh-gia-san-pham-v2; danh mục: Hỗ trợ bán hàng; giá: "150,000 đ / 3 tháng"; Kênh: Website.
- Mô tả ngắn (137): "Cho phép khách hàng của bạn đánh giá về chất lượng của từng sản phẩm, từ đó thu hút những khách hàng chất lượng và tăng doanh số bán hàng"
- Meta title (43): "Ứng dụng website đánh giá sản phẩm của Sapo". Meta description (104): "Cho phép khách hàng của bạn đánh giá về chất lượng của từng sản phẩm để thu hút khách hàng tăng doanh số"
- Mô tả đầy đủ: khoảng 435 từ. h2 câu mở "Tăng doanh số vượt trội, xây dựng niềm tin khách hàng với ứng dụng Đánh giá sản phẩm Sapo!" → đoạn định nghĩa → h2 "Tại sao bạn cần...?" (ul 3, nhãn in đậm: Tăng chuyển đổi đơn hàng / Thấu hiểu khách hàng / Xây dựng uy tín thương hiệu) → h3 "Tính năng nổi bật:" (ul 6: bộ lọc, tuỳ chỉnh giao diện, phản hồi nhiều lần, hiển thị xác thực đã mua, **sao đánh giá trên Google**, khách tải ảnh) → h3 "Thiết lập đơn giản:" (3 bước) → h3 "Lợi ích vượt trội:" (ul 4) → câu kêu gọi cài đặt → "Tài liệu hướng dẫn: https://help.sapo.vn/danh-gia-san-pham". Chỉ có span màu đen; không ảnh, không video.
- Ảnh chụp: 4 ảnh khoảng 2366x1528 PNG (tỷ lệ 1,55, độ phân giải cao), giao diện admin chụp nguyên trạng (danh sách đánh giá, cấu hình, sản phẩm được đánh giá) và widget ở trang sản phẩm; dữ liệu demo; không chú thích.

### 3.4 AppMinis (Hỗ trợ bán hàng, mục "Ứng dụng đề xuất")

- URL: https://apps.sapo.vn/aimini; giá: "Miễn phí"; nhà phát triển: DigiBird Co; Kênh: Đa kênh.
- Mô tả ngắn (100): "Chỉ cần kéo và thả để tạo ra những Mini App mạnh mẽ cắt giảm lên đến 50% thời gian cho doanh nghiệp!"
- Meta title (44): "Lợi ích Aimini mang lại đối với doanh nghiệp". Meta description (70): "AppMinis - Nền tảng khởi tạo Mobile App & Mini App Cùng AI App Builder"
- Mô tả đầy đủ: khoảng 651 từ, nặng ảnh: 23 ảnh (lưu ở `ui.aimini.vn`; một `img` trỏ vào link Google Drive, trả 404), **iframe YouTube nhúng trong mô tả** kèm link, link ra aimini.vn và gitbook. Có h2 và h3, nhưng nhiều h2 rỗng chỉ để bọc ảnh. Không emoji.
- Ảnh chụp: 4 ảnh JPEG khoảng 1918x863 (tỷ lệ 2,2), giao diện chụp nguyên trạng, không chú thích.

### 3.5 ALOHUB - Tổng đài ảo AI (Marketing và CSKH, mục "Ứng dụng mới nhất")

- URL: https://apps.sapo.vn/alohub; giá: "Miễn phí"; Phiên bản hỗ trợ: Sapo OmniAI (có khung "Lưu ý"); không có dòng "Kênh".
- Mô tả ngắn (132): "Tổng đài ảo AI tích hợp ngay trong Sapo — gọi ra, nhận gọi, lịch sử, ghi âm chỉ với 1 click. Giảm boom hàng, tăng tốc chăm sóc khách" (dừng giữa cụm từ, có thể do đụng giới hạn độ dài [INFERENCE]).
- Meta title (23): trùng tên app. Meta description (126): "ALOHUB kết hợp cùng SAPO mang đến giải pháp Tổng đài ảo AI, giúp doanh nghiệp tối ưu quy trình bán hàng – chăm sóc khách hàng."
- Mô tả đầy đủ: khoảng 674 từ. [Khung Lưu ý] → h1 "ALOHUB – Tổng đài tích hợp trực tiếp trong Sapo" → 2 đoạn mở đầu + ảnh → "I. TÍNH NĂNG CHÍNH" → h2 1-4, mỗi mục gồm 1 đoạn, ul 3-4 ý và 1 ảnh rộng 822 px (`cdn.alohub.vn`) → h2 "5. Sắp ra mắt" (lộ trình) → h1 "II. CÀI ĐẶT TRONG 5 PHÚT" (ol 3 + ảnh) → h1 "III. ALOHUB PHÙ HỢP VỚI SHOP NÀO?" (ul 4) → h1 "IV. HƯỚNG DẪN" (link tài liệu và link YouTube). Có 4 thẻ h1 trong mô tả (lỗi SEO, vì trang đã có h1), dùng mũi tên "→".
- Ảnh chụp: 4 ảnh PNG 1541x1020 / 1662x946, giao diện chụp nguyên trạng: dashboard có số liệu thực tế, lịch sử cuộc gọi, trang khách hàng kèm softphone. Số điện thoại được che. Không chú thích.

### 3.6 Marketing Automation đa kênh - LadiFlow

- URL: https://apps.sapo.vn/ladiflow; danh mục: Marketing và CSKH; giá: "Miễn phí"; Kênh: Đa kênh, Website.
- Mô tả ngắn (132): "Marketing Automation đa kênh tự động thu thập dữ liệu khách hàng và tương tác đa kênh: Messenger, Email, SMS, Zalo, Web Notification"
- Meta title (67): "Nền tảng Automation Marketing đa kênh miễn phí trên Sapo - LadiFlow". Meta description (129): "Giải pháp automation marketing đa kênh miễn phí, tự động thu thập dữ liệu và tương tác qua Messenger, Email, SMS, Zalo, Web Push."
- Mô tả đầy đủ: khoảng 673 từ. h2 tiêu đề → 2 đoạn mở đầu → ảnh → h3 "Lợi ích..." (ul 6, có số liệu 53% và tỷ lệ 80/20) → h3 các điểm chạm (ul 5) → h3 "TÍCH HỢP" (cài từ App Store kèm ảnh; "Xem nhanh video hướng dẫn"; ol 5 cho cách cài thay thế) → khối h4 về uy tín thương hiệu → ảnh giao diện có chú thích bên dưới ("Tổng quan", "Thiết kế kịch bản với Visual Builder", "Báo cáo flow") → câu kêu gọi → link trợ giúp. Cuối mô tả còn sót `div` rác của extension trình duyệt (`simple-translate`, URL `chrome-extension://`).
- Ảnh chụp: 4 ảnh PNG khoảng 1980x1260 (tỷ lệ 1,55), giao diện chụp nguyên trạng, không chú thích.

### 3.7 CNV - Ứng dụng tạo Mini App và chăm sóc khách hàng (mục "được sử dụng nhiều nhất")

- URL: https://apps.sapo.vn/cnv-ung-dung-tao-mini-app-va-cham-soc-khach-hang; danh mục: Marketing và CSKH; giá: "Miễn phí"; Kênh: Đa kênh.
- Mô tả ngắn (102): "CNV là công ty công nghệ chuyên cung cấp các giải pháp chăm sóc khách hàng toàn diện cho doanh nghiệp."
- Meta title (11): "CNV Loyalty". Meta description (11): "CNV Loyalty".
- Mô tả đầy đủ: khoảng 1083 từ, dài nhất trong 65 app. Các mục h3: "Mini App là gì?", "Lợi ích" (ol 6), "Tính năng nổi bật" (nhiều ul 1 ý kèm ảnh), "Các bước thiết lập" (ol 5), "Khách hàng & Case Study" (kể tên thương hiệu), câu kêu gọi, link hướng dẫn. 28 ảnh dán từ Google Docs (`lh7-rt.googleusercontent.com`) **đều trả HTTP 403**, tức hỏng với khách truy cập ẩn danh.
- Ảnh chụp: 4 ảnh **822x477 PNG** (vừa khít ô gallery), **ảnh marketing được thiết kế**: logo ở đầu, tiêu đề hồng cỡ lớn ("BÁN HÀNG TRỰC TUYẾN", "TOPUP - THẺ TRẢ TRƯỚC", "GAMIFICATION TRÊN ZALO MINI APP"), mockup điện thoại kèm chú thích từng bước, chân ảnh có website và số điện thoại "091 111 65 87", mã QR.

### 3.8 Sapo Loyalty (Sapo Apps, mục "được sử dụng nhiều nhất")

- URL: https://apps.sapo.vn/sapo-loyalty; danh mục: Marketing và CSKH; giá: "Miễn phí"; Phiên bản hỗ trợ: Sapo OmniAI (có khung "Lưu ý").
- Mô tả ngắn (136): "Sapo Loyalty hỗ trợ Chương trình tích điểm và xếp hạng khách hàng thân thiết, giúp cửa hàng của bạn gia tăng sự hài lòng của khách hàng."
- Meta title (12) và meta description (12): "Sapo Loyalty".
- Mô tả đầy đủ: khoảng 707 từ. [Khung Lưu ý] → 2 đoạn mở đầu → h2 "I. Giải pháp..." với h3 1-4 (nhiều đoạn văn bị đặt nhầm trong h3) → link hướng dẫn → h2 "II. Lợi ích..." với h3 1-3 → đoạn kết đặt trong h2 → dòng "Tài liệu hướng dẫn". Không ảnh, emoji hay video.
- Ảnh chụp: 4 ảnh PNG 1369x783 (tỷ lệ 1,75), giao diện app chụp nguyên trạng **bên trong admin Sapo** (thấy menu bên trái), 1 ảnh popup ở POS; không chú thích.

Kiểu ảnh chung của các app do Sapo làm (xem thêm Tạo mã khuyến mãi, Mua X Tặng Y, Đăng bán đa sàn): giao diện thật chụp nguyên trạng, cắt đúng 822x477 hoặc chụp 2048x1150 WEBP, có cả ảnh màn hình cấp quyền khi cài. Không dùng chú thích marketing.

## 4. Thống kê trên 65 listing đã duyệt

| Chỉ số | Giá trị |
|---|---|
| Mô tả ngắn | min 47, p25 104, trung vị 119, p75 133, max **140** ký tự; 57/65 dài quá 95 ký tự nên bị cắt trên thẻ |
| Meta title | trung vị 35, max 138; 23/65 trùng tên app |
| Meta description | trung vị 106, max **150** (3 app đúng 150) [INFERENCE: có giới hạn 150]; 26/65 trùng tên hoặc title; 12/65 trùng mô tả ngắn |
| Số từ mô tả đầy đủ | p25 331, trung vị 454, p75 598, max 1083 |
| Inline style | 57/65; dùng màu khác đen 13/65 |
| Heading | h2 30/65, h3 30/65, không heading 22/65, có h1 trong mô tả 3/65 |
| List / bảng / ảnh | list 56/65; bảng 4/65; ảnh trong mô tả 17/65 |
| Video | iframe YouTube 3/65 (AppMinis, EDC, Effitrack); link YouTube 4/65; video trong gallery 0/65 |
| Emoji hình | 9/65 (★ ✅ 👉 📌 💾 …); trong 8 app đọc sâu không app nào dùng (ALOHUB chỉ dùng "→") |
| Link ra ngoài sapo.vn | 23/65; 78/82 link có `rel="nofollow"` |
| SĐT / email trong mô tả | 4/65 / 5/65 (thông tin liên hệ của nhà phát triển vốn đã hiện ở cột trái) |
| Số ảnh chụp | 3 ảnh: 17 app; 4 ảnh: 48 app; > 4 ảnh: 0 app |
| Kích thước ảnh | 822x477: 39/240 ảnh (10 app toàn bộ); tiếp theo là 1800x1000, 1920x1080, 800x455; tỷ lệ trung vị 1,78 |

Giá của các app đánh giá sản phẩm: Sapo 150.000đ/3 tháng (tương đương 50.000đ/tháng), Ảnh Nổi 1.200.000đ/12 tháng (100.000đ/tháng). Mức 119.000đ/tháng chủ app đã chốt là cao nhất trong nhóm. Đây chỉ là bối cảnh để viết mô tả cho tương xứng với giá, không phải đề xuất đổi giá.

## 5. Tổng hợp

### 5.1 Thứ tự mục của các mô tả tốt nhất

```text
1. Tiêu đề h2 nêu lợi ích (Sapo Review, LadiFlow, ALOHUB) hoặc khối hero
2. Vấn đề / lý do cần (PageSpeed: rủi ro; Ảnh Nổi: số liệu; Sapo: "Tại sao bạn cần")
3. "X là gì" trong 1-2 đoạn
4. Tính năng: mỗi tính năng có tiêu đề, 3-4 gạch đầu dòng và 1 ảnh giao diện có chú thích (ALOHUB, LadiFlow)
5. Cài đặt 3-5 bước (Sapo, ALOHUB, Ảnh Nổi, LadiFlow)
6. Phù hợp với ai (ALOHUB, PageSpeed)
7. Bảng giá / cam kết / quy trình (PageSpeed, app trả phí)
8. Uy tín: thương hiệu, khách hàng tiêu biểu (CNV, LadiFlow)
9. Câu kêu gọi cài đặt + dòng cuối "Tài liệu hướng dẫn / Xem shop mẫu" kèm link
```

### 5.2 Độ dài điển hình

| Trường | Điển hình | Khuyến nghị |
|---|---|---|
| Mô tả ngắn | 100-137 ký tự, không app nào > 140 | ≤ 140 ký tự; ý chính trong ~90 ký tự đầu, vì thẻ cắt ở ~94 ký tự |
| Lợi điểm | không có dữ liệu hiển thị | 2-5 từ, ≤ 25-30 ký tự, dạng cụm danh từ [INFERENCE] |
| Meta title | 25-67 ký tự ở các listing tốt (LadiFlow 67, Sapo 43, PageSpeed 34) | 45-65 ký tự, gồm từ khoá và thương hiệu |
| Meta description | 104-150 | 120-150 ký tự, không lặp tên app |
| Mô tả đầy đủ | 450-800 từ | 500-800 từ |

### 5.3 Quy ước trình bày

- Inline CSS là bình thường và được giữ nguyên (CKEditor tự sinh; PageSpeed dùng một `div` bọc ngoài có style). Không thấy `<style>` hay `<script>` trong mô tả nào.
- Heading: h2 cho tiêu đề chính, h3 cho từng mục, h4 cho mục con. Không dùng h1 vì trang đã có h1 là tên app.
- Nhãn in đậm đầu mỗi gạch đầu dòng ("**Tăng chuyển đổi đơn hàng:** …") là mẫu phổ biến nhất.
- Emoji hiếm, và các listing tốt không dùng.
- Link ra ngoài được phép; Sapo hoặc editor gắn `rel="nofollow"`.

### 5.4 Yếu tố tạo cảm giác cao cấp

1. Ảnh chụp được thiết kế, đúng tỷ lệ ô, mỗi ảnh một thông điệp và có tiêu đề lớn (Ảnh Nổi 1800x1000, CNV 822x477), cùng tông màu thương hiệu.
2. Mỗi tính năng trong mô tả có ảnh giao diện thật và chú thích (ALOHUB với ảnh rộng đúng 822 px, LadiFlow).
3. Dữ liệu demo trông thật nhưng che thông tin cá nhân (ALOHUB che số điện thoại).
4. Có bảng giá, bảng quy trình và lời cam kết rõ ràng (PageSpeed).
5. Hướng dẫn cài 3 bước cùng link tài liệu hoặc shop mẫu (Ảnh Nổi: "Xem shop mẫu").
6. Ảnh tự lưu trên CDN bền (`cdn.alohub.vn`, `w.ladicdn.com`), không dán từ Google Docs.

### 5.5 Dấu hiệu đỏ và rủi ro bị từ chối

Sapo không công bố tiêu chí duyệt listing (không tìm thấy trên sapo.vn/partner.html, support.sapo.vn hay developers.sapo.vn). Các listing đã duyệt vẫn mắc lỗi bên dưới, nên Sapo không soát kỹ những điểm này; dù vậy vẫn nên tránh:

- **Từ ngữ tuyệt đối.** Khoản 11 Điều 8 Luật Quảng cáo 2012 cấm "nhất", "duy nhất", "tốt nhất", "số một" hoặc từ tương tự khi không có tài liệu chứng minh. Thông tư 12/2026/TT-BVHTTDL có hiệu lực từ 05/7/2026 quy định loại tài liệu được chấp nhận, và theo tóm tắt của thuvienphapluat.vn, "hàng đầu" cũng thuộc nhóm từ tương tự. Listing đã duyệt vẫn có các từ này: "duy nhất" (Effitrack, Fundiin, VNPAY…), "hàng đầu" (LadiFlow, JST ERP…), "số 1" (Websosanh).
- **Số liệu không nguồn:** "97%, 92%, 94%" (Ảnh Nổi), "53%" (LadiFlow).
- **Ảnh hỏng:** ảnh dán từ Google Docs (CNV 28/28 trả 403, Cấu hình mẫu in 404, EDC 7/7 trả 404 từ edctech.vn), `img` trỏ vào link Google Drive (AppMinis, 404), ảnh base64 làm trang JST ERP nặng 6,4 MB.
- **Lỗi kỹ thuật:** rác extension (LadiFlow), h1 trong mô tả (ALOHUB, EDC, mBHXH), link sai "http://htttps://…" (Mua X Tặng Y).
- **Mô tả sai năng lực thật** của app: đây là lý do bị trả về dễ hiểu nhất [INFERENCE]. Với F1GENZ Reviews, cần giữ hai giới hạn thật đã ghi trong playbook (widget cài bằng snippet; nhãn "Đã mua hàng" chỉ áp dụng cho đơn sau khi cài).
- **Thông tin liên hệ:** số điện thoại và email của nhà phát triển đã tự hiện từ hồ sơ partner, nên không cần lặp lại trong mô tả hay ảnh. CNV in số điện thoại lên ảnh vẫn được duyệt.

## 6. Áp dụng cho F1GENZ Reviews

1. **Rút gọn mô tả ngắn từ 158 xuống ≤ 140 ký tự.** Ví dụ (128 ký tự): "Thu thập đánh giá có ảnh, video và hỏi đáp cho từng sản phẩm, hiển thị đẹp trên website Sapo và hỗ trợ sao đánh giá trên Google." Thẻ app sẽ hiện "…hiển thị đẹp trên website Sapo và...".
2. Meta title (62) và meta description (140) đã nằm trong khoảng điển hình. Nên đưa "review" hoặc "hỏi đáp" vào mô tả đầy đủ, vì tìm kiếm quét cả mô tả.
3. Lợi điểm (24 ký tự mỗi dòng) đã đủ ngắn. Trường này không hiện công khai, nên không cần đầu tư thêm.
4. **Ảnh chụp: tối đa 4 ảnh.** Bộ hiện có ở `docs/listing-assets/` gồm 4 ảnh 1600x910 (tỷ lệ 1,758). Khi đặt vào ô 822x477, ảnh co về 822x468, chỉ còn dải nền khoảng 5 px ở trên và dưới, chấp nhận được. Muốn khít tuyệt đối thì xuất 1644x954 (gấp đôi 822x477). Muốn đạt mức cao cấp như Ảnh Nổi hoặc CNV thì thêm tiêu đề lớn lên mỗi ảnh; các app của Sapo dùng ảnh nguyên trạng vẫn được duyệt.
5. Banner 970x380, banner 310x100 và YouTube không hiện trên trang công khai: chỉ cần nộp cho đủ form.
6. Mô tả đầy đủ (`docs/listing-assets/full-description.html`) đã theo đúng quy ước: `div` bọc có inline CSS, h2/h3, bảng, không h1. Lưu ý thêm:
   - Sapo cộng viền trên và dưới `#d0e0f0` cùng `padding: 24px 0` vào `div` bọc ngoài; muốn bỏ thì đặt `border:0; padding:0` inline.
   - `text-align: justify` mặc định có thể tạo khoảng trắng lớn trong tiếng Việt; đặt `text-align:left` ở `div` bọc [INFERENCE].
   - Nếu chèn ảnh, lưu ảnh trên R2 hoặc CDN của mình.
   - Tránh "nhất / hàng đầu" và số liệu không nguồn.
7. Kiểm tra trường ẩn "Phiên bản hỗ trợ" (hiện là Sapo OmniAI). Nếu app chạy được cho cả cửa hàng Sapo Web không dùng OmniAI, hãy nhờ Sapo đổi thành "Tất cả" để bỏ khung "Lưu ý" giới hạn đối tượng. Đồng thời đề nghị gắn tag Kênh "Website" để app hiện khi lọc theo kênh.

## 7. Câu hỏi chưa giải quyết

1. Lợi điểm, banner 970x380 và banner 310x100 có hiện ở bề mặt nào khác không, ví dụ trang Ứng dụng trong admin OmniAI hay email marketing của Sapo? Muốn biết phải đăng nhập (ngoài phạm vi nhiệm vụ). Cách kiểm: mở trang Ứng dụng trong admin của shop demo.
2. Form có `maxlength` cho ShortDescription, MetaTitle, MetaDescription, SellingPoint và giới hạn số ảnh không? Cách kiểm: đọc thuộc tính input ở `developers.sapo.vn/services/partners/api_clients/publish/3385` bằng phiên partner đã đăng nhập (trang chỉ GET).
3. Ai đặt "Phiên bản hỗ trợ" và "Kênh"? Hai trường này không có trong danh sách trường form đã ghi ở playbook.
4. Sapo không công bố tiêu chí duyệt listing. Có thể hỏi sapo-apps@sapo.vn (email lấy từ trang Google Play của Sapo, độ tin cậy trung bình) hoặc partner@sapo.vn.

## 8. Nguồn

- Trang công khai apps.sapo.vn (tải ngày 2026-11-11): 65 trang chi tiết app, trang chủ, `/collections/{ban-hang,marketing,tat-ca,quan-tri-website}`, `/search?key=`, `/Home/Home/FilterAppJson`, `detail.min.css`, `home.min.css`.
- Bản lưu Wayback: https://web.archive.org/web/20230605074005/https://apps.sapo.vn/danh-gia-san-pham-v2 (layout cũ có `.block-banner` 310x100), https://web.archive.org/web/20210612181514/https://apps.sapo.vn/, https://web.archive.org/web/20250417180911/https://apps.sapo.vn/sapo-loyalty, https://web.archive.org/web/20260209103401/https://apps.sapo.vn/toi-uu-pagespeed-insight-by-f1genz.
- https://help.sapo.vn/cai-dat-ung-dung-tren-sapo (cách cài từ Kho ứng dụng), https://www.sapo.vn/partner.html (thời gian duyệt hồ sơ đối tác, không có tiêu chí listing).
- Luật Quảng cáo 2012 khoản 11 Điều 8 và Thông tư 12/2026/TT-BVHTTDL: https://thuvienphapluat.vn/chinh-sach-phap-luat-moi/vn/ho-tro-phap-luat/chinh-sach-moi/113702/tu-05-7-2026-quang-cao-su-dung-tu-nhat-duy-nhat-tot-nhat-phai-co-tai-lieu-chung-minh, https://lsvn.vn/quy-dinh-ve-tai-lieu-chung-minh-khi-quang-cao-su-dung-tu-nhat-duy-nhat-tot-nhat-so-mot-a173667.html.
- Giới hạn của nghiên cứu: không đăng nhập nên không thấy form, admin hay quy trình duyệt nội bộ của Sapo. Các giới hạn 4 ảnh, 140 và 150 ký tự là suy ra từ dữ liệu, chưa được tài liệu xác nhận. Tình trạng ảnh hỏng đo bằng request ẩn danh vào ngày 2026-11-11.
