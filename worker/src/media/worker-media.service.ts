import { HttpException, HttpStatus } from '@nestjs/common';
import type { AppEnv } from '../core/config/env.schema';
import { MediaService, sniffUploadContentType, type StoredMediaObject, type StoredMediaPage } from '../core/media/media.service';
import type { RedisService } from '../core/redis/redis.service';
import { evictSapoMediaEdgeCache, MEDIA_IMMUTABLE_CACHE_CONTROL } from '../edge-cache';
const UPLOAD_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};

const OBJECT_KEY_RE = /^reviews\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.mysapo\.net)\/\d{1,20}\/[A-Za-z0-9_-]{16,64}\.(jpg|png|webp|mp4)$/;
const TICKET_NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;

export class WorkerMediaService extends MediaService {
  private readonly evictedKeys: string[] = [];

  constructor(
    private readonly workerEnv: AppEnv,
    redis: RedisService,
    private readonly r2Bucket?: R2Bucket,
  ) {
    super(workerEnv, redis);
  }

  drainEvictedKeys(): string[] {
    if (this.evictedKeys.length === 0) return [];
    return this.evictedKeys.splice(0, this.evictedKeys.length);
  }
  override get storageConfigured(): boolean {
    if (this.r2Bucket && this.workerEnv.R2_PUBLIC_DOMAIN) return true;
    return super.storageConfigured;
  }

  override async uploadFile(
    storeDomain: string,
    productId: string,
    nonce: string,
    contentType: string,
    buffer: Buffer,
  ): Promise<{ cdnUrl: string; type: string }> {
    if (!this.r2Bucket) {
      return super.uploadFile(storeDomain, productId, nonce, contentType, buffer);
    }
    const publicDomain = this.workerEnv.R2_PUBLIC_DOMAIN;
    if (!publicDomain) {
      throw new HttpException(
        { statusCode: HttpStatus.SERVICE_UNAVAILABLE, code: 'upload_not_configured', message: 'Media upload is not configured', error: 'Service Unavailable' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const safeContentType = this.normalizeContentType(contentType);
    const mediaType = this.validateUploadInput(safeContentType, buffer.length);
    const sniffed = sniffUploadContentType(buffer);
    if (!sniffed) {
      throw new HttpException(
        { statusCode: HttpStatus.BAD_REQUEST, code: 'upload_content_mismatch', message: 'Unsupported file content', error: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (sniffed !== safeContentType) {
      throw new HttpException(
        { statusCode: HttpStatus.BAD_REQUEST, code: 'upload_content_mismatch', message: 'File content does not match declared type', error: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const safeProductId = this.validateProductId(productId);
    if (!TICKET_NONCE_RE.test(nonce)) {
      throw new HttpException(
        { statusCode: HttpStatus.BAD_REQUEST, code: 'upload_invalid_nonce', message: 'Invalid upload ticket', error: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const key = `reviews/${storeDomain}/${safeProductId}/${nonce}.${UPLOAD_EXTENSIONS[sniffed]}`;
    await this.r2Bucket.put(key, new Uint8Array(buffer), {
      httpMetadata: {
        contentType: sniffed,
        cacheControl: MEDIA_IMMUTABLE_CACHE_CONTROL,
      },
    });
    return { cdnUrl: `https://${publicDomain}/${key}`, type: mediaType };
  }

  override async deleteOwnedObjects(urls: string[], storeDomain?: string): Promise<number> {
    if (!this.r2Bucket) {
      return super.deleteOwnedObjects(urls, storeDomain);
    }
    const publicDomain = this.workerEnv.R2_PUBLIC_DOMAIN.trim().toLowerCase();
    const keys: string[] = [];
    for (const raw of urls) {
      try {
        const u = new URL(raw);
        if (u.protocol !== 'https:' || u.host.toLowerCase() !== publicDomain) continue;
        const m = OBJECT_KEY_RE.exec(u.pathname.slice(1));
        if (!m) continue;
        if (storeDomain !== undefined && m[1] !== storeDomain) continue;
        keys.push(m[0]);
      } catch {
        // skip invalid URL
      }
    }
    const unique = [...new Set(keys)];
    if (unique.length === 0) return 0;
    await this.r2Bucket.delete(unique);
    await evictSapoMediaEdgeCache(unique);
    this.evictedKeys.push(...unique);
    return unique.length;
  }

  override async listOwnedObjects(cursor: string | null, limit: number): Promise<StoredMediaPage> {
    if (!this.r2Bucket) {
      return super.listOwnedObjects(cursor, limit);
    }
    const listed = await this.r2Bucket.list({
      prefix: 'reviews/',
      limit: Math.min(Math.max(1, limit), 1000),
      cursor: cursor ?? undefined,
    });
    const objects: StoredMediaObject[] = [];
    for (const obj of listed.objects) {
      if (!OBJECT_KEY_RE.test(obj.key)) continue;
      objects.push({
        key: obj.key,
        url: `https://${this.workerEnv.R2_PUBLIC_DOMAIN}/${obj.key}`,
        uploadedAt: obj.uploaded.getTime(),
      });
    }
    return {
      objects,
      cursor: listed.truncated ? listed.cursor : null,
    };
  }
}
