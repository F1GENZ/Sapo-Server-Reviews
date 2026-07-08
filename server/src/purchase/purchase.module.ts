import { Module } from '@nestjs/common';
import { PurchaseStoreService } from './purchase-store.service';

@Module({
  providers: [PurchaseStoreService],
  exports: [PurchaseStoreService],
})
export class PurchaseModule {}
