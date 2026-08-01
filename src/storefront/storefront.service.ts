import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';
import { SapoApiService } from '../sapo/sapo-api.service';

@Injectable()
export class StorefrontService {
  constructor(
    private readonly sapoApi: SapoApiService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async writeStorefrontConfig(storeDomain: string, accessToken: string): Promise<void> {
    const config = { apiUrl: this.env.API_BASE_URL.replace(/\/+$/, ''), storeDomain };
    const value = JSON.stringify(config);

    // Try to find existing metafield to update, otherwise create.
    // Read failures are NOT "missing config" - surface them so transient errors
    // are visible instead of being masked by an unconditional create.
    const existing = await this.sapoApi.getMetafields(storeDomain, accessToken, 'shop');
    const configMf = existing.find((m) => m.namespace === 'f1genz' && m.key === 'config');
    if (configMf) {
      await this.sapoApi.updateMetafield(storeDomain, accessToken, String(configMf.id), { value, value_type: 'string' });
    } else {
      await this.sapoApi.createMetafield(storeDomain, accessToken, {
        namespace: 'f1genz', key: 'config', value, value_type: 'string', owner_resource: 'shop',
      });
    }
  }
}
