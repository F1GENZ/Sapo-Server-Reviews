import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envExamplePath = join(root, 'server', '.env.example');
const envDocPath = join(root, 'docs', 'env-contract.md');

const requiredKeys = [
  'NODE_ENV',
  'PORT',
  'FRONTEND_URL',
  'API_BASE_URL',
  'CORS_ALLOWED_ORIGINS',
  'TRUST_PROXY',
  'REQUEST_BODY_LIMIT',
  'WEBHOOK_BODY_LIMIT',
  'HRV_CLIENT_ID',
  'HRV_CLIENT_SECRET',
  'HRV_URL_AUTHORIZE',
  'HRV_URL_CONNECT_TOKEN',
  'HRV_SCOPE_LOGIN',
  'HRV_SCOPE_INSTALL',
  'HRV_LOGIN_CALLBACK_URL',
  'HRV_INSTALL_CALLBACK_URL',
  'HRV_GRANT_TYPE_INSTALL',
  'HRV_GRANT_TYPE_REFRESH',
  'HRV_RESPONSE_TYPE',
  'HRV_RESPONSE_MODE',
  'HRV_ISSUER_URL',
  'HRV_OIDC_DISCOVERY_URL',
  'HRV_JWKS_URL',
  'HRV_WEBHOOK_URL',
  'HRV_WEBHOOK_SECRET',
  'HRV_WEBHOOK_VERIFY_TOKEN',
  'HRV_WEBHOOK_AUTO_SUBSCRIBE',
  'APP_SESSION_SECRET',
  'APP_SESSION_TTL_SECONDS',
  'SESSION_HANDOFF_TTL_SECONDS',
  'SESSION_COOKIE_NAME',
  'SESSION_COOKIE_DOMAIN',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_USERNAME',
  'REDIS_PASSWORD',
  'REDIS_TLS',
  'REDIS_KEY_PREFIX',
  'DATABASE_URL',
  'DIRECT_URL',
  'DATA_ENCRYPTION_KEY',
  'AUTH_RATE_LIMIT_WINDOW_SECONDS',
  'AUTH_RATE_LIMIT_MAX',
  'WEBHOOK_RATE_LIMIT_WINDOW_SECONDS',
  'WEBHOOK_RATE_LIMIT_MAX',
  'SESSION_EXCHANGE_RATE_LIMIT_MAX',
  'READINESS_TOKEN',
  'BUILD_SHA',
];

const fail = (messages) => {
  console.error('Env verification failed:');
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
};

if (!existsSync(envExamplePath)) fail(['server/.env.example is missing']);
if (!existsSync(envDocPath)) fail(['docs/env-contract.md is missing']);

const envExample = readFileSync(envExamplePath, 'utf8');
const envDoc = readFileSync(envDocPath, 'utf8');
const errors = [];
const seen = new Set();

for (const [index, line] of envExample.split(/\r?\n/).entries()) {
  if (!line || /^\s*#/.test(line)) continue;
  const match = /^([A-Z0-9_]+)=/.exec(line);
  if (!match) continue;
  if (seen.has(match[1])) errors.push(`Duplicate key ${match[1]} in .env.example line ${index + 1}`);
  seen.add(match[1]);
}

for (const key of requiredKeys) {
  if (!seen.has(key)) errors.push(`Missing ${key} in server/.env.example`);
  if (!envDoc.includes(`\`${key}\``)) errors.push(`Missing ${key} in docs/env-contract.md`);
}

const forbiddenSecretLike = [
  /access[_-]?token\s*=/i,
  /refresh[_-]?token\s*=/i,
  /shpat_[a-z0-9]/i,
  /xox[baprs]-/i,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
];
for (const pattern of forbiddenSecretLike) {
  if (pattern.test(envExample)) errors.push(`server/.env.example matches forbidden secret/token pattern ${pattern}`);
}

if (/NODE_ENV=production/i.test(envExample)) errors.push('server/.env.example must not default NODE_ENV to production');
if (/DATABASE_URL=.*@(?!localhost|127\.0\.0\.1)/i.test(envExample)) errors.push('server/.env.example DATABASE_URL must stay local/placeholder only');
if (/REDIS_HOST=(?!localhost|127\.0\.0\.1|redis\.example\.internal)/i.test(envExample)) errors.push('server/.env.example REDIS_HOST must stay local/placeholder only');

if (errors.length) fail(errors);
console.log(`Env verification passed for ${requiredKeys.length} documented keys.`);
