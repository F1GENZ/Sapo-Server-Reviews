import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';
import { OpsService } from './ops.service';

@Controller('/api/admin/ops')
@UseGuards(ShopAuthGuard)
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('/health')
  health(@Req() req: { storeDomain?: string }) {
    return this.ops.getHealth(req.storeDomain || '');
  }

  @Post('/resync-config')
  resyncConfig(@Req() req: { storeDomain?: string }) {
    return this.ops.resyncConfig(req.storeDomain || '');
  }

  @Post('/resync-webhooks')
  resyncWebhooks(@Req() req: { storeDomain?: string }) {
    return this.ops.resyncWebhooks(req.storeDomain || '');
  }

  @Post('/backfill-catalog')
  backfillCatalog(@Req() req: { storeDomain?: string }) {
    return this.ops.backfillCatalog(req.storeDomain || '');
  }
}
