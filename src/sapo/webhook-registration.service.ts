import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';
import { SapoApiService } from './sapo-api.service';
import { WEBHOOK_SUBSCRIBE_TOPICS } from './webhook-topic-normalizer';

export type WebhookRegistrationResult = {
  status: 'not_configured' | 'registered' | 'degraded' | 'failed';
  error?: string;
};

@Injectable()
export class WebhookRegistrationService {
  constructor(
    private readonly sapoApi: SapoApiService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly prisma?: PrismaService,
  ) {}

  private webhookReceiverUrl(): string {
    return new URL('/api/oauth/install/webhooks', this.env.API_BASE_URL).toString();
  }

  async registerForInstall(storeDomain: string, accessToken: string): Promise<WebhookRegistrationResult> {
    const errors: string[] = [];

    for (const topic of WEBHOOK_SUBSCRIBE_TOPICS) {
      try {
        await this.sapoApi.createWebhook(storeDomain, accessToken, topic, `${process.env.API_BASE_URL}/api/oauth/install/webhooks`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Webhook registration failed';
        errors.push(`${topic}: ${message}`);
      }
    }

    if (errors.length === WEBHOOK_SUBSCRIBE_TOPICS.length) {
      await this.prisma?.appInstall.updateMany({
        where: { storeDomain },
        data: { webhookRegistrationStatus: 'failed', webhookRegistrationError: errors.join('; ') },
      });
      return { status: 'failed', error: errors.join('; ') };
    }

    if (errors.length > 0) {
      await this.prisma?.appInstall.updateMany({
        where: { storeDomain },
        data: { webhookRegistrationStatus: 'degraded', webhookRegistrationError: errors.join('; ') },
      });
      return { status: 'degraded', error: errors.join('; ') };
    }

    await this.prisma?.appInstall.updateMany({
      where: { storeDomain },
      data: { webhookRegistrationStatus: 'registered', webhookRegisteredAt: new Date(), webhookRegistrationError: null },
    });
    return { status: 'registered' };
  }
}
