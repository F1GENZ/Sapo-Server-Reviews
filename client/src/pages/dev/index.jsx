import Link from "../../components/StoreLink";
import AdminLayout from "../../components/layout/AdminLayout";
import { getStoreDomain } from "../../common/AuthStorage";
import { toast } from "../../common/toast";
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Collapse,
  Flex,
  Tag,
  Typography,
} from "antd";
import {
  AppstoreOutlined,
  CodeOutlined,
  CopyOutlined,
  HomeOutlined,
  ProductOutlined,
  SafetyCertificateOutlined,
  StarOutlined,
  WarningOutlined,
} from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

const STORE_DOMAIN_PLACEHOLDER = "ten-cua-hang.mysapo.net";
const API_URL_PLACEHOLDER = "https://API_HOST";

const buildSnippets = ({ apiUrl, storeDomain }) => ({
  assets: `<script>
  window.__F1GENZ_STOREFRONT_CONFIG = {
    apiUrl: "${apiUrl}",
    storeDomain: "${storeDomain}"
  };
</script>
<link rel="stylesheet" href="${apiUrl}/storefront/f1genz-storefront.css">
<script src="${apiUrl}/storefront/f1genz-storefront.js" defer></script>`,

  productWidget: `<f1genz-reviews
  product-id="{{ product.id }}"
  storeDomain="${storeDomain}"
  customer-email="{{ customer.email | escape }}"
  customer-phone="{{ customer.phone | escape }}"
></f1genz-reviews>`,

  productPanels: `<f1genz-reviews-panel
  product-id="{{ product.id }}"
  storeDomain="${storeDomain}"
  customer-email="{{ customer.email | escape }}"
  customer-phone="{{ customer.phone | escape }}"
></f1genz-reviews-panel>

<f1genz-qna-panel
  product-id="{{ product.id }}"
  storeDomain="${storeDomain}"
  customer-email="{{ customer.email | escape }}"
  customer-phone="{{ customer.phone | escape }}"
></f1genz-qna-panel>`,

  cardBadge: `<f1genz-rating-badge
  product-id="{{ product.id }}"
  storeDomain="${storeDomain}"
></f1genz-rating-badge>`,

  cardBadgeSsr: `{% if product.metafields.f1genz_reviews.rating_count %}
<f1genz-rating-badge
  product-id="{{ product.id }}"
  storeDomain="${storeDomain}"
  avg-rating="{{ product.metafields.f1genz_reviews.rating_avg }}"
  review-count="{{ product.metafields.f1genz_reviews.rating_count }}"
></f1genz-rating-badge>
{% endif %}`,

  schema: `{% include 'f1genz-product-schema' %}`,

  schemaFile: `{% comment %}
  F1GENZ Reviews - product JSON-LD with aggregateRating (server-side rendered, no JS).
  Reads product metafields in namespace f1genz_reviews: rating_count (integer), rating_avg (string "4.6").
  Renders nothing unless there is at least one approved review: with 0 reviews there is no aggregateRating.
  Use inside product.bwt with an include tag for f1genz-product-schema.
  Filters used: escape only.
{% endcomment %}
{% if product %}
  {% assign f1g_count = product.metafields.f1genz_reviews.rating_count %}
  {% assign f1g_avg = product.metafields.f1genz_reviews.rating_avg %}
  {% if f1g_count != blank and f1g_count != 0 and f1g_count != '0' and f1g_avg != blank and f1g_avg != 0 and f1g_avg != '0' %}
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "Product",
    "@id": "{{ canonical_url | escape }}#product",
    "name": "{{ product.name | escape }}",
    "url": "{{ canonical_url | escape }}",
    {% if product.featured_image.src != blank %}"image": "{{ product.featured_image.src | escape }}",{% endif %}
    {% if product.vendor != blank %}"brand": { "@type": "Brand", "name": "{{ product.vendor | escape }}" },{% endif %}
    {% if product.price != blank %}
    "offers": {
      "@type": "Offer",
      "url": "{{ canonical_url | escape }}",
      "priceCurrency": "VND",
      "price": "{{ product.price }}",
      {% if product.available != nil %}"availability": "{% if product.available %}https://schema.org/InStock{% else %}https://schema.org/OutOfStock{% endif %}",{% endif %}
      "itemCondition": "https://schema.org/NewCondition"
    },
    {% endif %}
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "{{ f1g_avg }}",
      "reviewCount": "{{ f1g_count }}",
      "bestRating": "5",
      "worstRating": "1"
    }
  }
  </script>
  {% endif %}
{% endif %}`,

  slider: `<f1genz-curated-slider
  product-id="{{ product.id }}"
  storeDomain="${storeDomain}"
  count="6"
></f1genz-curated-slider>`,

  schemaComponent: `<f1genz-product-schema
  product-id="{{ product.id }}"
  storeDomain="${storeDomain}"
  product-name="{{ product.title | escape }}"
  brand="{{ product.vendor | escape }}"
></f1genz-product-schema>`,
});

