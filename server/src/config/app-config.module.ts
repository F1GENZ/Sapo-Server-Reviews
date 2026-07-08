import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { Global, Module } from '@nestjs/common';
import { loadEnv, type AppEnv } from './env.schema';

export const APP_ENV = Symbol('APP_ENV');

const parseEnvLine = (line: string): [string, string] | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const separator = trimmed.indexOf('=');
  if (separator <= 0) return null;
  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return /^[A-Z0-9_]+$/.test(key) ? [key, value] : null;
};

const loadDotEnvFile = (path: string): void => {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (process.env[key] === undefined) process.env[key] = value;
  }
};

const loadLocalEnv = (): void => {
  loadDotEnvFile(resolve(process.cwd(), '.env'));
  loadDotEnvFile(resolve(process.cwd(), 'server', '.env'));
};

@Global()
@Module({
  providers: [
    {
      provide: APP_ENV,
      useFactory: (): AppEnv => {
        loadLocalEnv();
        return loadEnv(process.env);
      },
    },
  ],
  exports: [APP_ENV],
})
export class AppConfigModule {}
