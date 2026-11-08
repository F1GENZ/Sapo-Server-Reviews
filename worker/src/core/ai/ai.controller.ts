import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';
import { STORE_DOMAIN_RE } from '../common/security/public-limits';
import { ReplySuggestionDto } from './ai.dto';
import { AiService, WORKERS_AI_FALLBACK_MODEL } from './ai.service';

type AuthRequest = { storeDomain?: string };

function requireStore(req: AuthRequest): string {
  if (!req.storeDomain || !STORE_DOMAIN_RE.test(req.storeDomain)) {
    throw new BadRequestException('Missing or invalid auth');
  }
  return req.storeDomain;
}

@Controller('api/admin/ai')
@UseGuards(ShopAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  status() {
    const workersAi = this.ai.workersAiAvailable;
    const configured = workersAi;
    return {
      configured,
      workersAi,
      provider: 'workers-ai',
      model: this.ai.model,
      fallbackModel: WORKERS_AI_FALLBACK_MODEL,
      data: {
        configured,
        workersAi,
        provider: 'workers-ai',
        model: this.ai.model,
        fallbackModel: WORKERS_AI_FALLBACK_MODEL,
      },
    };
  }

  @Post('reply-suggestion')
  async replySuggestion(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: ReplySuggestionDto,
    @Req() req: AuthRequest,
  ) {
    return { data: await this.ai.suggestReply(requireStore(req), dto) };
  }
}
