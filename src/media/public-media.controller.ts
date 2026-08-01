import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Options,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { MediaService, MAX_UPLOAD_BYTES } from './media.service';
import { SapoService } from '../sapo/sapo.service';
import { IngressRateLimitService } from '../common/security/ingress-rate-limit.service';
import { clientFingerprint } from '../common/security/client-fingerprint';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';

@Controller('/api/public/media')
export class PublicMediaController {
  constructor(
    private readonly media: MediaService,
    private readonly sapo: SapoService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly rateLimit: IngressRateLimitService,
  ) {}

  @Options('*')
  options() {
    return;
  }

  private async assertRate(req: Request, storeDomain: string): Promise<void> {
    await this.rateLimit.assertAllowed(
      'public-media:upload',
      `${storeDomain}|${clientFingerprint(req)}`,
      this.env.PUBLIC_WRITE_RATE_LIMIT_WINDOW_SECONDS,
      this.env.PUBLIC_WRITE_RATE_LIMIT_MAX,
    );
  }

  /** Mint a signed upload ticket bound to the store + product + file metadata. */
  @Post('/ticket')
  @HttpCode(200)
  async createTicket(
    @Req() req: Request,
    @Headers('x-store-domain') headerDomain?: string,
    @Body() body?: {
      productId?: string;
      filename?: string;
      contentType?: string;
      fileSize?: number;
    },
  ) {
    const storeDomain = String(headerDomain || '').trim();
    if (!storeDomain) throw new (await import('@nestjs/common')).BadRequestException('Missing store domain');
    await this.assertRate(req, storeDomain);
    // Confirm the store has an active install before minting a ticket.
    await this.sapo.resolveAccessToken(storeDomain);
    const ticket = this.media.createUploadTicket({
      storeDomain,
      productId: body?.productId || '',
      filename: body?.filename || 'upload',
      contentType: body?.contentType || 'application/octet-stream',
      fileSize: body?.fileSize || 0,
    });
    return { data: { ticket: ticket.ticket, expiresAt: ticket.expiresAt } };
  }

  /** Receive a multipart file, verify the ticket, and PUT it to the R2 worker. */
  @Post('/upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @UploadedFile() file: any,
    @Req() req: Request,
    @Headers('x-store-domain') headerDomain?: string,
    @Query('productId') productId?: string,
    @Query('ticket') ticket?: string,
  ) {
    const storeDomain = String(headerDomain || '').trim();
    if (!storeDomain) throw new (await import('@nestjs/common')).BadRequestException('Missing store domain');
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new (await import('@nestjs/common')).BadRequestException('Missing file');
    }
    await this.assertRate(req, storeDomain);

    const filename = String(file.originalname || 'upload');
    const contentType = String(file.mimetype || 'application/octet-stream');
    const fileSize = file.size || file.buffer.length;
    this.media.verifyUploadTicket(String(ticket || ''), {
      storeDomain,
      productId: String(productId || ''),
      filename,
      contentType,
      fileSize,
    });

    const result = await this.media.uploadFile(storeDomain, String(productId || ''), filename, contentType, file.buffer);
    return { data: { url: result.cdnUrl, type: result.type } };
  }
}