const CodeBlock = ({ code }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Đã sao chép");
    } catch {
      toast.error("Không thể sao chép");
    }
  };

  return (
    <div style={{ position: "relative", marginTop: 10, minWidth: 0, maxWidth: "100%" }}>
      <pre
        style={{
          background: "#0d1117",
          borderRadius: 8,
          boxSizing: "border-box",
          color: "#e6edf3",
          fontFamily: "'Cascadia Code', Consolas, monospace",
          fontSize: 12.5,
          lineHeight: 1.7,
          margin: 0,
          maxWidth: "100%",
          overflowX: "auto",
          padding: "14px 52px 14px 16px",
          width: "100%",
        }}
      >
        {code}
      </pre>
      <Button
        type="text"
        size="small"
        icon={<CopyOutlined />}
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          color: "#c9d1d9",
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        Copy
      </Button>
    </div>
  );
};

const buildDevSections = (snippets) => [
  {
    key: "assets",
    label: (
      <Flex align="center" gap={8}>
        <CodeOutlined style={{ color: "#1677ff" }} />
        <Text strong>1. Load asset global</Text>
      </Flex>
    ),
    children: (
      <>
        <Paragraph type="secondary" style={{ lineHeight: 1.7 }}>
          Dán trước <Text code>{`</body>`}</Text> trong file layout chính của theme Sapo (.bwt).
          Đoạn này đặt cấu hình runtime <Text code>{`{ apiUrl, storeDomain }`}</Text> (cùng cấu trúc app ghi vào metafield shop <Text code>f1genz.config</Text> khi cài đặt)
          và tải CSS/JS storefront từ <Text code>apiUrl</Text>, không lấy từ domain Pages admin.
          Nếu bản build admin chưa khai báo <Text code>VITE_STOREFRONT_API_URL</Text>, hãy thay <Text code>{API_URL_PLACEHOLDER}</Text> bằng host API của app.
          <Text code>storeDomain</Text> luôn là tên miền <Text code>.mysapo.net</Text> của shop, không dùng tên miền riêng.
        </Paragraph>
        <CodeBlock code={snippets.assets} />
      </>
    ),
  },
  {
    key: "product-widget",
    label: (
      <Flex align="center" gap={8}>
        <StarOutlined style={{ color: "#faad14" }} />
        <Text strong>2. Trang chi tiết sản phẩm</Text>
      </Flex>
    ),
    children: (
      <>
        <Paragraph type="secondary" style={{ lineHeight: 1.7 }}>
          Dán vào vị trí muốn hiển thị khối đánh giá và hỏi đáp trong template sản phẩm.
          Thường là dưới mô tả hoặc tab đánh giá. Snippet tổng này hỗ trợ cấu hình xếp dọc hoặc 2 tab trong trang Cấu hình.
        </Paragraph>
        <CodeBlock code={snippets.productWidget} />
        <Paragraph type="secondary" style={{ marginTop: 14, lineHeight: 1.7 }}>
          Nếu theme cần tách đánh giá và hỏi đáp thành hai vị trí khác nhau, dùng bản panel riêng:
        </Paragraph>
        <CodeBlock code={snippets.productPanels} />
      </>
    ),
  },
  {
    key: "product-card",
    label: (
      <Flex align="center" gap={8}>
        <AppstoreOutlined style={{ color: "#722ed1" }} />
        <Text strong>3. Product card / vòng lặp sản phẩm</Text>
      </Flex>
    ),
    children: (
      <>
        <Paragraph type="secondary" style={{ lineHeight: 1.7 }}>
          Dán trong file product card của theme (.bwt) hoặc block item của trang collection/search.
          Badge chỉ cần <Text code>product-id</Text> và <Text code>storeDomain</Text>; điểm trung bình và số đánh giá được tải theo lô từ API, không cần đọc metafield.
        </Paragraph>
        <CodeBlock code={snippets.cardBadge} />
        <Paragraph type="secondary" style={{ marginTop: 14, lineHeight: 1.7 }}>
          Tuỳ chọn, để badge hiện ngay khi tải trang: truyền điểm từ metafield sản phẩm <Text code>f1genz_reviews.rating_avg</Text> / <Text code>rating_count</Text> do app ghi (chỉ in giá trị thô, có điều kiện <Text code>{`{% if %}`}</Text>).
        </Paragraph>
        <CodeBlock code={snippets.cardBadgeSsr} />
      </>
    ),
  },
  {
    key: "schema",
    label: (
      <Flex align="center" gap={8}>
        <SafetyCertificateOutlined style={{ color: "#13c2c2" }} />
        <Text strong>4. JSON-LD Product schema</Text>
      </Flex>
    ),
    children: (
      <>
        <Paragraph type="secondary" style={{ lineHeight: 1.7 }}>
          Để công cụ tìm kiếm thấy điểm đánh giá và giá mà không cần chạy JavaScript, tạo file <Text code>snippets/f1genz-product-schema.bwt</Text> trong theme, dán nguyên nội dung dưới đây vào file rồi chèn bằng <Text code>{`{% include %}`}</Text> trong template sản phẩm.
        </Paragraph>
        <CodeBlock code={snippets.schemaFile} />
        <Paragraph type="secondary" style={{ marginTop: 14, lineHeight: 1.7 }}>
          Snippet xuất hai khối: <Text code>aggregateRating</Text> (đọc metafield <Text code>f1genz_reviews.rating_count</Text> và <Text code>rating_avg</Text> do app ghi; sản phẩm chưa có đánh giá đã duyệt thì không xuất gì) và <Text code>offers</Text> (giá lấy từ <Text code>product.price</Text>, tiền tệ VND, còn hàng hay hết hàng lấy từ <Text code>product.available</Text>).
          Theme đã dán bản cũ của snippet không có khối <Text code>offers</Text> thì dán đè bằng bản trên.
        </Paragraph>
        <Paragraph type="secondary" style={{ marginTop: 14, lineHeight: 1.7 }}>
          Chèn dòng sau vào template sản phẩm:
        </Paragraph>
        <CodeBlock code={snippets.schema} />
        <Paragraph type="secondary" style={{ marginTop: 14, lineHeight: 1.7 }}>
          Mỗi sản phẩm chỉ nên có một khối JSON-LD <Text code>Product</Text> mang <Text code>aggregateRating</Text>: gỡ khối tương tự có sẵn trong theme.
          Khi trang có <Text code>og:type</Text> là <Text code>product</Text> mà chưa có khối <Text code>Product</Text> nào chứa cả <Text code>aggregateRating</Text> và <Text code>offers</Text>, script storefront tự dựng thêm một khối trên trình duyệt; đặt <Text code>autoProductSchema: false</Text> trong cấu hình ở mục 1 để tắt.
        </Paragraph>
        <Paragraph type="secondary" style={{ marginTop: 14, lineHeight: 1.7 }}>
          Nếu không thể thêm file snippet, dùng phần tử <Text code>f1genz-product-schema</Text> (dựng JSON-LD trên trình duyệt). Chỉ dùng một trong hai cách để không có hai khối <Text code>aggregateRating</Text>.
          Phần tử còn đọc <Text code>price</Text>, <Text code>currency</Text>, <Text code>sku</Text>, <Text code>mpn</Text>, <Text code>gtin</Text>, <Text code>description</Text>, <Text code>product-image</Text>, <Text code>product-url</Text>, <Text code>availability</Text> và <Text code>max-reviews</Text>.
        </Paragraph>
        <CodeBlock code={snippets.schemaComponent} />
      </>
    ),
  },
  {
    key: "slider",
    label: (
      <Flex align="center" gap={8}>
        <StarOutlined style={{ color: "#fadb14" }} />
        <Text strong>5. Slider đánh giá nổi bật (tuỳ chọn)</Text>
      </Flex>
    ),
    children: (
      <>
        <Paragraph type="secondary" style={{ lineHeight: 1.7 }}>
          Hàng thẻ đánh giá nổi bật của chính sản phẩm đang xem. Dán dưới khối đánh giá ở template sản phẩm; cần <Text code>product-id</Text> và <Text code>storeDomain</Text>.
          Bật dải đánh giá nổi bật và số đánh giá trong dải (5–15) chỉnh trong <Text strong>Cấu hình → Hiển thị</Text>; thuộc tính <Text code>count</Text> chỉ là gợi ý, máy chủ vẫn áp dụng cấu hình của shop.
        </Paragraph>
        <CodeBlock code={snippets.slider} />
      </>
    ),
  },
  {
    key: "performance",
    label: (
      <Flex align="center" gap={8}>
        <WarningOutlined style={{ color: "#fa8c16" }} />
        <Text strong>6. Tối ưu responsive / tốc độ</Text>
      </Flex>
    ),
    children: (
      <>
        <Paragraph type="secondary" style={{ lineHeight: 1.7 }}>
          Chỉ load asset global một lần ở layout. Trang listing chỉ nên dùng rating badge; widget đầy đủ chỉ đặt ở trang sản phẩm.
          Khi chọn chế độ 2 tab trong Cấu hình, Q&A sẽ chỉ gọi API sau khi khách mở tab Hỏi đáp.
        </Paragraph>
        <Flex vertical gap={8}>
          <Text type="secondary">1. Không dán <Text code>f1genz-reviews</Text> trong product card hoặc collection loop.</Text>
          <Text type="secondary">2. Product card dùng <Text code>f1genz-rating-badge</Text> để tránh tải review list hàng loạt.</Text>
          <Text type="secondary">3. Giữ khung ảnh/card sản phẩm có kích thước ổn định để tránh layout shift trên mobile.</Text>
          <Text type="secondary">4. Nếu theme có tab sản phẩm riêng, đặt widget trong tab đang visible hoặc đảm bảo tab không lazy-destroy DOM.</Text>
        </Flex>
      </>
    ),
  },
];

