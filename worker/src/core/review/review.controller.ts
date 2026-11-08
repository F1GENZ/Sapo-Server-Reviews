import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  NotFoundException,
  BadRequestException,
  DefaultValuePipe,
  ParseIntPipe,
  ValidationPipe,
} from '@nestjs/common';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateSpamConfigDto } from './dto/update-spam-config.dto';
import { UpdateWidgetConfigDto } from './dto/update-widget-config.dto';
import { SyncMetafieldDto } from './dto/sync-metafield.dto';
import { NumericIdPipe } from '../common/pipes/numeric-id.pipe';
import { STORE_DOMAIN_RE, STRICT_EMAIL_RE } from '../common/security/public-limits';
import { ReviewBulkDto, ReviewImportDto } from './review-data-tools.dto';
import { ReviewDataToolsService } from './review-data-tools.service';

type AuthRequest = {
  token?: string;
  storeDomain?: string;
  query?: Record<string, string | undefined>;
};

function parseStar(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const star = Number(raw);
  if (!Number.isInteger(star) || star < 1 || star > 5) {
    throw new BadRequestException('star must be an integer 1-5');
  }
  return star;
}

function requireAuth(req: AuthRequest): asserts req is AuthRequest & { token: string; storeDomain: string } {
  if (!req.token || !req.storeDomain || !STORE_DOMAIN_RE.test(req.storeDomain)) {
    throw new BadRequestException('Missing or invalid auth');
  }
}

