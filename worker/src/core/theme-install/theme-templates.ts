import type { ThemeTargetKind } from './theme-analysis';

export const LOADER_MARKER = '<!-- f1genz:loader -->';
export const WIDGET_MARKER = '<!-- f1genz:widget -->';
export const BADGE_TAG = '<f1genz-rating-badge';

export const SCHEMA_SNIPPET_BODY = `{% comment %}
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
{% endif %}
`;

// Content hash (sha256, first 10 hex chars) of the files the worker serves at
// /storefront/f1genz-storefront.{js,css}; the unit test recomputes it from the
// real files, so any runtime change forces the bump and stale cached copies
// (max-age 14400) are bypassed by the query in the loader snippet.
export const STOREFRONT_ASSET_VERSION = { js: '13a6caa209', css: 'd540f48d96' };

export const buildSnippet = (kind: ThemeTargetKind, input: { apiUrl: string; storeDomain: string }): string => {
  const apiUrl = input.apiUrl.replace(/\/+$/, '');
  const storeDomain = JSON.stringify(input.storeDomain);
  if (kind === 'loader') {
    return [
      LOADER_MARKER,
      '<script>',
      `  window.__F1GENZ_STOREFRONT_CONFIG = { apiUrl: ${JSON.stringify(apiUrl)}, storeDomain: ${storeDomain} };`,
      '</script>',
      `<link rel="stylesheet" href="${apiUrl}/storefront/f1genz-storefront.css?v=${STOREFRONT_ASSET_VERSION.css}">`,
      `<script src="${apiUrl}/storefront/f1genz-storefront.js?v=${STOREFRONT_ASSET_VERSION.js}" defer></script>`,
      '',
    ].join('\n');
  }
  if (kind === 'widget') {
    return [
      WIDGET_MARKER,
      '<f1genz-reviews',
      '  product-id="{{ product.id }}"',
      `  storeDomain=${storeDomain}`,
      '  customer-email="{{ customer.email | escape }}"',
      '  customer-phone="{{ customer.phone | escape }}"',
      '></f1genz-reviews>',
      '',
    ].join('\n');
  }
  if (kind === 'schema') {
    return SCHEMA_SNIPPET_BODY;
  }
  return [
    '<f1genz-rating-badge',
    '  product-id="{{ product.id }}"',
    `  storeDomain=${storeDomain}`,
    '></f1genz-rating-badge>',
    '',
  ].join('\n');
};
