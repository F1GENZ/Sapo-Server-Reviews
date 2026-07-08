import { Module } from '@nestjs/common';
import { SapoApiService } from './sapo-api.service';

@Module({
  providers: [SapoApiService],
  exports: [SapoApiService],
})
export class SapoApiModule {}
