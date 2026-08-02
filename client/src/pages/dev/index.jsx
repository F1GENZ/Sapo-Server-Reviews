import Link from "../../components/OrgLink";
import AdminLayout from "../../components/layout/AdminLayout";
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

const LIQUID_ASSETS_SNIPPET = `{% if shop.metafields.f1genz.config != blank %}
  <script>
    window.__F1GENZ_STOREFRONT_CONFIG = {{ shop.metafields.f1genz.config.value | json }};
  </script>
  <link rel="stylesheet" href="{{ shop.metafields.f1genz.config.value.apiUrl }}/storefront/f1genz-storefront.css">
  <script src="{{ shop.metafields.f1genz.config.value.apiUrl }}/storefront/f1genz-storefront.js" defer></script>
{% endif %}`;

const PRODUCT_WIDGET_SNIPPET = `<f1genz-reviews
  product-id="{{ product.id }}"
  orgid="{{ shop.metafields.f1genz.config.value.orgid }}"
  customer-email="{{ customer.email | escape }}"
  customer-phone="{{ customer.phone | default: customer.default_address.phone | escape }}"
></f1genz-reviews>`;

const PRODUCT_PANELS_SNIPPET = `<f1genz-reviews-panel
  product-id="{{ product.id }}"
  orgid="{{ shop.metafields.f1genz.config.value.orgid }}"
  customer-email="{{ customer.email | escape }}"
  customer-phone="{{ customer.phone | default: customer.default_address.phone | escape }}"
></f1genz-reviews-panel>

<f1genz-qna-panel
  product-id="{{ product.id }}"
  orgid="{{ shop.metafields.f1genz.config.value.orgid }}"
  customer-email="{{ customer.email | escape }}"
  customer-phone="{{ customer.phone | default: customer.default_address.phone | escape }}"
></f1genz-qna-panel>`;

const PRODUCT_CARD_BADGE_SNIPPET = `<f1genz-rating-badge
  orgid="{{ shop.metafields.f1genz.config.value.orgid }}"
  product-id="{{ product.id }}"
  avg-rating="{{ product.metafields.reviews.public_summary.value.avg | default: 0 | plus: 0.0 }}"
  review-count="{{ product.metafields.reviews.public_summary.value.count | default: 0 | plus: 0 }}"
></f1genz-rating-badge>`;

const PRODUCT_SCHEMA_SNIPPET = `{%- if template contains 'product' -%}
{%- assign f1g_site_url = shop.url | replace: 'http://', 'https://' -%}
{%- capture f1g_product_url -%}{{ f1g_site_url }}{{ product.url }}{%- endcapture -%}
{%- assign f1g_canonical_url = canonical_url | default: f1g_product_url | replace: 'http://', 'https://' -%}
{%- capture f1g_product_id -%}{{ f1g_canonical_url }}#product{%- endcapture -%}
{%- capture f1g_organization_id -%}{{ f1g_site_url }}#organization{%- endcapture -%}
{%- assign f1g_product_description = product.description | strip_html | strip_newlines | strip | truncate: 500 -%}
{%- if f1g_product_description == blank -%}
  {%- assign f1g_product_description = product.title | strip_html | strip_newlines | strip -%}
{%- endif -%}
{%- assign f1g_variant = product.selected_or_first_available_variant -%}
{%- assign f1g_product_sku = f1g_variant.sku -%}
{%- if f1g_product_sku == blank -%}
  {%- assign f1g_product_sku = product.id -%}
{%- endif -%}
{%- assign f1g_product_barcode = f1g_variant.barcode | strip -%}
{%- assign f1g_review_summary = product.metafields.reviews.public_summary.value -%}
{%- assign f1g_review_avg = f1g_review_summary.avg | default: 0 | plus: 0.0 -%}
{%- assign f1g_review_count = f1g_review_summary.count | default: 0 | plus: 0 -%}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": {{ f1g_product_id | json }},
  "name": {{ product.title | strip_html | strip_newlines | strip | json }},
  "description": {{ f1g_product_description | json }},
  "image": [
    {%- assign f1g_image_count = 0 -%}
    {%- for image in product.images limit: 6 -%}
      {%- assign f1g_loop_image = image.src | product_img_url: '1024x1024' -%}
      {%- if f1g_loop_image contains 'https://' -%}
      {%- elsif f1g_loop_image contains 'http://' -%}
        {%- assign f1g_loop_image = f1g_loop_image | replace: 'http://', 'https://' -%}
      {%- elsif f1g_loop_image contains '//' -%}
        {%- assign f1g_loop_image = 'https:' | append: f1g_loop_image -%}
      {%- endif -%}
      {%- if f1g_image_count > 0 -%},{%- endif -%}
      {{ f1g_loop_image | json }}
      {%- assign f1g_image_count = f1g_image_count | plus: 1 -%}
    {%- endfor -%}
    {%- if f1g_image_count == 0 -%}
      {%- assign f1g_fallback_image = product.featured_image.src | product_img_url: '1024x1024' -%}
      {%- if f1g_fallback_image contains 'https://' -%}
      {%- elsif f1g_fallback_image contains 'http://' -%}
        {%- assign f1g_fallback_image = f1g_fallback_image | replace: 'http://', 'https://' -%}
      {%- elsif f1g_fallback_image contains '//' -%}
        {%- assign f1g_fallback_image = 'https:' | append: f1g_fallback_image -%}
      {%- endif -%}
      {{ f1g_fallback_image | json }}
    {%- endif -%}
  ],
  "sku": {{ f1g_product_sku | json }},
  "mpn": {{ f1g_product_sku | json }},
  {%- if f1g_product_barcode != blank -%}
  {%- assign f1g_barcode_size = f1g_product_barcode | size -%}
  {%- if f1g_barcode_size == 8 -%}
  "gtin8": {{ f1g_product_barcode | json }},
  {%- elsif f1g_barcode_size == 12 -%}
  "gtin12": {{ f1g_product_barcode | json }},
  {%- elsif f1g_barcode_size == 13 -%}
  "gtin13": {{ f1g_product_barcode | json }},
  {%- elsif f1g_barcode_size == 14 -%}
  "gtin14": {{ f1g_product_barcode | json }},
  {%- else -%}
  "gtin": {{ f1g_product_barcode | json }},
  {%- endif -%}
  {%- endif -%}
  "brand": {
    "@type": "Brand",
    "name": {{ product.vendor | default: shop.name | strip_html | strip_newlines | strip | json }}
  },
  {%- if f1g_review_count > 0 and f1g_review_avg > 0 -%}
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": {{ f1g_review_avg }},
    "reviewCount": {{ f1g_review_count }},
    "bestRating": 5,
    "worstRating": 1
  },
  {%- endif -%}
  "offers": {
    "@type": "Offer",
    "url": {{ f1g_canonical_url | json }},
    "priceCurrency": {{ cart.currency.iso_code | default: shop.currency | default: 'VND' | json }},
    "price": {{ f1g_variant.price | money_without_currency | remove: ',' | remove: '.' | remove: '₫' | remove: "VND" | strip | json }},
    "priceValidUntil": {{ 'now' | date: '%Y-12-31' | json }},
    "availability": {% if product.available %}"https://schema.org/InStock"{% else %}"https://schema.org/OutOfStock"{% endif %},
    "itemCondition": "https://schema.org/NewCondition",
    "seller": {
      "@type": "Organization",
      "@id": {{ f1g_organization_id | json }},
      "name": {{ shop.name | strip_html | strip_newlines | strip | json }}
    }
  }
}
</script>
{%- endif -%}`;

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

