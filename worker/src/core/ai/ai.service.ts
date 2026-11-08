import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';
import { IngressRateLimitService } from '../common/security/ingress-rate-limit.service';

export const AI_REPLY_RATE_WINDOW_SECONDS = 3600;
export const AI_REPLY_RATE_MAX = 30;
export const AI_TIMEOUT_MS = 15_000;
export const WORKERS_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
export const WORKERS_AI_FALLBACK_MODEL = WORKERS_AI_MODEL;
export const WORKERS_AI_BINDING = 'WORKERS_AI_BINDING';
const MAX_SUGGESTION_LENGTH = 600;

export type WorkersAiBinding = {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
};

export type ReplySuggestionInput = {
  content: string;
  rating: number;
  author?: string;
  storeName?: string;
  provider?: string;
};

const stripMarkup = (value: string): string =>
  value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildPrompt = (input: ReplySuggestionInput): string =>
  [
    'Bạn là nhân viên chăm sóc khách hàng của một cửa hàng trực tuyến tại Việt Nam.',
    'Viết một câu trả lời ngắn cho đánh giá sản phẩm dưới đây.',
    'Yêu cầu: tiếng Việt có dấu, lịch sự, cảm ơn khách, 1-3 câu, tối đa 300 ký tự,',
    'không bịa thông tin khuyến mãi, không chèn link, không chèn HTML, không hỏi thông tin cá nhân.',
    input.rating <= 2
      ? 'Khách chưa hài lòng: xin lỗi, đề nghị liên hệ để hỗ trợ, không hứa hẹn cụ thể.'
      : 'Khách hài lòng: cảm ơn chân thành và mời khách quay lại.',
    `Cửa hàng: ${input.storeName || 'cửa hàng'}.`,
    `Số sao: ${input.rating}/5.`,
    `Tên khách: ${input.author || 'Khách'}.`,
    `Nội dung đánh giá: ${input.content}`,
    'Chỉ trả về nội dung câu trả lời, không kèm giải thích.',
  ].join('\n');

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly rateLimit: IngressRateLimitService,
    @Optional() @Inject(WORKERS_AI_BINDING) private readonly workersAi?: WorkersAiBinding | null,
  ) {}

  get configured(): boolean {
    return Boolean(this.workersAi);
  }

  get workersAiAvailable(): boolean {
    return Boolean(this.workersAi);
  }

  get model(): string {
    return this.env.AI_MODEL || WORKERS_AI_MODEL;
  }

  private extractWorkersAiText(raw: unknown): string {
    if (typeof raw === 'string') return raw.trim();
    if (raw && typeof raw === 'object') {
      if ('response' in raw && typeof raw.response === 'string') return raw.response.trim();
      if ('result' in raw && typeof raw.result === 'string') return raw.result.trim();
      if ('choices' in raw && Array.isArray(raw.choices) && raw.choices[0] && typeof raw.choices[0] === 'object') {
        const choice = raw.choices[0];
        if ('message' in choice && choice.message && typeof choice.message === 'object' && 'content' in choice.message && typeof choice.message.content === 'string') {
          return choice.message.content.trim();
        }
      }
    }
    return '';
  }

  async suggestReply(storeDomain: string, input: ReplySuggestionInput): Promise<{ suggestion: string; model: string }> {
    if (!this.workersAi) {
      throw new ServiceUnavailableException({
        code: 'ai_not_configured',
        message: 'AI chưa được cấu hình cho ứng dụng này (thiếu Workers AI binding)',
      });
    }
    await this.rateLimit.assertAllowed(
      'ai:reply-suggestion',
      storeDomain,
      AI_REPLY_RATE_WINDOW_SECONDS,
      AI_REPLY_RATE_MAX,
    );

    try {
      const result = await this.workersAi.run(this.model, {
        messages: [
          {
            role: 'system',
            content:
              'Bạn là nhân viên chăm sóc khách hàng của một cửa hàng trực tuyến tại Việt Nam. Hãy trả lời lịch sự, bằng tiếng Việt có dấu, 1-3 câu, tối đa 300 ký tự, không chèn link hay HTML.',
          },
          {
            role: 'user',
            content: buildPrompt(input),
          },
        ],
        max_tokens: 250,
        temperature: 0.6,
      });
      const rawText = this.extractWorkersAiText(result);
      const suggestion = stripMarkup(rawText).slice(0, MAX_SUGGESTION_LENGTH);
      if (!suggestion) {
        throw new ServiceUnavailableException({ code: 'ai_empty', message: 'AI không trả về nội dung' });
      }
      return { suggestion, model: this.model };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(
        `Workers AI reply suggestion failed for ${storeDomain}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException({ code: 'ai_unavailable', message: 'Dịch vụ AI tạm thời không khả dụng' });
    }
  }
}
