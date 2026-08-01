import {
  Controller,
  Get,
  Options,
  Post,
  Param,
  Query,
  Body,
  Headers,
  HttpCode,
  Req,
  Res,
  BadRequestException,
  DefaultValuePipe,
  Inject,
  ParseIntPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QnaService } from './qna.service';
import { NumericIdPipe } from '../common/pipes/numeric-id.pipe';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';
import { IngressRateLimitService } from '../common/security/ingress-rate-limit.service';
import { clientFingerprint } from '../common/security/client-fingerprint';

const STORE_DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/**
 * Set CORS headers for public storefront requests.
 * The origin is validated against configured allowed origins in the Sapo guard,
 * but public endpoints need permissive CORS preflight for storefront domains.
 */
function setPublicCorsHeaders(req: Request, res: Response): void {
  const origin = req.headers.origin;
  if (origin && typeof origin === 'string') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, x-store-domain',
    );
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

@Controller('api/public/qna')
export class PublicQnaController {
  constructor(
    private readonly qnaService: QnaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly rateLimit: IngressRateLimitService,
  ) {}

  /** Rate-limit public question submissions per store + client. */
  private async assertPublicRate(req: Request, storeDomain: string): Promise<void> {
    await this.rateLimit.assertAllowed(
      'public-qna:submit',
      `${storeDomain}|${clientFingerprint(req)}`,
      this.env.PUBLIC_WRITE_RATE_LIMIT_WINDOW_SECONDS,
      this.env.PUBLIC_WRITE_RATE_LIMIT_MAX,
    );
  }

  /** Extract and validate the store domain from header or query. */
  private extractStoreDomain(header?: string, query?: string): string {
    const domain = (header || query || '').trim().toLowerCase();
    if (!domain) throw new BadRequestException('Missing store domain');
    if (!STORE_DOMAIN_RE.test(domain)) {
      throw new BadRequestException('Invalid store domain');
    }
    return domain;
  }

  // ── CORS preflight handlers ───────────────────────────────────────────

  @Options(':productId')
  @HttpCode(204)
  preflightQuestions(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    setPublicCorsHeaders(req, res);
  }

  // ── Public endpoints ──────────────────────────────────────────────────

  @Get(':productId')
  async getQuestions(
    @Param('productId', NumericIdPipe) productId: string,
    @Headers('x-store-domain') storeDomainHeader?: string,
    @Query('storeDomain') storeDomainQuery?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const storeDomain = this.extractStoreDomain(storeDomainHeader, storeDomainQuery);
    const result = await this.qnaService.getPublicQuestions(
      storeDomain,
      productId,
      { page, limit },
    );
    return { data: result };
  }

  @Post(':productId')
  async submitQuestion(
    @Param('productId', NumericIdPipe) productId: string,
    @Req() req: Request,
    @Body()
    body: {
      author: string;
      question: string;
      email?: string;
    },
    @Headers('x-store-domain') storeDomainHeader?: string,
    @Query('storeDomain') storeDomainQuery?: string,
  ) {
    const storeDomain = this.extractStoreDomain(storeDomainHeader, storeDomainQuery);
    await this.assertPublicRate(req, storeDomain);

    // Validate author
    if (
      !body.author ||
      typeof body.author !== 'string' ||
      !body.author.trim()
    ) {
      throw new BadRequestException('Author is required');
    }
    if (body.author.trim().length < 2) {
      throw new BadRequestException('Author must be at least 2 characters');
    }
    if (body.author.trim().length > 100) {
      throw new BadRequestException('Author must be at most 100 characters');
    }

    // Validate question
    if (
      !body.question ||
      typeof body.question !== 'string' ||
      !body.question.trim()
    ) {
      throw new BadRequestException('Question is required');
    }
    if (body.question.trim().length < 5) {
      throw new BadRequestException('Question must be at least 5 characters');
    }
    if (body.question.trim().length > 1000) {
      throw new BadRequestException('Question must be at most 1000 characters');
    }

    // Validate optional email
    const EMAIL_RE = /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
    const email = body.email?.trim();
    if (email && !EMAIL_RE.test(email)) {
      throw new BadRequestException('Email is invalid');
    }
    if (email && email.length > 200) {
      throw new BadRequestException('Email must be at most 200 characters');
    }

    // Install verification is handled by QnaService.resolveInstall
    const result = await this.qnaService.submitPublicQuestion(storeDomain, productId, {
      author: body.author.trim().slice(0, 100),
      question: body.question.trim().slice(0, 1000),
      email: email?.slice(0, 200),
    });

    return { data: result };
  }
}
