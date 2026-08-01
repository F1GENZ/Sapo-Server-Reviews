import { Module } from '@nestjs/common';
import { StorefrontAssetController } from './storefront-asset.controller';
import { StorefrontService } from './storefront.service';
import { SapoApiModule } from '../sapo/sapo-api.module';

@Module({
  imports: [SapoApiModule],
  controllers: [StorefrontAssetController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
