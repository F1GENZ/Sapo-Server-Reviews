import { Body, Controller, Headers, HttpCode, Options, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { MediaService } from './media.service';
import { SapoService } from '../sapo/sapo.service';

@Controller('/api/public/media')
export class PublicMediaController {
  constructor(
    private readonly media: MediaService,
    private readonly sapo: SapoService,
  ) {}

  @Options('*')
  options() {
    return;
  }

  @Post('/upload')
  @HttpCode(200)
  async upload(
    @Req() req: Request,
    @Headers('x-store-domain') headerDomain?: string,
    @Body() body?: {
      ticket?: string;
      productId?: string;
      filename?: string;
      contentType?: string;
      fileSize?: number;
    },
  ) {
    const storeDomain = headerDomain || '';
    if (!storeDomain) throw new (await import('@nestjs/common')).BadRequestException('Missing store domain');

    if (body?.ticket) {
      this.media.verifyUploadTicket(body.ticket, {
        storeDomain,
        productId: body.productId || '',
        filename: body.filename || '',
        contentType: body.contentType || '',
        fileSize: body.fileSize || 0,
      });
      return { ok: true };
    }

    // Direct upload with token resolution (admin embedded context)
    const accessToken = await this.sapo.resolveAccessToken(storeDomain);
    // For public uploads we return a presigned ticket instead
    const ticket = this.media.createUploadTicket({
      storeDomain,
      productId: body?.productId || '',
      filename: body?.filename || 'upload',
      contentType: body?.contentType || 'application/octet-stream',
      fileSize: body?.fileSize || 0,
    });
    return { ticket: ticket.ticket, expiresAt: ticket.expiresAt };
  }
}
