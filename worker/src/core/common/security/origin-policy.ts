import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const toStringValue = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim();
  }
  return null;
};

const normalizeOrigin = (value: string | null): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
};

export type OriginPolicyOptions = {
  frontendUrl?: string;
  apiBaseUrl?: string;
  allowedOrigins?: string[];
  extraAllowedOrigins?: string[];
};

export const isUnsafeMethod = (method: string): boolean =>
  !SAFE_METHODS.has(method.toUpperCase());

export const getAllowedAdminOrigins = (
  options: OriginPolicyOptions = {},
): Set<string> => {
  const origins = [
    normalizeOrigin(options.frontendUrl || null),
    normalizeOrigin(options.apiBaseUrl || null),
    ...(options.allowedOrigins || []).map((origin) => normalizeOrigin(origin)),
    ...(options.extraAllowedOrigins || []).map((origin) => normalizeOrigin(origin)),
  ].filter((origin): origin is string => Boolean(origin));
  return new Set(origins);
};

export const isTrustedUnsafeOrigin = (
  req: Request,
  options: OriginPolicyOptions = {},
): boolean => {
  if (!isUnsafeMethod(req.method)) return true;
  const requestOrigin =
    normalizeOrigin(toStringValue(req.headers.origin)) ||
    normalizeOrigin(toStringValue(req.headers.referer));
  return Boolean(requestOrigin && getAllowedAdminOrigins(options).has(requestOrigin));
};
