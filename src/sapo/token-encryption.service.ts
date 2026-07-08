import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';

export type EncryptedToken = {
  ciphertext: string;
  iv: string;
  tag: string;
};

const decodeKey = (value: string): Buffer => {
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex');
  return Buffer.from(value, 'base64');
};

@Injectable()
export class TokenEncryptionService {
  private readonly key: Buffer;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    if (!env.DATA_ENCRYPTION_KEY) throw new Error('DATA_ENCRYPTION_KEY is required');
    this.key = decodeKey(env.DATA_ENCRYPTION_KEY);
    if (this.key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes');
  }

  encrypt(value: string): EncryptedToken {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(value: EncryptedToken): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(value.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  optionalDecrypt(value: Partial<EncryptedToken> | null | undefined): string | null {
    if (!value?.ciphertext || !value.iv || !value.tag) return null;
    return this.decrypt(value as EncryptedToken);
  }
}
