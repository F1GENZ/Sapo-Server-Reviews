import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import express, { type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { APP_ENV } from './config/app-config.module';
import type { AppEnv } from './config/env.schema';
import { getAllowedAdminOrigins } from './common/security/origin-policy';

type RawBodyRequest = Request & { rawBody?: Buffer; rawBodyText?: string };

const captureRawBody = (req: RawBodyRequest, _res: Response, buf: Buffer): void => {
  if (!buf?.length) return;
  req.rawBody = Buffer.from(buf);
  req.rawBodyText = buf.toString('utf8');
};

const contentTypeGuard = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === 'GET') {
    next();
    return;
  }
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    res.status(415).json({ error: 'Webhook content-type must be application/json' });
    return;
  }
  next();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const env = app.get<AppEnv>(APP_ENV);
  const instance = app.getHttpAdapter().getInstance() as express.Express;
  const allowedOrigins = getAllowedAdminOrigins({
    frontendUrl: env.FRONTEND_URL,
    apiBaseUrl: env.API_BASE_URL,
    allowedOrigins: env.CORS_ALLOWED_ORIGINS,
  });
  instance.set('trust proxy', env.TRUST_PROXY);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    let normalizedOrigin = '';
    try {
      normalizedOrigin = origin ? new URL(origin).origin.toLowerCase() : '';
    } catch {
      normalizedOrigin = '';
    }
    const originAllowed = Boolean(normalizedOrigin && allowedOrigins.has(normalizedOrigin));
    // Public storefront endpoints and static assets must work from any storefront
    // custom domain, so echo any origin for them instead of gating to admin origins.
    const isPublicPath = req.path.startsWith('/api/public') || req.path.startsWith('/storefront');
    if (originAllowed || (isPublicPath && origin)) {
      res.setHeader('Access-Control-Allow-Origin', originAllowed ? normalizedOrigin : origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Accept,Authorization,Content-Type,Origin,Referer,X-Store-Domain,Store-Domain,X-Sapo-Hmac,X-Sapo-HmacSha256,X-Sapo-Topic');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.status(origin && !originAllowed && !isPublicPath ? 403 : 204).end();
      return;
    }
    next();
  });

  app.use('/api/oauth/install/webhooks', contentTypeGuard);
  app.use('/api/oauth/install/webhooks', express.json({ limit: env.WEBHOOK_BODY_LIMIT, verify: captureRawBody }));
  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT, verify: captureRawBody }));
  app.use(express.urlencoded({ limit: env.REQUEST_BODY_LIMIT, extended: true, verify: captureRawBody }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    res.removeHeader('X-Powered-By');
    next();
  });

  await app.listen(env.PORT);
}

void bootstrap();
