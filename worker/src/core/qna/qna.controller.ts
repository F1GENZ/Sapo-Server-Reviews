import {
  Controller,
  Get,
  Post,
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
} from '@nestjs/common';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';
import { QnaService } from './qna.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { AnswerQuestionDto, UpdateQuestionStatusDto } from './dto/answer-question.dto';
import { ValidationPipe } from '@nestjs/common';
import { NumericIdPipe } from '../common/pipes/numeric-id.pipe';
import { STORE_DOMAIN_RE, STRICT_EMAIL_RE } from '../common/security/public-limits';
import { QnaBulkDto, QnaImportDto } from './qna-data-tools.dto';
import { QnaDataToolsService } from './qna-data-tools.service';

type AuthRequest = {
  token?: string;
  storeDomain?: string;
  query?: Record<string, string | undefined>;
};

function requireAuth(req: AuthRequest): asserts req is AuthRequest & { token: string; storeDomain: string } {
  if (!req.token || !req.storeDomain || !STORE_DOMAIN_RE.test(req.storeDomain)) {
    throw new BadRequestException('Missing or invalid auth');
  }
}

const VALID_QNA_STATUSES = ['pending', 'approved', 'hidden'] as const;

function validateCreateQuestionDto(dto: CreateQuestionDto): void {
  if (!dto || typeof dto !== 'object') throw new BadRequestException('Invalid question payload');
  if (typeof dto.question !== 'string' || !dto.question.trim() || dto.question.trim().length > 1000) {
    throw new BadRequestException('question must be 1-1000 characters');
  }
  if (typeof dto.author !== 'string' || !dto.author.trim() || dto.author.trim().length > 100) {
    throw new BadRequestException('author must be 1-100 characters');
  }
  if (dto.email !== undefined && dto.email !== '' && (typeof dto.email !== 'string' || dto.email.length > 200 || !STRICT_EMAIL_RE.test(dto.email))) {
    throw new BadRequestException('Email is invalid');
  }
}

function validateUpdateQuestionDto(dto: UpdateQuestionDto): void {
  if (!dto || typeof dto !== 'object') throw new BadRequestException('Invalid question payload');
  if (dto.question !== undefined && (typeof dto.question !== 'string' || !dto.question.trim() || dto.question.trim().length > 1000)) {
    throw new BadRequestException('question must be 1-1000 characters');
  }
  if (dto.author !== undefined && (typeof dto.author !== 'string' || !dto.author.trim() || dto.author.trim().length > 100)) {
    throw new BadRequestException('author must be 1-100 characters');
  }
  if (dto.answer !== undefined && (typeof dto.answer !== 'string' || dto.answer.length > 2000)) {
    throw new BadRequestException('answer must be at most 2000 characters');
  }
}

function validateUpdateQuestionStatusDto(dto: UpdateQuestionStatusDto): void {
  if (!dto || typeof dto !== 'object' || !(VALID_QNA_STATUSES as readonly string[]).includes(String(dto.status))) {
    throw new BadRequestException('status must be pending, approved, or hidden');
  }
}

@Controller('api/admin/qna')
@UseGuards(ShopAuthGuard)
export class QnaController {
  constructor(
    private readonly qnaService: QnaService,
    private readonly dataTools: QnaDataToolsService,
  ) {}

  @Get('export')
  async exportQuestions(@Query('format') format: string | undefined, @Req() req: AuthRequest) {
    requireAuth(req);
    return { data: await this.dataTools.exportQuestions(req.storeDomain, format === 'json' ? 'json' : 'csv') };
  }

  @Get('import/history')
  async importHistory(@Req() req: AuthRequest) {
    requireAuth(req);
    return { data: await this.dataTools.listImportRuns(req.storeDomain) };
  }

  @Post('import/dry-run')
  async importDryRun(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: QnaImportDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    return { data: await this.dataTools.importQuestions(req.storeDomain, { ...dto, dryRun: true }) };
  }

  @Post('import')
  async importQuestions(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: QnaImportDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    return {
      data: await this.dataTools.importQuestions(req.storeDomain, {
        format: dto.format,
        body: dto.body,
        dryRun: dto.dryRun === true,
      }),
    };
  }

