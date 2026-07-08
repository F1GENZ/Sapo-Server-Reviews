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
  ParseIntPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ReviewService } from './review.service';
import { NumericIdPipe } from '../common/pipes/numeric-id.pipe';
import { SapoService } from '../sapo/sapo.service';

const STORE_DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

const EMPTY_SUMMARY = {
  avg: 0,
  count: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

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

@Controller('public/reviews')
export class PublicReviewController {
  constructor(
    private readonly reviewService: ReviewService,
    private readonly sapoService: SapoService,
  ) {}

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
  preflightReviews(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    setPublicCorsHeaders(req, res);
  }

  @Options(':productId/summary')
  @HttpCode(204)
  preflightSummary(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    setPublicCorsHeaders(req, res);
  }

  // ── Public endpoints ──────────────────────────────────────────────────

  @Get(':productId')
  async getReviews(
    @Param('productId', NumericIdPipe) productId: string,
    @Headers('x-store-domain') storeDomainHeader?: string,
    @Query('storeDomain') storeDomainQuery?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('sort') sort?: string,
  ) {
    const storeDomain = this.extractStoreDomain(storeDomainHeader, storeDomainQuery);
    const reviews = await this.reviewService.getPublicReviews(
      storeDomain,
      productId,
      { page, limit, sort },
    );
    return { data: reviews };
  }

  @Get(':productId/summary')
  async getSummary(
    @Param('productId', NumericIdPipe) productId: string,
    @Headers('x-store-domain') storeDomainHeader?: string,
    @Query('storeDomain') storeDomainQuery?: string,
  ) {
    const storeDomain = this.extractStoreDomain(storeDomainHeader, storeDomainQuery);
    const summary = await this.reviewService.getPublicSummary(storeDomain, productId);
    return { data: summary ?? EMPTY_SUMMARY };
  }

  @Post(':productId')
  async submitReview(
    @Param('productId', NumericIdPipe) productId: string,
    @Body()
    body: {
      rating: number;
      content?: string;
      author: string;
      title?: string;
      email?: string;
      phone?: string;
      media?: { url: string; type: 'image' | 'video' }[];
    },
    @Headers('x-store-domain') storeDomainHeader?: string,
    @Query('storeDomain') storeDomainQuery?: string,
  ) {
    const storeDomain = this.extractStoreDomain(storeDomainHeader, storeDomainQuery);
    const token = await this.sapoService.resolveAccessToken(storeDomain);

    // Basic validation
    if (
      !body.rating ||
      body.rating < 1 ||
      body.rating > 5 ||
      !Number.isInteger(body.rating)
    ) {
      throw new BadRequestException('Rating must be an integer 1-5');
    }
    if (
      !body.author ||
      typeof body.author !== 'string' ||
      body.author.trim().length === 0
    ) {
      throw new BadRequestException('Author is required');
    }
    if (body.author.trim().length > 100) {
      throw new BadRequestException('Author must be at most 100 characters');
    }
    if (body.content && typeof body.content !== 'string') {
      throw new BadRequestException('Content must be a string');
    }
    if (body.content && body.content.length > 2000) {
      throw new BadRequestException('Content must be at most 2000 characters');
    }
    if (body.title && typeof body.title !== 'string') {
      throw new BadRequestException('Title must be a string');
    }
    if (body.title && body.title.length > 100) {
      throw new BadRequestException('Title must be at most 100 characters');
    }

    // Validate and sanitize media
    const URL_RE = /^https:\/\//i;
    const safeMedia = (Array.isArray(body.media) ? body.media : [])
      .slice(0, 5)
      .filter(
        (m): m is { url: string; type: 'image' | 'video' } =>
          !!m &&
          typeof m.url === 'string' &&
          URL_RE.test(m.url) &&
          m.url.length <= 2000 &&
          (m.type === 'image' || m.type === 'video'),
      );

    const review = await this.reviewService.addReview(token, storeDomain, productId, {
      rating: body.rating,
      content: typeof body.content === 'string' ? body.content.trim().slice(0, 2000) : '',
      author: body.author.trim().slice(0, 100),
      title:
        typeof body.title === 'string' && body.title.trim()
          ? body.title.trim().slice(0, 100)
          : undefined,
      email:
        typeof body.email === 'string' && body.email.trim()
          ? body.email.trim().slice(0, 200)
          : undefined,
      phone:
        typeof body.phone === 'string' && body.phone.trim()
          ? body.phone.trim().slice(0, 20)
          : undefined,
      media: safeMedia,
    });

    return { data: review };
  }
}
