import type { Request } from 'express';

export const clientFingerprint = (req: Request): string =>
  String(req.ip || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