const VALID_REVIEW_STATUSES = ['approved', 'pending', 'hidden', 'spam'] as const;
const VALID_FORM_MODES = ['hidden', 'optional', 'required'] as const;
const HTTP_URL_OR_EMPTY_RE = /^(https?:\/\/[^\s"'()<>\\]+)?$/;

function validateWidgetConfigDto(dto: UpdateWidgetConfigDto): void {
  if (!dto || typeof dto !== 'object' || Array.isArray(dto)) {
    throw new BadRequestException('Invalid widget config payload');
  }
  if (dto.radius !== undefined && (typeof dto.radius !== 'number' || !Number.isFinite(dto.radius) || dto.radius < 0 || dto.radius > 99)) {
    throw new BadRequestException('radius must be between 0 and 99');
  }
  if (dto.starIconUrl !== undefined && (typeof dto.starIconUrl !== 'string' || dto.starIconUrl.length > 2000 || !HTTP_URL_OR_EMPTY_RE.test(dto.starIconUrl))) {
    throw new BadRequestException('starIconUrl must be an http(s) URL');
  }
  if (dto.titleText !== undefined && (typeof dto.titleText !== 'string' || dto.titleText.length > 200)) {
    throw new BadRequestException('titleText must be at most 200 characters');
  }
  if (dto.reviewItemsPerPage !== undefined && (!Number.isInteger(dto.reviewItemsPerPage) || dto.reviewItemsPerPage < 1 || dto.reviewItemsPerPage > 50)) {
    throw new BadRequestException('reviewItemsPerPage must be 1..50');
  }
  if (dto.qnaItemsPerPage !== undefined && (!Number.isInteger(dto.qnaItemsPerPage) || dto.qnaItemsPerPage < 1 || dto.qnaItemsPerPage > 50)) {
    throw new BadRequestException('qnaItemsPerPage must be 1..50');
  }
  if (dto.curatedSliderCount !== undefined && (!Number.isInteger(dto.curatedSliderCount) || dto.curatedSliderCount < 5 || dto.curatedSliderCount > 15)) {
    throw new BadRequestException('curatedSliderCount must be 5..15');
  }
  if (dto.reviewLayout !== undefined && !['list', 'grid', 'masonry'].includes(dto.reviewLayout)) {
    throw new BadRequestException('Invalid reviewLayout');
  }
  if (dto.reviewQnaDisplayMode !== undefined && !['tabs', 'stacked'].includes(dto.reviewQnaDisplayMode)) {
    throw new BadRequestException('Invalid reviewQnaDisplayMode');
  }
  for (const field of ['formEmailMode', 'formPhoneMode', 'formTitleMode', 'formContentMode'] as const) {
    const val = dto[field];
    if (val !== undefined && !(VALID_FORM_MODES as readonly string[]).includes(String(val))) {
      throw new BadRequestException(`Invalid ${field}`);
    }
  }
}

function validateCreateReviewDto(dto: CreateReviewDto): void {
  if (!dto || typeof dto !== 'object') throw new BadRequestException('Invalid review payload');
  if (typeof dto.rating !== 'number' || !Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5) {
    throw new BadRequestException('rating must be an integer 1-5');
  }
  if (typeof dto.author !== 'string' || !dto.author.trim() || dto.author.trim().length > 100) {
    throw new BadRequestException('author must be 1-100 characters');
  }
  if (dto.content !== undefined && (typeof dto.content !== 'string' || dto.content.length > 2000)) {
    throw new BadRequestException('content must be at most 2000 characters');
  }
  if (dto.title !== undefined && (typeof dto.title !== 'string' || dto.title.length > 100)) {
    throw new BadRequestException('title must be at most 100 characters');
  }
  if (dto.status !== undefined && !(VALID_REVIEW_STATUSES as readonly string[]).includes(String(dto.status))) {
    throw new BadRequestException('status must be approved, pending, hidden, or spam');
  }
  if (dto.email !== undefined && dto.email !== '' && (typeof dto.email !== 'string' || dto.email.length > 200 || !STRICT_EMAIL_RE.test(dto.email))) {
    throw new BadRequestException('Email is invalid');
  }
}

function validateUpdateReviewDto(dto: UpdateReviewDto): void {
  if (!dto || typeof dto !== 'object') throw new BadRequestException('Invalid review payload');
  if (dto.rating !== undefined && (typeof dto.rating !== 'number' || !Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5)) {
    throw new BadRequestException('rating must be an integer 1-5');
  }
  if (dto.author !== undefined && (typeof dto.author !== 'string' || !dto.author.trim() || dto.author.trim().length > 100)) {
    throw new BadRequestException('author must be 1-100 characters');
  }
  if (dto.content !== undefined && (typeof dto.content !== 'string' || dto.content.length > 2000)) {
    throw new BadRequestException('content must be at most 2000 characters');
  }
  if (dto.title !== undefined && (typeof dto.title !== 'string' || dto.title.length > 100)) {
    throw new BadRequestException('title must be at most 100 characters');
  }
  if (dto.status !== undefined && !(VALID_REVIEW_STATUSES as readonly string[]).includes(String(dto.status))) {
    throw new BadRequestException('status must be approved, pending, hidden, or spam');
  }
  if (dto.email !== undefined && dto.email !== '' && (typeof dto.email !== 'string' || dto.email.length > 200 || !STRICT_EMAIL_RE.test(dto.email))) {
    throw new BadRequestException('Email is invalid');
  }
}

function validateUpdateStatusDto(dto: UpdateStatusDto): void {
  if (!dto || typeof dto !== 'object' || !(VALID_REVIEW_STATUSES as readonly string[]).includes(String(dto.status))) {
    throw new BadRequestException('status must be approved, pending, hidden, or spam');
  }
}

@Controller('api/admin/reviews')
@UseGuards(ShopAuthGuard)
export class ReviewController {
  constructor(
    private readonly reviewService: ReviewService,
    private readonly dataTools: ReviewDataToolsService,
  ) {}

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
    validateWidgetConfigDto(dto);
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

  @Post('sync-metafield')
  async syncMetafield(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    body: SyncMetafieldDto,
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

  @Get('export')
  async exportReviews(
    @Query('format') format: string | undefined,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const normalized = format === 'json' ? 'json' : 'csv';
    return { data: await this.dataTools.exportReviews(req.storeDomain, normalized) };
  }

  @Get('import/history')
  async importHistory(@Req() req: AuthRequest) {
    requireAuth(req);
    return { data: await this.dataTools.listImportRuns(req.storeDomain, 'reviews') };
  }

  @Post('import/dry-run')
  async importDryRun(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: ReviewImportDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    return { data: await this.dataTools.importReviews(req.token, req.storeDomain, { ...dto, dryRun: true }) };
  }

  @Post('import')
  async importReviews(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: ReviewImportDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    return {
      data: await this.dataTools.importReviews(req.token, req.storeDomain, {
        format: dto.format,
        body: dto.body,
        dryRun: dto.dryRun === true,
      }),
    };
  }

  @Post('bulk')
  async bulkReviews(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: ReviewBulkDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    return { data: await this.dataTools.bulkReviews(req.token, req.storeDomain, dto.action, dto.items) };
  }

  @Get('widget-config/revisions')
  async widgetConfigRevisions(@Req() req: AuthRequest) {
    requireAuth(req);
    return { data: await this.reviewService.listWidgetConfigRevisions(req.storeDomain) };
  }

  @Post('widget-config/revisions/:revisionId/restore')
  async restoreWidgetConfigRevision(
    @Param('revisionId') revisionId: string,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    return {
      data: await this.reviewService.restoreWidgetConfigRevision(req.token, req.storeDomain, revisionId),
    };
  }

  @Get()
  async listAllReviews(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status: string | undefined,
    @Query('sort') sort: string | undefined,
    @Query('productId') productId: string | undefined,
    @Query('search') search: string | undefined,
    @Query('star') star: string | undefined,
    @Req() req: AuthRequest & { query?: Record<string, string> },
  ) {
    requireAuth(req);
    const rawLimit = req.query?.limit ?? req.query?.pageSize ?? req.query?.size;
    const parsedLimit = rawLimit !== undefined && rawLimit !== '' ? Number.parseInt(String(rawLimit), 10) : NaN;
    const effectiveLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : limit;
    const effectiveSort = sort ?? req.query?.sortBy;
    const reviews = await this.reviewService.listAllReviews(req.token, req.storeDomain, {
      page,
      limit: effectiveLimit,
      status,
      sort: effectiveSort,
      productId,
      search,
      star: parseStar(star),
    });
    return { data: reviews };
  }

  @Get(':productId')
  async getReviews(
    @Param('productId', NumericIdPipe) productId: string,
    @Query('star') star: string | undefined,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const reviews = await this.reviewService.getReviews(
      req.token,
      req.storeDomain,
      productId,
      parseStar(star),
    );
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
    validateCreateReviewDto(dto);
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
    validateUpdateReviewDto(dto);
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
    validateUpdateStatusDto(dto);
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
    @Body() body?: { pinned?: unknown },
  ) {
    requireAuth(req);
    const pinned = typeof body?.pinned === 'boolean' ? body.pinned : undefined;
    const review = await this.reviewService.pinReview(
      req.token,
      req.storeDomain,
      productId,
      reviewId,
      pinned,
    );
    if (!review) throw new NotFoundException('Review not found');
    return { data: review };
  }

  @Delete(':productId/:reviewId')
  async deleteReview(
    @Param('productId', NumericIdPipe) productId: string,
    @Param('reviewId') reviewId: string,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const result = await this.reviewService.deleteReview(
      req.token,
      req.storeDomain,
      productId,
      reviewId,
    );
    if (!result.deleted) throw new NotFoundException('Review not found');
    return {
      data: {
        deleted: true,
        ...(result.summarySyncFailed ? { summarySyncFailed: true } : {}),
      },
    };
  }
}
