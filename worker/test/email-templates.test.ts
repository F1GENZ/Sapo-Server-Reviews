import { describe, expect, it } from 'vitest';
import { htmlToText, renderReviewRequestEmail, renderTemplate } from '../src/core/email/templates';

const VARS = {
  customer_name: 'Anh Nguyễn',
  shop_name: 'Tôm Khô Shop',
  products: '<li><a href="https://shop.example/products/tom-kho?t=1">Tôm khô 500g</a></li>',
  review_link: 'https://shop.example/products/tom-kho?t=1',
};

describe('review-request email templates', () => {
  it('interpolates {{variables}} and leaves unknown ones untouched', () => {
    expect(renderTemplate('Chào {{customer_name}} — {{shop_name}} {{bogus}}', { ...VARS, discount_code: 'X' })).toBe(
      'Chào Anh Nguyễn — Tôm Khô Shop {{bogus}}',
    );
  });

  it('renders the default Vietnamese template with a discount code', () => {
    const out = renderReviewRequestEmail({ subject_tpl: '', body_tpl: '', discount_code: 'GIAM10' }, VARS);
    expect(out.subject).toBe('Tôm Khô Shop: Đánh giá đơn hàng của bạn');
    expect(out.html).toContain('Xin chào Anh Nguyễn');
    expect(out.html).toContain('Tôm khô 500g');
    expect(out.html).toContain('<strong>GIAM10</strong>');
    expect(out.text).toContain('- Tôm khô 500g: https://shop.example/products/tom-kho?t=1');
    expect(out.text).not.toContain('<a ');
  });

  it('omits the discount block when no code is configured', () => {
    const out = renderReviewRequestEmail({ subject_tpl: 'S {{shop_name}}', body_tpl: 'B {{review_link}}', discount_code: '' }, VARS);
    expect(out.subject).toBe('S Tôm Khô Shop');
    expect(out.html).toBe('B https://shop.example/products/tom-kho?t=1');
    expect(out.html).not.toContain('giảm giá');
  });

  it('htmlToText turns links into label: url and bullets into lines', () => {
    const text = htmlToText('<ul><li><a href="https://x">Sp A</a></li></ul><p>Hẹn gặp&nbsp;lại</p>');
    expect(text).toContain('- Sp A: https://x');
    expect(text).toContain('Hẹn gặp lại');
  });
});
