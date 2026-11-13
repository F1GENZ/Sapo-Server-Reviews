import type { ThemeTargetKind } from './theme-analysis';

export const LOADER_MARKER = '<!-- f1genz:loader -->';
export const WIDGET_MARKER = '<!-- f1genz:widget -->';
export const BADGE_TAG = '<f1genz-rating-badge';

export const buildSnippet = (kind: ThemeTargetKind, input: { apiUrl: string; storeDomain: string }): string => {
  const apiUrl = input.apiUrl.replace(/\/+$/, '');
  const storeDomain = JSON.stringify(input.storeDomain);
  if (kind === 'loader') {
    return [
      LOADER_MARKER,
      '<script>',
      `  window.__F1GENZ_STOREFRONT_CONFIG = { apiUrl: ${JSON.stringify(apiUrl)}, storeDomain: ${storeDomain} };`,
      '</script>',
      `<link rel="stylesheet" href="${apiUrl}/storefront/f1genz-storefront.css">`,
      `<script src="${apiUrl}/storefront/f1genz-storefront.js" defer></script>`,
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
  return [
    '<f1genz-rating-badge',
    '  product-id="{{ product.id }}"',
    `  storeDomain=${storeDomain}`,
    '></f1genz-rating-badge>',
    '',
  ].join('\n');
};
