import { BadRequestException, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';
import { ThemeInstallService } from './theme-install.service';

type StoreRequest = { storeDomain?: string; body?: unknown };

const THEME_ID_RE = /^\d{1,20}$/;
const PLAN_HASH_RE = /^[a-f0-9]{64}$/;

const callerStore = (req: StoreRequest): string => {
  if (!req.storeDomain) throw new UnauthorizedException('Missing store session');
  return req.storeDomain;
};

const bodyField = (req: StoreRequest, name: string): string => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const value = body[name];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
};

const themeIdOf = (req: StoreRequest): string => {
  const themeId = bodyField(req, 'themeId');
  if (!THEME_ID_RE.test(themeId)) throw new BadRequestException({ code: 'invalid_theme_id', message: 'themeId không hợp lệ' });
  return themeId;
};

@Controller('/api/admin/theme-install')
@UseGuards(ShopAuthGuard)
export class ThemeInstallController {
  constructor(private readonly themeInstall: ThemeInstallService) {}

  @Get('/themes')
  async themes(@Req() req: StoreRequest) {
    return { data: await this.themeInstall.listThemes(callerStore(req)) };
  }

  @Post('/plan')
  async plan(@Req() req: StoreRequest) {
    return { data: await this.themeInstall.plan(callerStore(req), themeIdOf(req)) };
  }

  @Post('/apply')
  async apply(@Req() req: StoreRequest) {
    const planHash = bodyField(req, 'planHash');
    if (!PLAN_HASH_RE.test(planHash)) throw new BadRequestException({ code: 'invalid_plan_hash', message: 'planHash không hợp lệ' });
    return { data: await this.themeInstall.apply(callerStore(req), themeIdOf(req), planHash) };
  }

  @Post('/uninstall')
  async uninstall(@Req() req: StoreRequest) {
    return { data: await this.themeInstall.uninstall(callerStore(req), themeIdOf(req)) };
  }
}
