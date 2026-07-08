import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
};

const buildQueryMessageCandidates = (rawQueryString: string): string[] => {
  const pairs = rawQueryString
    .split('&')
    .filter(Boolean)
    .map((part) => {
      const eqIndex = part.indexOf('=');
      const rawKey = eqIndex >= 0 ? part.slice(0, eqIndex) : part;
      const rawValue = eqIndex >= 0 ? part.slice(eqIndex + 1) : '';
      return {
        key: safeDecodeURIComponent(rawKey),
        value: safeDecodeURIComponent(rawValue),
        rawKey,
        rawValue,
      };
    })
    .filter((pair) => pair.key !== 'hmac' && pair.rawKey !== 'hmac');

  // Sapo requires params sorted A-Z by key (alphabetical order)
  const sorted = [...pairs].sort((a, b) => a.key.localeCompare(b.key));

  return [
    sorted.map((pair) => `${pair.key}=${pair.value}`).join('&'),
    sorted.map((pair) => `${pair.rawKey}=${pair.rawValue}`).join('&'),
  ].filter((value, index, list) => value && list.indexOf(value) === index);
};

const timingSafeHexEqual = (expectedHex: string, actualHex: string): boolean => {
  if (!/^[a-f0-9]{64}$/i.test(actualHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const parseWebhookSignature = (signature: string): Buffer | null => {
  try {
    return /^[a-f0-9]{64}$/i.test(signature)
      ? Buffer.from(signature, 'hex')
      : Buffer.from(signature, 'base64');
  } catch {
    return null;
  }
};

@Injectable()
export class HmacVerifierService {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  verifyLaunchQuery(rawQueryString: string): URLSearchParams {
    const params = new URLSearchParams(rawQueryString);
    const hmac = String(params.get('hmac') || '').trim().toLowerCase();
    if (!hmac) throw new UnauthorizedException('Missing hmac');

    const rawTimestamp = params.get('timestamp');
    const timestamp = Number(rawTimestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!rawTimestamp || !Number.isFinite(timestamp)) {
      throw new UnauthorizedException('Missing HMAC timestamp');
    }
    if (Math.abs(now - timestamp) > 300) {
      throw new UnauthorizedException('HMAC timestamp expired');
    }

    const valid = buildQueryMessageCandidates(rawQueryString).some((message) => {
      const computed = createHmac('sha256', this.env.SAPO_CLIENT_SECRET).update(message).digest('hex');
      return timingSafeHexEqual(computed, hmac);
    });
    if (!valid) throw new UnauthorizedException('Invalid hmac');
    return params;
  }

  verifyWebhookBody(rawBody: Buffer, signature: string | undefined): void {
    if (!rawBody?.length) throw new UnauthorizedException('Missing raw webhook body');
    if (!signature) throw new UnauthorizedException('Missing webhook HMAC');

    const received = parseWebhookSignature(signature.trim());
    if (!received) throw new UnauthorizedException('Invalid webhook HMAC');

    if (!this.env.SAPO_WEBHOOK_SECRET) throw new UnauthorizedException('Missing webhook HMAC secret');
    const computed = createHmac('sha256', this.env.SAPO_WEBHOOK_SECRET).update(rawBody).digest();
    const valid = received.length === computed.length && timingSafeEqual(received, computed);
    if (!valid) throw new UnauthorizedException('Invalid webhook HMAC');
  }
}
