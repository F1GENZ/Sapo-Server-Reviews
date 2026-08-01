import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { DatabaseModule } from '../database/database.module';
import { PurchaseModule } from '../purchase/purchase.module';
import { RedisModule } from '../redis/redis.module';
import { SapoApiModule } from '../sapo/sapo-api.module';
import { ReviewController } from './review.controller';
import { PublicReviewController } from './public-review.controller';
import { ReviewProductStoreService } from './review-product-store.service';
import { ReviewService } from './review.service';

/**
 * Review module.
 *
 * Provides the core review CRUD + moderation service plus the Prisma-based
 * review product store. Exports both so controllers and other modules can
 * consume them.
 */
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    SapoApiModule,
    CatalogModule,
    PurchaseModule,
  ],
  controllers: [ReviewController, PublicReviewController],
  providers: [ReviewProductStoreService, ReviewService],
  exports: [ReviewProductStoreService, ReviewService],
})
export class ReviewModule {}
