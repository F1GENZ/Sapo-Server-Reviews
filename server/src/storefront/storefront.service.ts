import { Injectable } from '@nestjs/common';
import { SapoApiService } from '../sapo/sapo-api.service';

@Injectable()
export class StorefrontService {
  constructor(private readonly sapoApi: SapoApiService) {}

  async writeStorefrontConfig(storeDomain: string, accessToken: string): Promise<void> {
    const config = { apiUrl: process.env.API_BASE_URL || '', storeDomain };
    const value = JSON.stringify(config);

    // Try to find existing metafield to update, otherwise create
    try {
      const existing = await this.sapoApi.getMetafields(storeDomain, accessToken, 'shop');
      const configMf = existing.find(m => m.namespace === 'f1genz' && m.key === 'config');
      if (configMf) {
        await this.sapoApi.updateMetafield(storeDomain, accessToken, String(configMf.id), { value, value_type: 'string' });
      } else {
        await this.sapoApi.createMetafield(storeDomain, accessToken, {
          namespace: 'f1genz', key: 'config', value, value_type: 'string', owner_resource: 'shop',
        });
      }
    } catch {
      // Create as fallback
      await this.sapoApi.createMetafield(storeDomain, accessToken, {
        namespace: 'f1genz', key: 'config', value, value_type: 'string', owner_resource: 'shop',
      });
    }
  }
}
