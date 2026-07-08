import { Global, Module } from '@nestjs/common';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: RedisService,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): RedisService =>
        new RedisService({
          host: env.REDIS_HOST || undefined,
          port: env.REDIS_PORT,
          username: env.REDIS_USERNAME || undefined,
          password: env.REDIS_PASSWORD && !env.REDIS_PASSWORD.startsWith('replace-with') ? env.REDIS_PASSWORD : undefined,
          tls: env.REDIS_TLS,
          keyPrefix: env.REDIS_KEY_PREFIX,
        }),
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}
