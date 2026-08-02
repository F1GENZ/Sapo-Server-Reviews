import { Module } from '@nestjs/common';
import { CatalogProductStoreService } from './catalog-product-store.service';
import { CatalogSyncService } from './catalog-sync.service';
import { ProductsController } from './products.controller';
import { SapoApiModule } from '../sapo/sapo-api.module';

@Module({
  imports: [SapoApiModule],
  controllers: [ProductsController],
  providers: [CatalogProductStoreService, CatalogSyncService],
  exports: [CatalogProductStoreService, CatalogSyncService],
})
export class CatalogModule {}
