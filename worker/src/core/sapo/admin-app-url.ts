export const SAPO_APP_ADMIN_HANDLE = 'f1genz-reviews-danh-gia-san-pham';

const SAPO_STORE_HOST_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.mysapo\.net$/;

export const buildSapoAdminAppUrl = (storeDomain: unknown): string | null => {
  if (typeof storeDomain !== 'string') return null;
  const host = storeDomain.trim().toLowerCase();
  if (!SAPO_STORE_HOST_RE.test(host)) return null;
  return `https://${host}/admin/apps/${SAPO_APP_ADMIN_HANDLE}`;
};
