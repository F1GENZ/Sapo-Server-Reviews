import { Global, Module } from '@nestjs/common';
import { IngressRateLimitService } from './ingress-rate-limit.service';

@Global()
@Module({
  providers: [IngressRateLimitService],
  exports: [IngressRateLimitService],
})
export class SecurityModule {}
