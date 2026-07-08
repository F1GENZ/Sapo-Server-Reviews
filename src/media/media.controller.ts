import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';
import { MediaService } from './media.service';

@Controller('/api/admin/media')
@UseGuards(ShopAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('/upload-ticket')
  createTicket(@Req() req: { storeDomain?: string }, @Body() body: {
    productId: string;
    filename: string;
    contentType: string;
    fileSize: number;
  }) {
    return this.media.createUploadTicket({
      storeDomain: req.storeDomain || '',
      productId: body.productId,
      filename: body.filename,
      contentType: body.contentType,
      fileSize: body.fileSize,
    });
  }
}
