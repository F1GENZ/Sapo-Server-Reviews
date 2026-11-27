import { createHmac, hkdfSync, timingSafeEqual } from 'crypto';

// Review-request link tokens: 'rr1.<orderId>.<hmac-hex>' over `<shopId>|<productId>|<orderId>` under an
// HKDF key derived from DATA_ENCRYPTION_KEY (same pattern as the purchase identity key). A long-lived
// signature is deliberate — the customer may open the email weeks later. The storefront widget echoes
// the token back on submit; verification is proof of purchase for exactly that product and order.

const TOKEN_PREFIX = 'rr1';
const KEY_LABEL = Buffer.from('f1genz-review-request-link', 'utf8');

const deriveKey = (encryptionKey: string): Buffer => Buffer.from(hkdfSync('sha256', encryptionKey, Buffer.alloc(0), KEY_LABEL, 32));

const hmacHex = (key: Buffer, payload: string): string => createHmac('sha256', key).update(payload).digest('hex');

const safeEqualHex = (a: string, b: string): boolean => {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

export type ReviewTokenSigner = {
  sign: (shopId: string, orderId: string, productId: string) => string;
  /** Returns the order id the token proves for this product+shop, or null for anything invalid. */
  verify: (shopId: string, token: string, productId: string) => string | null;
};

export const createReviewTokenSigner = (encryptionKey: string): ReviewTokenSigner => {
  const key = deriveKey(encryptionKey);
  return {
    sign: (shopId, orderId, productId) => `${TOKEN_PREFIX}.${orderId}.${hmacHex(key, `${shopId}|${productId}|${orderId}`)}`,
    verify: (shopId, token, productId) => {
      if (!productId) return null;
      const parts = String(token || '').trim().split('.');
      if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
      const [, orderId, signature] = parts;
      if (!orderId || !/^[a-f0-9]{64}$/i.test(signature)) return null;
      const expected = hmacHex(key, `${shopId}|${productId}|${orderId}`);
      return safeEqualHex(expected, signature.toLowerCase()) ? orderId : null;
    },
  };
};
