import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const snapshotPath = 'E:/Work/scratch/backups/261108-guarantee-cf/sapo-reviews-db.json';
const snapshotJson = existsSync(snapshotPath) ? readFileSync(snapshotPath, 'utf-8') : '';
const devVarsPath = resolve(__dirname, './.dev.vars');
const parsedDevVars: Record<string, string> = {};
if (existsSync(devVarsPath)) {
  for (const rawLine of readFileSync(devVarsPath, 'utf-8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      parsedDevVars[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
    }
  }
}

const fallbackBindings: Record<string, string> = {
  SAPO_CLIENT_ID: 'sapo-test-client-id-123456',
  SAPO_CLIENT_SECRET: 'sapo-test-client-secret-1234567890abcdef',
  DATA_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  APP_SESSION_SECRET: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
  READINESS_TOKEN: 'test-readiness-token-1234567890abcdef',
  R2_UPLOAD_SECRET: 'test-r2-upload-secret-1234567890abcdef',
  MIGRATION_IMPORT_TOKEN: 'test-migration-import-token-32bytes-ok',
  ...parsedDevVars,
};

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        compatibilityDate: '2026-10-01',
        compatibilityFlags: ['nodejs_compat'],
        bindings: {
          ...fallbackBindings,
          SAPO_DB_SNAPSHOT_JSON: snapshotJson,
        },
      },
    }),
  ],
  ssr: {
    noExternal: true,
  },
  resolve: {
    alias: [
      { find: /^@nestjs\/common(\/.*)?$/, replacement: resolve(__dirname, './src/shims/nestjs-common.ts') },
      { find: /^@nestjs\/core(\/.*)?$/, replacement: resolve(__dirname, './src/shims/nestjs-common.ts') },
      { find: /^@nestjs\/platform-express(\/.*)?$/, replacement: resolve(__dirname, './src/shims/nestjs-common.ts') },
      { find: /^class-validator(\/.*)?$/, replacement: resolve(__dirname, './src/shims/nestjs-common.ts') },
      { find: /^class-transformer(\/.*)?$/, replacement: resolve(__dirname, './src/shims/nestjs-common.ts') },
      { find: /^@prisma\/client(\/.*)?$/, replacement: resolve(__dirname, './src/shims/prisma-client.ts') },
      { find: /^ioredis(\/.*)?$/, replacement: resolve(__dirname, './src/shims/ioredis.ts') },
    ],
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
