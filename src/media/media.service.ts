import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { randomBytes } from 'crypto';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';

export const IMAGE_MAX_SIZE_BYTES = 500 * 1024;
export const VIDEO_MAX_SIZE_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = VIDEO_MAX_SIZE_BYTES;
export const PUBLIC_UPLOAD_TICKET_TTL_MS = 2 * 60 * 1000;
export const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'] as const;
export const CONTENT_TYPE_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
};

export function normalizeUploadContentType(contentType: string): string {
  const normalized = String(contentType || '').trim().toLowerCase();
  return CONTENT_TYPE_ALIASES[normalized] || normalized;
}

const NUMERIC_ID_RE = /^\d{1,20}$/;
const FILENAME_RE = /^(?!.*\.\.)(?!.*[/\\])[\s\S]{1,255}$/;

type UploadTicketPayload = {
  storeDomain: string;
  productId: string;
  filename: string;
  contentType: string;
  fileSize: number;
  expiresAt: number;
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  validateProductId(productId: string): string {
    if (!NUMERIC_ID_RE.test(productId)) {
      throw new BadRequestException('Invalid productId');
    }
    return productId;
  }

  validateFilename(filename: string): string {
    if (!FILENAME_RE.test(filename)) {
      throw new BadRequestException('Invalid filename');
    }
    return filename;
  }

  normalizeContentType(contentType: string): string {
    return normalizeUploadContentType(contentType);
  }

  validateUploadInput(contentType: string, fileSize: number): 'image' | 'video' {
    const normalizedContentType = this.normalizeContentType(contentType);
    if (!ALLOWED_UPLOAD_TYPES.includes(normalizedContentType as (typeof ALLOWED_UPLOAD_TYPES)[number])) {
      throw new BadRequestException('Unsupported file type');
    }
    const isVideo = normalizedContentType.startsWith('video/');
    const maxSize = isVideo ? VIDEO_MAX_SIZE_BYTES : IMAGE_MAX_SIZE_BYTES;
    if (fileSize > maxSize) {
      throw new BadRequestException(`File too large. Max ${isVideo ? '2MB' : '500KB'} for ${isVideo ? 'video' : 'image'}`);
    }
    return isVideo ? 'video' : 'image';
  }

  createUploadTicket(input: {
    storeDomain: string;
    productId: string;
    filename: string;
    contentType: string;
    fileSize: number;
    ttlMs?: number;
  }): { ticket: string; expiresAt: number } {
    const ticketSecret = this.env.R2_UPLOAD_SECRET;
    if (!ticketSecret) throw new BadRequestException('Upload ticket secret is not configured');

    const productId = this.validateProductId(input.productId);
    const filename = this.validateFilename(input.filename);
    this.validateUploadInput(input.contentType, input.fileSize);

    const normalizedContentType = this.normalizeContentType(input.contentType);
    const expiresAt = Date.now() + (input.ttlMs ?? PUBLIC_UPLOAD_TICKET_TTL_MS);
    const payload: UploadTicketPayload = {
      storeDomain: input.storeDomain,
      productId,
      filename,
      contentType: normalizedContentType,
      fileSize: input.fileSize,
      expiresAt,
    };

    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', ticketSecret).update(encoded).digest('base64url');
    return { ticket: `${encoded}.${signature}`, expiresAt };
  }

  verifyUploadTicket(ticket: string, expected: {
    storeDomain: string;
    productId: string;
    filename: string;
    contentType: string;
    fileSize: number;
  }): UploadTicketPayload {
    const ticketSecret = this.env.R2_UPLOAD_SECRET;
    if (!ticketSecret) throw new BadRequestException('Upload ticket secret is not configured');

    const [encoded, signature] = String(ticket || '').split('.');
    if (!encoded || !signature) throw new BadRequestException('Missing upload ticket');

    const computed = crypto.createHmac('sha256', ticketSecret).update(encoded).digest('base64url');
    if (computed.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))) {
      throw new BadRequestException('Invalid upload ticket');
    }

    let payload: UploadTicketPayload;
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as UploadTicketPayload;
    } catch {
      throw new BadRequestException('Invalid upload ticket');
    }

    if (!payload || payload.expiresAt <= Date.now()) throw new BadRequestException('Upload ticket expired');
    if (
      payload.storeDomain !== expected.storeDomain ||
      payload.productId !== this.validateProductId(expected.productId) ||
      payload.filename !== this.validateFilename(expected.filename) ||
      payload.contentType !== this.normalizeContentType(expected.contentType) ||
      payload.fileSize !== expected.fileSize
    ) {
      throw new BadRequestException('Upload ticket mismatch');
    }
    this.validateUploadInput(payload.contentType, payload.fileSize);
    return payload;
  }

  async uploadFile(
    storeDomain: string,
    productId: string,
    filename: string,
    contentType: string,
    buffer: Buffer,
  ): Promise<{ cdnUrl: string; type: string }> {
    const workerUrl = this.env.R2_WORKER_URL;
    const uploadSecret = this.env.R2_UPLOAD_SECRET;
    const publicDomain = this.env.R2_PUBLIC_DOMAIN;
    if (!workerUrl || !uploadSecret || !publicDomain) {
      this.logger.error('Media upload is not configured: check R2_WORKER_URL, R2_UPLOAD_SECRET, R2_PUBLIC_DOMAIN');
      throw new BadRequestException('Media upload is not configured');
    }

    const safeContentType = this.normalizeContentType(contentType);
    this.validateUploadInput(safeContentType, buffer.length);
    const safeName = this.validateFilename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeProductId = this.validateProductId(productId);
    const uniqueId = randomBytes(8).toString('base64url');
    const key = `reviews/${storeDomain}/${safeProductId}/${uniqueId}/${safeName}`;

    const response = await fetch(`${workerUrl}/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': safeContentType, 'X-Upload-Token': uploadSecret },
      body: new Uint8Array(buffer),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      this.logger.error(`Worker upload failed: ${response.status} ${errorText || response.statusText}`);
      const safeMessage = response.status === 401 ? 'Upload service rejected the request'
        : response.status === 413 ? 'File too large'
        : 'Upload failed';
      throw new BadRequestException(safeMessage);
    }

    return { cdnUrl: `https://${publicDomain}/${key}`, type: safeContentType.startsWith('video/') ? 'video' : 'image' };
  }
}
