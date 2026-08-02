import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { QnaStoreService } from './qna-store.service';
import type { QnaQuestionRecord, QnaPageOptions } from './qna-store.service';
import type { Question, QnaSummary } from './interfaces/qna.interface';
import type { CreateQuestionDto } from './dto/create-question.dto';
import type { UpdateQuestionDto } from './dto/update-question.dto';
import type { AnswerQuestionDto } from './dto/answer-question.dto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuestionListItem = Question & {
  productId: string;
  productTitle?: string;
  productName?: string;
  productHandle?: string;
  productImage?: string;
};

export type QnaPageStatus = 'all' | 'pending' | 'hidden' | 'answered' | 'unanswered';
export type QnaPageSort = 'newest' | 'oldest';

export type QnaPage = {
  items: QuestionListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: Record<QnaPageStatus, number>;
};

export type ListAllQuestionsOptions = {
  page?: number;
  limit?: number;
  status?: string;
  sort?: string;
  productId?: string;
  search?: string;
};

export type PublicQuestionsOptions = {
  page?: number;
  limit?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateId = (): string => randomUUID();

const EMPTY_STATUS_COUNTS = (): Record<QnaPageStatus, number> => ({
  all: 0,
  pending: 0,
  hidden: 0,
  answered: 0,
  unanswered: 0,
});

const isQnaPageStatus = (value: unknown): value is QnaPageStatus =>
  ['all', 'pending', 'hidden', 'answered', 'unanswered'].includes(String(value));

/** Convert a Prisma row to domain Question */
const toDomainQuestion = (row: QnaQuestionRecord): Question => ({
  id: row.questionId,
  question: row.question || '',
  author: row.author || '',
  email: row.email || undefined,
  phone: row.phone || undefined,
  answer: row.answer || undefined,
  answered_by: row.answeredBy || undefined,
  status: row.status as Question['status'],
  created_at: Number(row.createdAt),
  updated_at: Number(row.updatedAt),
  answered_at: row.answeredAt ? Number(row.answeredAt) : undefined,
  source_raw_json: row.sourceRawJson || undefined,
});

/** Convert a Prisma row to a public Question shape with no contact PII (email/phone). */
export const toPublicQuestion = (row: QnaQuestionRecord): Question => {
  const question = toDomainQuestion(row);
  delete question.email;
  delete question.phone;
  return question;
};

/** Convert a Prisma row to QuestionListItem (includes product metadata) */
const toQuestionListItem = (row: QnaQuestionRecord): QuestionListItem => ({
  ...toDomainQuestion(row),
  productId: row.productId,
  productTitle: row.productTitle || undefined,
  productName: row.productName || undefined,
  productHandle: row.productHandle || undefined,
  productImage: row.productImage || undefined,
});

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class QnaService {
  private readonly logger = new Logger(QnaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qnaStore: QnaStoreService,
  ) {}

  // ─── Install Resolution ──────────────────────────────────────────

  private async resolveInstall(storeDomain: string): Promise<{ shopId: string }> {
    const install = await this.prisma.appInstall.findUnique({
      where: { storeDomain },
      select: { shopId: true },
    });
    if (!install) {
      throw new ConflictException('App not installed for this store');
    }
    return install;
  }

  // ─── submitQuestion (called by admin + public controllers) ───────

  async submitQuestion(
    storeDomain: string,
    productId: string,
    dto: CreateQuestionDto,
  ): Promise<Question> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const now = Date.now();
    const questionId = generateId();

    await this.qnaStore.upsertQuestion({
      shopId,
      productId,
      questionId,
      question: dto.question,
      author: dto.author,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      status: 'pending',
      createdAt: now,
    });

    return {
      id: questionId,
      question: dto.question,
      author: dto.author,
      email: dto.email,
      phone: dto.phone,
      status: 'pending',
      created_at: now,
      updated_at: now,
    };
  }

  // ─── answerQuestion ──────────────────────────────────────────────

  async answerQuestion(
    storeDomain: string,
    productId: string,
    questionId: string,
    dto: AnswerQuestionDto,
  ): Promise<Question | null> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const existing = await this.qnaStore.getQuestion(shopId, productId, questionId);
    if (!existing) return null;

    const now = Date.now();
    const record = await this.qnaStore.updateAnswer(
      shopId,
      productId,
      questionId,
      dto.answer,
      dto.answered_by || 'Shop',
    );

    return toDomainQuestion(record);
  }

  // ─── updateStatus ────────────────────────────────────────────────

  async updateStatus(
    storeDomain: string,
    productId: string,
    questionId: string,
    status: 'pending' | 'approved' | 'hidden',
  ): Promise<Question | null> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const existing = await this.qnaStore.getQuestion(shopId, productId, questionId);
    if (!existing) return null;

    const record = await this.qnaStore.updateStatus(shopId, productId, questionId, status);
    return toDomainQuestion(record);
  }

  // ─── updateQuestion ──────────────────────────────────────────────

  async updateQuestion(
    storeDomain: string,
    productId: string,
    questionId: string,
    dto: UpdateQuestionDto,
  ): Promise<Question | null> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const existing = await this.qnaStore.getQuestion(shopId, productId, questionId);
    if (!existing) return null;

    const record = await this.qnaStore.upsertQuestion({
      shopId,
      productId,
      questionId,
      question: dto.question !== undefined ? dto.question : existing.question,
      author: dto.author !== undefined ? dto.author : existing.author,
      email: existing.email,
      phone: existing.phone,
      answer: dto.answer !== undefined ? dto.answer : existing.answer,
      answeredBy: existing.answeredBy,
      status: existing.status,
      answeredAt: existing.answeredAt ? Number(existing.answeredAt) : null,
      sourceRawJson: existing.sourceRawJson,
    });

    return toDomainQuestion(record);
  }

  // ─── deleteQuestion (admin) ──────────────────────────────────────

  async deleteQuestion(
    storeDomain: string,
    productId: string,
    questionId: string,
  ): Promise<boolean> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;
    const existing = await this.qnaStore.getQuestion(shopId, productId, questionId);
    if (!existing) return false;
    return this.qnaStore.deleteQuestion(shopId, productId, questionId);
  }

  // ─── getQuestions (admin single product, paginated) ──────────────

  async getQuestions(
    storeDomain: string,
    productId: string,
    options: QnaPageOptions = {},
  ): Promise<{ items: Question[]; total: number; page: number; pageSize: number }> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const result = await this.qnaStore.getQuestions(shopId, productId, options);
    return {
      items: result.items.map((row) => toDomainQuestion(row)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  // ─── getAllQuestions (admin cross-product listing) ───────────────

  async getAllQuestions(
    storeDomain: string,
    options: ListAllQuestionsOptions = {},
  ): Promise<QnaPage> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.limit ?? 20));
    const status: QnaPageStatus = isQnaPageStatus(options.status)
      ? options.status
      : 'all';
    const sortBy: QnaPageSort = options.sort === 'oldest' ? 'oldest' : 'newest';

    // Build Prisma where
    const where: Record<string, unknown> = { shopId };

    if (status === 'answered') {
      where.answer = { not: null };
      where.NOT = { answer: '' };
    } else if (status === 'unanswered') {
      where.OR = [{ answer: null }, { answer: '' }];
    } else if (status !== 'all') {
      where.status = status;
    }

    if (options.productId) {
      where.productId = options.productId;
    }

    if (options.search) {
      const searchConditions = [
        { question: { contains: options.search, mode: 'insensitive' } },
        { author: { contains: options.search, mode: 'insensitive' } },
      ];
      // If status already set an OR (unanswered), combine via AND
      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          { OR: searchConditions },
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    // Get status counts for the whole shop
    const allRows = await this.prisma.qnaQuestion.findMany({
      where: { shopId },
      select: { status: true, answer: true },
    });

    const statusCounts = EMPTY_STATUS_COUNTS();
    for (const row of allRows) {
      statusCounts.all += 1;
      const s = row.status;
      if (s === 'pending') statusCounts.pending += 1;
      else if (s === 'hidden') statusCounts.hidden += 1;
      if (row.answer && row.answer !== '') statusCounts.answered += 1;
      else statusCounts.unanswered += 1;
    }

    const orderBy = { createdAt: sortBy === 'oldest' ? ('asc' as const) : ('desc' as const) };

    const total = await this.prisma.qnaQuestion.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const skip = (currentPage - 1) * pageSize;

    const rows = await this.prisma.qnaQuestion.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
    });

    return {
      items: rows.map((row: QnaQuestionRecord) => toQuestionListItem(row)),
      total,
      page: currentPage,
      pageSize,
      totalPages,
      statusCounts,
    };
  }

  // ─── getStats (admin) ────────────────────────────────────────────

  async getStats(
    storeDomain: string,
    productId: string,
  ): Promise<QnaSummary> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    return this.qnaStore.getStats(shopId, productId);
  }

  // ─── getPublicQuestions (storefront) ─────────────────────────────

  async getPublicQuestions(
    storeDomain: string,
    productId: string,
    options: PublicQuestionsOptions = {},
  ): Promise<{ items: Question[]; total: number; page: number; pageSize: number }> {
    const install = await this.resolveInstall(storeDomain);
    const shopId = install.shopId;

    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      shopId,
      productId,
      status: 'approved',
      answer: { not: null },
      NOT: { answer: '' },
    };

    const [items, total] = await Promise.all([
      this.prisma.qnaQuestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.qnaQuestion.count({ where }),
    ]);

    return {
      items: (items as QnaQuestionRecord[]).map((row) => toPublicQuestion(row)),
      total,
      page,
      pageSize,
    };
  }

  // ─── submitPublicQuestion ────────────────────────────────────────

  async submitPublicQuestion(
    storeDomain: string,
    productId: string,
    dto: CreateQuestionDto,
  ): Promise<Question> {
    return this.submitQuestion(storeDomain, productId, dto);
  }
}
