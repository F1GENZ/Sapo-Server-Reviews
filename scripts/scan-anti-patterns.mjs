import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scanRoots = ['server/src', 'client/src', 'client/functions', 'scripts'];
const scanFiles = ['package.json', 'server/package.json', 'client/package.json'];
const ignoredNames = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.vite', 'coverage']);
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);

const findings = [];

const addFinding = (file, rule, detail) => {
  findings.push({ file: relative(root, file).replaceAll('\\', '/'), rule, detail });
};

const extensionOf = (file) => {
  const match = /\.[^.]+$/.exec(file);
  return match ? match[0] : '';
};

const walk = (dir) => {
  if (!existsSync(dir)) return [];
  const entries = [];
  for (const name of readdirSync(dir)) {
    if (ignoredNames.has(name)) continue;
    const fullPath = join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) entries.push(...walk(fullPath));
    if (stat.isFile() && allowedExtensions.has(extensionOf(name))) entries.push(fullPath);
  }
  return entries;
};

const files = [
  ...scanRoots.flatMap((entry) => walk(join(root, entry))),
  ...scanFiles.map((entry) => join(root, entry)).filter((entry) => existsSync(entry)),
].filter((file) => !file.endsWith('scan-anti-patterns.mjs'));

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(root, file).replaceAll('\\', '/');

  const checks = [
    {
      rule: 'no-jwt-decode-identity',
      regex: /\bjwt\.decode\s*\(/,
      detail: 'Do not trust jwt.decode() for OAuth/OIDC identity; verify with JWKS.',
    },
    {
      rule: 'no-redis-keys',
      regex: /(?:redis|client|this\.client)\.keys\s*\(|\bKEYS\s+[^'"`]/,
      detail: 'Do not use Redis KEYS in production paths; use SCAN or indexed DB lookups.',
    },
    {
      rule: 'no-local-storage-session-token',
      regex: /(?:localStorage|sessionStorage)\.setItem\s*\(\s*['"`](?:session_token|sessionToken|auth_token|token)['"`]/i,
      detail: 'Do not persist app session tokens in browser storage; use HttpOnly cookie handoff.',
    },
    {
      rule: 'no-session-token-url',
      regex: /[?&#]session_token=|session_token\s*[:=]\s*['"`]?\$?\{/i,
      detail: 'Do not pass app session tokens in URLs or fragments.',
    },
    {
      rule: 'no-direct-no-hmac-session-flag',
      regex: /ALLOW_DIRECT_SESSION|NO_HMAC_DIRECT_SESSION|directNoHmacSession|noHmacDirectSession/,
      detail: 'V1 must not expose a no-HMAC direct session compatibility path.',
    },
    {
      rule: 'no-hardcoded-backend-fallback',
      regex: /BACKEND_URL[^\n]*(?:\|\||\?\?)[^\n]*https?:\/\//i,
      detail: 'Cloudflare proxy must require BACKEND_URL instead of falling back to app-specific domains.',
    },
    {
      rule: 'no-pm2-watch-in-scripts',
      regex: /pm2\s+[^\n]*--watch/i,
      detail: 'Production process scripts must not enable pm2 --watch.',
    },
    {
      rule: 'no-npm-install-deploy-script',
      regex: /"[^"\n]*(?:deploy|prod|production)[^"\n]*"\s*:\s*"[^"]*npm install/i,
      detail: 'Production deploy scripts must use npm ci, not npm install.',
    },
  ];

  for (const check of checks) {
    if (check.regex.test(text)) addFinding(file, check.rule, check.detail);
  }

  if (/oauth-state\.service\.ts$|session\.service\.ts$/.test(rel)) {
    if (/redis\.get(?:<[^>]+>)?\s*\([\s\S]{0,1200}redis\.del\s*\(/.test(text)) {
      addFinding(file, 'no-non-atomic-consume', 'OAuth state and session handoff must use getDel/Lua atomic consume, not get then del.');
    }
  }

  if (/webhook\.service\.ts$/.test(rel) && /random(?:Bytes|UUID)|Math\.random/.test(text)) {
    addFinding(file, 'no-random-webhook-idempotency', 'Webhook idempotency keys must be deterministic, not random fallback IDs.');
  }

  if (/redis\.service\.ts$/.test(rel) && /setNx\s*\([\s\S]{0,600}\.del\s*\(/.test(text) && !/releaseLock/.test(text)) {
    addFinding(file, 'no-non-owner-lock-release', 'Redis locks must release only with owner compare/delete.');
  }
}

if (findings.length) {
  console.error('Anti-pattern scan failed:');
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.rule} — ${finding.detail}`);
  }
  process.exit(1);
}

console.log(`Anti-pattern scan passed across ${files.length} files.`);
