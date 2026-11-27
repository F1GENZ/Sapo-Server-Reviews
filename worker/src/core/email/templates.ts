// Vietnamese default templates for the post-fulfillment review-request email. {{variables}} are
// interpolated into both the subject and the HTML body; the text part is generated from the HTML by
// stripping tags (kept simple: the body template is the single source of truth).

export type TemplateVars = {
  customer_name: string;
  shop_name: string;
  /** Rendered list of products with review links (HTML: <li><a>; text: "- title: link"). */
  products: string;
  discount_code: string;
  /** Review link of the first product; kept for templates that use a single CTA. */
  review_link: string;
};

export const DEFAULT_SUBJECT_TPL = '{{shop_name}}: Đánh giá đơn hàng của bạn';
export const DEFAULT_BODY_TPL = `<p>Xin chào {{customer_name}},</p>
<p>Cảm ơn bạn đã mua hàng tại <strong>{{shop_name}}</strong>. Đơn hàng của bạn đã được giao — hãy dành một phút đánh giá sản phẩm để giúp những khách hàng khác:</p>
<ul>
{{products}}
</ul>
<p>Mỗi đánh giá của bạn rất quý giá với chúng tôi.</p>
<p>Trân trọng,<br/>{{shop_name}}</p>`;

const DISCOUNT_BLOCK = `<p>Dùng mã giảm giá <strong>{{discount_code}}</strong> cho đơn hàng tiếp theo của bạn.</p>`;

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Interpolates {{var}} — unknown variables are left untouched so a typo is visible in the output. */
export const renderTemplate = (tpl: string, vars: TemplateVars): string =>
  tpl.replace(VAR_RE, (match, key: string) => (Object.hasOwn(vars, key) ? (vars as Record<string, string>)[key] : match));

/** Rough text rendering of the HTML body: links keep their href, list items become bullet lines. */
export const htmlToText = (html: string): string =>
  html
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => `${label.trim()}: ${href}`)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|li|ul|ol|h[1-6]|div|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export type RenderedEmail = { subject: string; html: string; text: string };

export const renderReviewRequestEmail = (
  templates: { subject_tpl: string; body_tpl: string; discount_code: string },
  vars: Omit<TemplateVars, 'discount_code'>,
): RenderedEmail => {
  const all: TemplateVars = { ...vars, discount_code: templates.discount_code };
  const body = templates.body_tpl || DEFAULT_BODY_TPL;
  // The discount line is appended only when a code exists, so a template never shows an empty code block.
  const html = renderTemplate(templates.discount_code ? `${body}\n${DISCOUNT_BLOCK}` : body, all);
  return { subject: renderTemplate(templates.subject_tpl || DEFAULT_SUBJECT_TPL, all), html, text: htmlToText(html) };
};

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
