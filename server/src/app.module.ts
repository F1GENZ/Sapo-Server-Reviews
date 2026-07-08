import { Module } from '@nestjs/common';
import { APP_ENV, AppConfigModule } from './config/app-config.module';
import type { AppEnv } from './config/env.schema';
import { CatalogModule } from './catalog/catalog.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { MediaModule } from './media/media.module';
import { OpsModule } from './ops/ops.module';
import { PurchaseModule } from './purchase/purchase.module';
import { QnaModule } from './qna/qna.module';
import { RedisModule } from './redis/redis.module';
import { ReviewModule } from './review/review.module';
import { StorefrontModule } from './storefront/storefront.module';
import { IngressRateLimitService } from './common/security/ingress-rate-limit.service';
import { ShopAuthGuard } from './common/guards/shop-auth.guard';
import { SapoController } from './sapo/sapo.controller';
import { SapoService } from './sapo/sapo.service';
import { SapoApiModule } from './sapo/sapo-api.module';
import { HmacVerifierService } from './sapo/hmac-verifier.service';
import { LifecycleLockService } from './sapo/lifecycle-lock.service';
import { OAuthStateService } from './sapo/oauth-state.service';
import { SessionService } from './sapo/session.service';
import { ShopDomainService } from './sapo/shop-domain.service';
import { SubscriptionService } from './sapo/subscription.service';
import { TokenEncryptionService } from './sapo/token-encryption.service';
import { UninstallService } from './sapo/uninstall.service';
import { WebhookRegistrationService } from './sapo/webhook-registration.service';
import { WebhookService } from './sapo/webhook.service';
import { RedisService } from './redis/redis.service';

@Module({
  imports: [
    AppConfigModule, RedisModule, DatabaseModule, SapoApiModule,
    CatalogModule, PurchaseModule, ReviewModule, QnaModule,
    DashboardModule, OpsModule, MediaModule, StorefrontModule,
  ],
  controllers: [SapoController, HealthController],
  providers: [
    {
      provide: IngressRateLimitService,
      inject: [RedisService],
      useFactory: (redis: RedisService) => new IngressRateLimitService(redis),
    },
    ShopAuthGuard,
    SapoService,
    HmacVerifierService,
    LifecycleLockService,
    OAuthStateService,
    SessionService,
    ShopDomainService,
    SubscriptionService,
    TokenEncryptionService,
    UninstallService,
    WebhookRegistrationService,
    WebhookService,
  ],
})
export class AppModule {}