const DevGuidePage = () => {
  const snippets = buildSnippets({
    apiUrl: (import.meta.env.VITE_STOREFRONT_API_URL || "").replace(/\/+$/, "") || API_URL_PLACEHOLDER,
    storeDomain: getStoreDomain() || STORE_DOMAIN_PLACEHOLDER,
  });

  return (
  <AdminLayout>
    <div className="f1g-dev-page">
      <Breadcrumb
        items={[
          { title: <Link to="/"><HomeOutlined /></Link> },
          { title: "Hướng dẫn kỹ thuật" },
        ]}
        style={{ marginBottom: 16 }}
      />

      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap" style={{ marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <Title level={4} style={{ margin: 0 }}>Hướng dẫn kỹ thuật</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Tài liệu kỹ thuật để dev theme gắn widget Review/Q&A, badge rating và JSON-LD.
          </Text>
        </div>
        <Link to="/guide">
          <Tag color="blue" style={{ padding: "4px 10px", margin: 0 }}>Hướng dẫn vận hành</Tag>
        </Link>
      </Flex>

      <Alert
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        style={{ marginBottom: 16 }}
        message="Không dán code trùng nhiều lần"
        description="Mỗi theme chỉ nên load CSS/JS global một lần trong layout. Product widget đặt ở trang sản phẩm; product card/listing chỉ dùng rating badge để giữ tốc độ responsive. Frontend admin Pages domain không phải storefront API source; storefront đọc host chuẩn từ config do backend publish."
      />

      <div
        className="f1g-dev-guide-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 300px",
          gap: 16,
          alignItems: "start",
          minWidth: 0,
        }}
      >
        <Card size="small" style={{ borderRadius: 12, minWidth: 0 }} styles={{ body: { padding: "16px 20px", minWidth: 0 } }}>
          <Collapse
            defaultActiveKey={["assets", "product-widget", "performance"]}
            expandIconPosition="end"
            items={buildDevSections(snippets)}
          />
        </Card>

        <Flex vertical gap={16} style={{ minWidth: 0 }}>
          <Card size="small" style={{ borderRadius: 12, minWidth: 0 }} styles={{ body: { padding: "16px 18px", minWidth: 0 } }}>
            <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
              <ProductOutlined style={{ color: "#1677ff" }} />
              <Text strong>Kiểm tra sau khi gắn</Text>
            </Flex>
            <Flex vertical gap={10}>
              <Text type="secondary">1. Mở một product có review đã duyệt.</Text>
              <Text type="secondary">2. Kiểm tra Network chỉ có batch summary cho listing, không gọi lẻ quá nhiều.</Text>
              <Text type="secondary">3. Kiểm tra form theo đúng cấu hình bắt buộc trong admin.</Text>
              <Text type="secondary">4. Test Rich Results để chắc schema có cả giá (<Text code>Offers</Text>) và điểm đánh giá (<Text code>AggregateRating</Text>) hợp lệ.</Text>
              <Text type="secondary">5. Với chế độ 2 tab, mở tab Hỏi đáp và kiểm tra Q&A mới bắt đầu gọi API.</Text>
              <Text type="secondary">6. Mở Console của trình duyệt: không được có lỗi <Text code>[f1genz-storefront]</Text>; lỗi <Text code>No API URL</Text> nghĩa là đoạn ở mục 1 chưa có <Text code>apiUrl</Text>.</Text>
              <Text type="secondary">7. Nếu đổi theme, gắn lại code thủ công ở theme mới theo đúng các snippet phía trên.</Text>
            </Flex>
          </Card>
        </Flex>
      </div>
    </div>

    <style>
      {`
        .f1g-dev-page {
          max-width: 100%;
          min-width: 0;
          overflow-x: clip;
        }
        .f1g-dev-page .ant-alert-description,
        .f1g-dev-page .ant-typography {
          overflow-wrap: anywhere;
        }
        @media (max-width: 960px) {
          .f1g-dev-guide-grid {
            grid-template-columns: 1fr !important;
          }
        }
        .f1g-dev-guide-grid,
        .f1g-dev-guide-grid .ant-card,
        .f1g-dev-guide-grid .ant-card-body,
        .f1g-dev-guide-grid .ant-collapse,
        .f1g-dev-guide-grid .ant-collapse-item,
        .f1g-dev-guide-grid .ant-collapse-content,
        .f1g-dev-guide-grid .ant-collapse-content-box {
          min-width: 0;
        }
      `}
    </style>
  </AdminLayout>
  );
};

export default DevGuidePage;
