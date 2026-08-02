import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';
import { DashboardService } from './dashboard.service';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';

@Controller('/api/admin/dashboard')
@UseGuards(ShopAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Get('/overview')
  async overview(@Req() req: { storeDomain?: string }) {
    return { data: await this.dashboard.getOverview(req.storeDomain || '') };
  }
}
