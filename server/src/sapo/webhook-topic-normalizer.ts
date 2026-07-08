export type CanonicalWebhookTopic =
  | 'app/charge'
  | 'app/uninstalled'
  | 'shop/update'
  | 'unknown';

const CHARGE_TOPICS = new Set([
  'app/charge',
  'app/charges',
  'app/charge_update',
  'app_charge_update',
  'app_charge',
  'charges/update',
  'charges_update',
]);

const UNINSTALL_TOPICS = new Set([
  'app_uninstall_webhook',
  'app_uninstall',
  'app/uninstall',
  'app/uninstalled',
  'apps/uninstall',
  'apps/uninstalled',
  'app_uninstalled',
]);

const SHOP_UPDATE_TOPICS = new Set([
  'shop/update',
  'shops/update',
  'shop_update',
  'shops_update',
  'shop_update_webhook',
]);

export const normalizeWebhookTopic = (topic: unknown): CanonicalWebhookTopic => {
  const value = typeof topic === 'string' ? topic.trim().toLowerCase() : '';
  if (CHARGE_TOPICS.has(value)) return 'app/charge';
  if (UNINSTALL_TOPICS.has(value)) return 'app/uninstalled';
  if (SHOP_UPDATE_TOPICS.has(value)) return 'shop/update';
  return 'unknown';
};

export const isKnownWebhookTopic = (topic: unknown): boolean =>
  normalizeWebhookTopic(topic) !== 'unknown';

export const WEBHOOK_SUBSCRIBE_TOPICS = [
  'app/charge',
  'app/uninstalled',
  'shop/update',
] as const;
