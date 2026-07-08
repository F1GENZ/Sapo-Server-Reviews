import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';
import { IngressRateLimitService } from '../common/security/ingress-rate-limit.service';
import { isTrustedUnsafeOrigin } from '../common/security/origin-policy';
import { ShopAuthGuard } from '../common/guards/shop-auth.guard';
import { SapoService, type AuthStartResponse, type HandoffResponse } from './sapo.service';
import { HmacVerifierService } from './hmac-verifier.service';
import { SessionService } from './session.service';
import { WebhookService } from './webhook.service';

type RawRequest = Request & { rawBody?: Buffer };
type AuthFlowResponse = AuthStartResponse | HandoffResponse;

const firstQuery = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
};

const clientFingerprint = (req: Request): string =>
  String(req.ip || req.socket.remoteAddress || 'unknown').split(',')[0].trim();

const wantsBrowserRedirect = (req: Request): boolean => {
  const accept = String(req.headers.accept || '').toLowerCase();
  return accept.includes('text/html') && !accept.includes('application/json');
};

@Controller('/api')
export class SapoController {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly sapo: SapoService,
    private readonly hmacVerifier: HmacVerifierService,
    private readonly sessions: SessionService,
    private readonly webhooks: WebhookService,
    private readonly rateLimit: IngressRateLimitService,
  ) {}

  private async assertAuthRate(req: Request, bucket: string): Promise<void> {
    await this.rateLimit.assertAllowed(
      bucket,
      clientFingerprint(req),
      this.env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
      this.env.AUTH_RATE_LIMIT_MAX,
    );
  }

  private finishAuthFlow(req: Request, res: Response, response: AuthFlowResponse): AuthFlowResponse | undefined {
    if (!wantsBrowserRedirect(req)) return response;
    if ('url' in response) {
      res.redirect(302, response.url);
      return undefined;
    }
    this.sessions.setSessionCookie(res, response.storeDomain);
    res.redirect(302, new URL(response.redirectTo || '/dashboard', this.env.FRONTEND_URL).toString());
    return undefined;
  }

  @Get('/oauth/install/login')
  async startLogin(@Req() req: Request, @Query('storeDomain') storeDomain?: string, @Query('redirect') redirectTo?: string) {
    await this.assertAuthRate(req, 'oauth-login');
    return this.sapo.startLogin({ storeDomain, redirectTo });
  }

  @Get('/oauth/install/login/verify-hmac')
  async verifyHmac(@Req() req: Request) {
    await this.assertAuthRate(req, 'hmac-verify');
    const queryIndex = req.originalUrl.indexOf('?');
    const rawQuery = queryIndex >= 0 ? req.originalUrl.slice(queryIndex + 1) : '';
    const launchParams = new URLSearchParams(rawQuery);
    if (!launchParams.has('hmac')) {
      return this.sapo.startLogin({ storeDomain: firstQuery(req.query.storeDomain), redirectTo: firstQuery(req.query.redirect) });
    }

    const params = this.hmacVerifier.verifyLaunchQuery(rawQuery);
    const storeDomain = params.get('storeDomain') || undefined;
    if (!storeDomain) return this.sapo.startLogin({ reason: 'missing_storeDomain' } as never);
    return this.sessions.createHandoff(storeDomain, '/dashboard');
  }

  @Get('/oauth/install/login/callback')
  async loginCallbackGet(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ) {
    await this.assertAuthRate(req, 'oauth-callback');
    const response = await this.sapo.processLoginCallback(code || '', state);
    return this.finishAuthFlow(req, res, response);
  }

  @Post('/oauth/install/login/callback')
  async loginCallbackPost(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('code') code?: string,
    @Body('state') state?: string,
  ) {
    await this.assertAuthRate(req, 'oauth-callback');
    const response = await this.sapo.processLoginCallback(code || '', state);
    return this.finishAuthFlow(req, res, response);
  }

  @Get('/oauth/install/callback')
  async installCallbackGet(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ) {
    await this.assertAuthRate(req, 'oauth-install');
    const response = await this.sapo.processInstallCallback(code || '', state);
    return this.finishAuthFlow(req, res, response);
  }

  @Post('/oauth/install/callback')
  async installCallbackPost(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('code') code?: string,
    @Body('state') state?: string,
  ) {
    await this.assertAuthRate(req, 'oauth-install');
    const response = await this.sapo.processInstallCallback(code || '', state);
    return this.finishAuthFlow(req, res, response);
  }

  @Get('/oauth/install/webhooks')
  async webhookChallenge(@Res() res: Response) {
    // Sapo does not use a GET verify-challenge handshake.
    // Return 200 for health-check compatibility.
    res.status(200).send('ok');
  }

  @Post('/oauth/install/webhooks')
  async webhookPost(@Req() req: RawRequest, @Body() body: unknown, @Query() query: Record<string, unknown>, @Headers() headers: Record<string, unknown>) {
    await this.rateLimit.assertAllowed(
      'webhook-post',
      clientFingerprint(req),
      this.env.WEBHOOK_RATE_LIMIT_WINDOW_SECONDS,
      this.env.WEBHOOK_RATE_LIMIT_MAX,
    );
    return this.webhooks.handle({ headers, query, body, rawBody: req.rawBody });
  }

  @Post('/auth/session/exchange')
  async sessionExchange(@Req() req: Request, @Body('handoffCode') handoffCode: string, @Res() res: Response) {
    await this.rateLimit.assertAllowed(
      'session-exchange',
      clientFingerprint(req),
      this.env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
      this.env.SESSION_EXCHANGE_RATE_LIMIT_MAX,
    );
    if (!isTrustedUnsafeOrigin(req, {
      frontendUrl: this.env.FRONTEND_URL,
      apiBaseUrl: this.env.API_BASE_URL,
      allowedOrigins: this.env.CORS_ALLOWED_ORIGINS,
    })) {
      throw new UnauthorizedException('Untrusted request origin');
    }
    const handoff = await this.sessions.consumeHandoff(handoffCode);
    this.sessions.setSessionCookie(res, handoff.storeDomain);
    res.json({ ok: true, storeDomain: handoff.storeDomain, redirectTo: handoff.redirectTo });
  }

  @Post('/auth/logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    await this.assertAuthRate(req, 'auth-logout');
    if (!isTrustedUnsafeOrigin(req, {
      frontendUrl: this.env.FRONTEND_URL,
      apiBaseUrl: this.env.API_BASE_URL,
      allowedOrigins: this.env.CORS_ALLOWED_ORIGINS,
    })) {
      throw new UnauthorizedException('Untrusted request origin');
    }
    const sessionToken = this.sessions.getSessionTokenFromRequest(req);
    if (!sessionToken) throw new UnauthorizedException('Missing auth session');
    this.sessions.verifySessionToken(sessionToken);
    this.sessions.clearSessionCookie(res);
    res.json({ ok: true });
  }

  @Get('/app/session')
  @UseGuards(ShopAuthGuard)
  sessionProbe(@Req() req: Request & { storeDomain?: string }) {
    return this.sapo.getSessionProbe(req.storeDomain || '');
  }
}
