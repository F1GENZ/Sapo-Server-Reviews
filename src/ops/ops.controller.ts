import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';
import { OpsService } from './ops.service';

@Controller('/api/admin/ops')
@UseGuards(ShopAuthGuard)
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('/health')
  async health(@Req() req: { storeDomain?: string }) {
    return { data: await this.ops.getHealth(req.storeDomain || '') };
  }

  @Post('/resync-config')
  async resyncConfig(@Req() req: { storeDomain?: string }) {
    return { data: await this.ops.resyncConfig(req.storeDomain || '') };
  }

  @Post('/resync-webhooks')
  async resyncWebhooks(@Req() req: { storeDomain?: string }) {
    return { data: await this.ops.resyncWebhooks(req.storeDomain || '') };
  }

  @Post('/backfill-catalog')
  async backfillCatalog(@Req() req: { storeDomain?: string }) {
    return { data: await this.ops.backfillCatalog(req.storeDomain || '') };
  }
}
