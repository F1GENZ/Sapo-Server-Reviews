import Link from "../../components/StoreLink";
import AdminLayout from "../../components/layout/AdminLayout";
import { getStoreDomain } from "../../common/AuthStorage";
import { toast } from "../../common/toast";
import ThemeInstallCard from "./ThemeInstallCard";
import { Alert, Breadcrumb, Button, Card, Collapse, Flex, Tag, Typography } from "antd";
import { CopyOutlined, HomeOutlined } from "@ant-design/icons";

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

  schemaComponent: `<f1genz-product-schema
  product-id="{{ product.id }}"
  storeDomain="${storeDomain}"
  product-name="{{ product.title | escape }}"
  brand="{{ product.vendor | escape }}"
></f1genz-product-schema>`,

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

const buildManualSteps = (snippets) => [
  {
    key: "assets",
    label: <Text strong>1. Loader CSS/JS (layout)</Text>,
    children: (
      <>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Dán trước <Text code>{`</body>`}</Text> trong layout chính. <Text code>apiUrl</Text> là host API của app, không phải domain Pages admin
          (nếu bản build chưa có <Text code>VITE_STOREFRONT_API_URL</Text>, thay <Text code>{API_URL_PLACEHOLDER}</Text>).
          <Text code>storeDomain</Text> luôn là tên miền <Text code>.mysapo.net</Text> của shop.
        </Paragraph>
        <CodeBlock code={snippets.assets} />
      </>
    ),
  },
  {
    key: "product-widget",
    label: <Text strong>2. Khối đánh giá và hỏi đáp (trang sản phẩm)</Text>,
    children: (
      <>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Dán dưới mô tả hoặc tab đánh giá. Xếp dọc hay 2 tab do trang Cấu hình quyết định.
        </Paragraph>
        <CodeBlock code={snippets.productWidget} />
      </>
    ),
  },
  {
    key: "product-card",
    label: <Text strong>3. Badge số sao (thẻ sản phẩm)</Text>,
    children: (
      <>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Dán sau tiêu đề trong product card hoặc vòng lặp collection. Ở đây chỉ dùng badge, không dán <Text code>f1genz-reviews</Text>.
        </Paragraph>
        <CodeBlock code={snippets.cardBadge} />
      </>
    ),
  },
  {
    key: "schema",
    label: <Text strong>4. JSON-LD cho SEO (tuỳ chọn)</Text>,
    children: (
      <>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Tạo <Text code>snippets/f1genz-product-schema.bwt</Text> với nội dung dưới, rồi chèn một dòng include trong template sản phẩm.
          Snippet xuất <Text code>aggregateRating</Text> (từ metafield <Text code>f1genz_reviews</Text>, không có đánh giá thì không xuất) và <Text code>offers</Text> (giá VND, còn hàng/hết hàng).
          Mỗi sản phẩm chỉ nên có một khối <Text code>aggregateRating</Text>: gỡ khối tương tự có sẵn trong theme.
          Không dùng snippet thì script storefront tự dựng khối này; đặt <Text code>autoProductSchema: false</Text> trong cấu hình ở mục 1 để tắt.
        </Paragraph>
        <CodeBlock code={snippets.schemaFile} />
        <CodeBlock code={snippets.schema} />
      </>
    ),
  },
  {
    key: "slider",
    label: <Text strong>5. Slider đánh giá nổi bật (tuỳ chọn)</Text>,
    children: (
      <>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Dán dưới khối đánh giá. Bật dải và chọn 5-15 đánh giá tại <Text strong>Cấu hình → Hiển thị</Text>; thuộc tính <Text code>count</Text> chỉ là gợi ý.
        </Paragraph>
        <CodeBlock code={snippets.slider} />
      </>
    ),
  },
  {
    key: "advanced",
    label: <Text strong>6. Tuỳ chọn nâng cao</Text>,
    children: (
      <>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Đánh giá và hỏi đáp ở hai vị trí khác nhau (ví dụ mỗi mục một tab của theme): dùng hai panel thay cho <Text code>f1genz-reviews</Text> ở mục 2.
        </Paragraph>
        <CodeBlock code={snippets.productPanels} />
        <Paragraph type="secondary" style={{ margin: "12px 0 0" }}>
          Badge có sẵn điểm khi tải trang, thay cho badge ở mục 3: in giá trị thô từ metafield <Text code>f1genz_reviews</Text> do app ghi.
        </Paragraph>
        <CodeBlock code={snippets.cardBadgeSsr} />
        <Paragraph type="secondary" style={{ margin: "12px 0 0" }}>
          Không tạo được file snippet ở mục 4: dùng phần tử dưới, dựng JSON-LD trên trình duyệt. Chỉ dùng một trong hai cách để không có hai khối <Text code>aggregateRating</Text>.
        </Paragraph>
        <CodeBlock code={snippets.schemaComponent} />
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
          items={[{ title: <Link to="/"><HomeOutlined /></Link> }, { title: "Hướng dẫn kỹ thuật" }]}
          style={{ marginBottom: 16 }}
        />

        <Flex align="flex-start" justify="space-between" gap={16} wrap="wrap" style={{ marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <Title level={4} style={{ margin: 0 }}>Hướng dẫn kỹ thuật</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>Cài widget vào theme tự động, hoặc dán tay.</Text>
          </div>
          <Link to="/guide">
            <Tag color="blue" style={{ padding: "4px 10px", margin: 0 }}>Hướng dẫn vận hành</Tag>
          </Link>
        </Flex>

        <ThemeInstallCard />

        <Card size="small" style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: "12px 16px" } }}>
          <Text strong>Dán tay </Text>
          <Text type="secondary">khi theme tuỳ biến nhiều và cài tự động không phù hợp. Mỗi thành phần chỉ dán một lần.</Text>
          <Collapse ghost expandIconPosition="end" items={buildManualSteps(snippets)} style={{ marginTop: 8 }} />
        </Card>

        <Alert
          type="info"
          showIcon
          message="Kiểm tra sau khi gắn"
          description={
            <Flex vertical gap={4}>
              <Text type="secondary">Mở sản phẩm có đánh giá đã duyệt: khối đánh giá hiện, badge hiện ở trang danh sách.</Text>
              <Text type="secondary">Console không có lỗi <Text code>[f1genz-storefront]</Text>; <Text code>No API URL</Text> nghĩa là thiếu <Text code>apiUrl</Text> ở mục 1.</Text>
              <Text type="secondary">Rich Results Test thấy <Text code>Offers</Text> và <Text code>AggregateRating</Text> hợp lệ.</Text>
              <Text type="secondary">Đổi theme thì chạy lại Cài tự động hoặc dán lại các đoạn trên.</Text>
            </Flex>
          }
        />
      </div>

      <style>
        {`
          .f1g-dev-page { max-width: 100%; min-width: 0; overflow-x: clip; }
          .f1g-dev-page .ant-alert-description,
          .f1g-dev-page .ant-typography { overflow-wrap: anywhere; }
        `}
      </style>
    </AdminLayout>
  );
};

export default DevGuidePage;