  @Post('bulk')
  async bulkQuestions(
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    dto: QnaBulkDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    return { data: await this.dataTools.bulkQuestions(req.storeDomain, dto.action, dto.items) };
  }

  @Get()
  async listAllQuestions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status: string | undefined,
    @Query('sort') sort: string | undefined,
    @Query('productId') productId: string | undefined,
    @Query('search') search: string | undefined,
    @Req() req: AuthRequest & { query?: Record<string, string> },
  ) {
    requireAuth(req);
    const rawLimit = req.query?.limit ?? req.query?.pageSize ?? req.query?.size;
    const parsedLimit = rawLimit !== undefined && rawLimit !== '' ? Number.parseInt(String(rawLimit), 10) : NaN;
    const effectiveLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : limit;
    const effectiveSort = sort ?? req.query?.sortBy;
    const result = await this.qnaService.getAllQuestions(req.storeDomain, {
      page,
      limit: effectiveLimit,
      status,
      sort: effectiveSort,
      productId,
      search,
    });
    return { data: result };
  }

  @Get(':productId')
  async getQuestions(
    @Param('productId', NumericIdPipe) productId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(20), ParseIntPipe) size: number,
    @Query('status') status: string | undefined,
    @Query('sort') sort: string | undefined,
    @Req() req: AuthRequest & { query?: Record<string, string> },
  ) {
    requireAuth(req);
    const rawLimit = req.query?.limit ?? req.query?.pageSize ?? req.query?.size;
    const parsedLimit = rawLimit !== undefined && rawLimit !== '' ? Number.parseInt(String(rawLimit), 10) : NaN;
    const effectiveLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : size;
    const effectiveSort = sort ?? req.query?.sortBy;
    const result = await this.qnaService.getQuestions(req.storeDomain, productId, {
      page,
      limit: effectiveLimit,
      status,
      sort: effectiveSort,
    });
    return { data: result };
  }

  @Get(':productId/stats')
  async getStats(
    @Param('productId', NumericIdPipe) productId: string,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const stats = await this.qnaService.getStats(req.storeDomain, productId);
    return { data: stats };
  }

  @Post(':productId')
  async createQuestion(
    @Param('productId', NumericIdPipe) productId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CreateQuestionDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    validateCreateQuestionDto(dto);
    const question = await this.qnaService.submitQuestion(req.storeDomain, productId, dto);
    return { data: question };
  }

  @Patch(':productId/:questionId')
  async updateQuestion(
    @Param('productId', NumericIdPipe) productId: string,
    @Param('questionId') questionId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateQuestionDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    validateUpdateQuestionDto(dto);
    const question = await this.qnaService.updateQuestion(
      req.storeDomain,
      productId,
      questionId,
      dto,
    );
    if (!question) throw new NotFoundException('Question not found');
    return { data: question };
  }

  @Patch(':productId/:questionId/status')
  async updateStatus(
    @Param('productId', NumericIdPipe) productId: string,
    @Param('questionId') questionId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateQuestionStatusDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    validateUpdateQuestionStatusDto(dto);
    const question = await this.qnaService.updateStatus(
      req.storeDomain,
      productId,
      questionId,
      dto.status,
    );
    if (!question) throw new NotFoundException('Question not found');
    return { data: question };
  }

  @Patch(':productId/:questionId/answer')
  async answerQuestion(
    @Param('productId', NumericIdPipe) productId: string,
    @Param('questionId') questionId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: AnswerQuestionDto,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const question = await this.qnaService.answerQuestion(
      req.storeDomain,
      productId,
      questionId,
      dto,
    );
    if (!question) throw new NotFoundException('Question not found');
    return { data: question };
  }

  @Delete(':productId/:questionId')
  async deleteQuestion(
    @Param('productId', NumericIdPipe) productId: string,
    @Param('questionId') questionId: string,
    @Req() req: AuthRequest,
  ) {
    requireAuth(req);
    const deleted = await this.qnaService.deleteQuestion(
      req.storeDomain,
      productId,
      questionId,
    );
    if (!deleted) throw new NotFoundException('Question not found');
    return { data: { deleted: true } };
  }
}
