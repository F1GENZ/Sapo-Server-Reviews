import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  NotFoundException,
  BadRequestException,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateSpamConfigDto } from './dto/update-spam-config.dto';
import { UpdateWidgetConfigDto } from './dto/update-widget-config.dto';
import { ValidationPipe } from '@nestjs/common';
import { NumericIdPipe } from '../common/pipes/numeric-id.pipe';

type AuthRequest = {
  token?: string;
  storeDomain?: string;
};

/** Validate storeDomain helper — uses regex match to ensure a valid domain. */
const STORE_DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/** Ensure the request has valid auth (token + storeDomain). */
function requireAuth(req: AuthRequest): asserts req is Required<AuthRequest> & { storeDomain: string } {
  if (!req.token || !req.storeDomain || !STORE_DOMAIN_RE.test(req.storeDomain)) {
    throw new BadRequestException('Missing or invalid auth');
  }
}

@Controller('admin/reviews')
@UseGuards(ShopAuthGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  // ── Config routes (static, before :productId param) ──────────────────

  @Get('widget-config')
  async getWidgetConfig(@Req() req: AuthRequest) {
    requireAuth(req);
    const config = await this.reviewService.getWidgetConfig(req.token, req.storeDomain);
    return { data: config };
  }

  @Put('widget-config')
  async updateWidgetConfig(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateWidgetConfigDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const config = await this.reviewService.updateWidgetConfig(req.token, dto, req.storeDomain);
    return { data: config };
  }

  @Get('spam-config')
  async getSpamConfig(@Req() req: AuthRequest) {
    requireAuth(req);
    const config = await this.reviewService.getSpamConfig(req.token, req.storeDomain);
    return { data: config };
  }

  @Put('spam-config')
  async updateSpamConfig(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateSpamConfigDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const config = await this.reviewService.updateSpamConfig(req.token, dto, req.storeDomain);
    return { data: config };
  }

  // ── Sync metafield ────────────────────────────────────────────────────

  @Post('sync-metafield')
  async syncMetafield(
    @Body() body: { productId?: string },
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const result = await this.reviewService.syncPublicSummaryMetafield(
      req.token,
      req.storeDomain,
      body.productId,
    );
    return { data: result };
  }

  // ── Cross-product list ────────────────────────────────────────────────

  @Get()
  async listAllReviews(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status: string | undefined,
    @Query('sort') sort: string | undefined,
    @Query('productId') productId: string | undefined,
    @Query('search') search: string | undefined,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const reviews = await this.reviewService.listAllReviews(req.token, req.storeDomain, {
      page,
      limit,
      status: status as string | undefined,
      sort: sort as string | undefined,
      productId,
      search,
    });
    return { data: reviews };
  }

  // ── Product-scoped routes ─────────────────────────────────────────────

  @Get(':productId')
  async getReviews(
    @Param('productId', NumericIdPipe) productId: string,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const reviews = await this.reviewService.getReviews(req.token, req.storeDomain, productId);
    return { data: reviews };
  }

  @Get(':productId/stats')
  async getStats(
    @Param('productId', NumericIdPipe) productId: string,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const stats = await this.reviewService.getProductStats(req.token, req.storeDomain, productId);
    return { data: stats };
  }

  @Post(':productId')
  async createReview(
    @Param('productId', NumericIdPipe) productId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CreateReviewDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const review = await this.reviewService.addReview(req.token, req.storeDomain, productId, dto);
    return { data: review };
  }

  @Patch(':productId/:reviewId')
  async updateReview(
    @Param('productId', NumericIdPipe) productId: string,
    @Param('reviewId') reviewId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateReviewDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const review = await this.reviewService.editReview(
      req.token,
      req.storeDomain,
      productId,
      reviewId,
      dto,
    );
    if (!review) throw new NotFoundException('Review not found');
    return { data: review };
  }

  @Patch(':productId/:reviewId/status')
  async updateStatus(
    @Param('productId', NumericIdPipe) productId: string,
    @Param('reviewId') reviewId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateStatusDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const review = await this.reviewService.updateReviewStatus(
      req.token,
      req.storeDomain,
      productId,
      reviewId,
      dto.status,
    );
    if (!review) throw new NotFoundException('Review not found');
    return { data: review };
  }

  @Patch(':productId/:reviewId/reply')
  async replyToReview(
    @Param('productId', NumericIdPipe) productId: string,
    @Param('reviewId') reviewId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: ReplyReviewDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const review = await this.reviewService.replyToReview(
      req.token,
      req.storeDomain,
      productId,
      reviewId,
      dto.reply,
    );
    if (!review) throw new NotFoundException('Review not found');
    return { data: review };
  }

  @Patch(':productId/:reviewId/pin')
  async pinReview(
    @Param('productId', NumericIdPipe) productId: string,
    @Param('reviewId') reviewId: string,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const review = await this.reviewService.pinReview(
      req.token,
      req.storeDomain,
      productId,
      reviewId,
    );
    if (!review) throw new NotFoundException('Review not found');
    return { data: review };
  }
}