const devSections = [
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
          Dán trước <Text code>{`</body>`}</Text> trong <Text code>layout/theme.liquid</Text>.
          Đoạn này chỉ load khi app đã publish config vào metafield shop. Liquid sẽ expose nguyên object <Text code>f1genz.config</Text> cho runtime và dùng <Text code>shop.metafields.f1genz.config.value.apiUrl</Text> làm host chuẩn cho cả asset CSS/JS lẫn public API, không lấy từ domain Pages admin.
        </Paragraph>
        <CodeBlock code={LIQUID_ASSETS_SNIPPET} />
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
        <CodeBlock code={PRODUCT_WIDGET_SNIPPET} />
        <Paragraph type="secondary" style={{ marginTop: 14, lineHeight: 1.7 }}>
          Nếu theme cần tách đánh giá và hỏi đáp thành hai vị trí khác nhau, dùng bản panel riêng:
        </Paragraph>
        <CodeBlock code={PRODUCT_PANELS_SNIPPET} />
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
          Dán trong file product card như <Text code>product-loop.liquid</Text>,
          <Text code> product-item.liquid</Text> hoặc block item của trang collection/search.
        </Paragraph>
        <CodeBlock code={PRODUCT_CARD_BADGE_SNIPPET} />
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
          Dán trong trang chi tiết sản phẩm, tốt nhất gần cuối template. Snippet render JSON-LD ngay từ Liquid
          để Schema.org validator đọc được; không dùng <Text code>| json</Text> cho <Text code>ratingValue</Text> / <Text code>reviewCount</Text> sau khi đã ép số bằng <Text code>plus</Text>.
        </Paragraph>
        <CodeBlock code={PRODUCT_SCHEMA_SNIPPET} />
      </>
    ),
  },
  {
    key: "performance",
    label: (
      <Flex align="center" gap={8}>
        <WarningOutlined style={{ color: "#fa8c16" }} />
        <Text strong>5. Tối ưu responsive / tốc độ</Text>
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

const DevGuidePage = () => (
  <AdminLayout>
    <div className="f1g-dev-page">
      <Breadcrumb
        items={[
          { title: <Link to="/"><HomeOutlined /></Link> },
          { title: "Dev guide" },
        ]}
        style={{ marginBottom: 16 }}
      />

      <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap" style={{ marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <Title level={4} style={{ margin: 0 }}>Dev guide gắn code storefront</Title>
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
            items={devSections}
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
              <Text type="secondary">4. Test Rich Results để chắc schema có giá và review hợp lệ.</Text>
              <Text type="secondary">5. Với chế độ 2 tab, mở tab Hỏi đáp và kiểm tra Q&A mới bắt đầu gọi API.</Text>
              <Text type="secondary">6. Nếu đổi theme, gắn lại code thủ công ở theme mới theo đúng các snippet phía trên.</Text>
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

export default DevGuidePage;
