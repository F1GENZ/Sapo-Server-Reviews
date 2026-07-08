import { Module } from '@nestjs/common';
import { StorefrontAssetController } from './storefront-asset.controller';
import { StorefrontService } from './storefront.service';

@Module({
  controllers: [StorefrontAssetController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
