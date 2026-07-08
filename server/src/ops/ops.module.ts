import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';
import { DatabaseModule } from '../database/database.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ReviewModule } from '../review/review.module';
import { QnaModule } from '../qna/qna.module';
import { PurchaseModule } from '../purchase/purchase.module';

@Module({
  imports: [DatabaseModule, CatalogModule, ReviewModule, QnaModule, PurchaseModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
