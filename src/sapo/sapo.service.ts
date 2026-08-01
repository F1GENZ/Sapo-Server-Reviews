import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { APP_ENV } from '../config/app-config.module';
import type { AppEnv } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';
import { LifecycleLockService } from './lifecycle-lock.service';
import { SapoApiService } from './sapo-api.service';
import { OAuthStateService } from './oauth-state.service';
import { SessionService } from './session.service';
import { ShopDomainService, normalizeShopDomain } from './shop-domain.service';
import { TokenEncryptionService } from './token-encryption.service';
import { StorefrontService } from '../storefront/storefront.service';
import { WebhookRegistrationService } from './webhook-registration.service';

const BLOCKED_STATUSES = new Set(['canceled', 'expired', 'needs_reinstall', 'declined', 'uninstalled']);

const SAPO_SHOP_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.mysapo\.net$/i;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const timestampOf = (value: unknown): number => {
  if (!value) return 0;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

export type AuthStartResponse = { url: string; reason?: string };
export type HandoffResponse = { handoffCode: string; storeDomain: string; redirectTo: string };

@Injectable()
export class SapoService {
  private readonly db: any;

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly prisma: PrismaService,
    private readonly oauthState: OAuthStateService,
    private readonly sapoApi: SapoApiService,
    private readonly sessionService: SessionService,
    private readonly tokenEncryption: TokenEncryptionService,
    private readonly shopDomains: ShopDomainService,
    private readonly lifecycleLocks: LifecycleLockService,
    private readonly webhookRegistration: WebhookRegistrationService,
    private readonly storefrontService: StorefrontService,
  ) {
    this.db = prisma as any;
  }

  // ─── OAuth authorize URL builder ────────────────────────────────

  private buildAuthorizeUrl(input: { flow: 'login' | 'install'; state: string; storeDomain?: string }): string {
    const params = new URLSearchParams({
      client_id: this.env.SAPO_CLIENT_ID,
      scope: this.env.SAPO_SCOPE,
      redirect_uri: input.flow === 'install'
        ? this.env.SAPO_INSTALL_CALLBACK_URL
        : this.env.SAPO_LOGIN_CALLBACK_URL,
      state: input.state,
    });
    const baseDomain = input.storeDomain;
    if (!baseDomain) throw new BadRequestException('storeDomain is required to build authorize URL');
    const shopHost = normalizeShopDomain(baseDomain);
    if (!SAPO_SHOP_DOMAIN_RE.test(shopHost)) {
      throw new BadRequestException('storeDomain must be a valid Sapo shop domain (*.mysapo.net)');
    }
    return `https://${shopHost}/admin/oauth/authorize?${params.toString()}`;
  }

  async buildLoginUrl(input: { storeDomain?: string; redirectTo?: string } = {}): Promise<string> {
    if (!input.storeDomain) throw new BadRequestException('storeDomain is required');
    const { state } = await this.oauthState.create('login', input);
    return this.buildAuthorizeUrl({ flow: 'login', state, storeDomain: input.storeDomain });
  }

  async buildInstallUrl(input: { storeDomain?: string; redirectTo?: string } = {}): Promise<string> {
    if (!input.storeDomain) throw new BadRequestException('storeDomain is required');
    const { state } = await this.oauthState.create('install', input);
    return this.buildAuthorizeUrl({ flow: 'install', state, storeDomain: input.storeDomain });
  }

  async startLogin(input: { storeDomain?: string; redirectTo?: string } = {}): Promise<AuthStartResponse> {
    return { url: await this.buildLoginUrl(input), reason: 'sso_required' };
  }

  // ─── Login callback ─────────────────────────────────────────────

  async processLoginCallback(code: string, state: string | undefined): Promise<AuthStartResponse | HandoffResponse> {
    if (!code) throw new BadRequestException('Missing code');
    const oauthState = await this.oauthState.consume(state, 'login');
    const storeDomain = oauthState.storeDomain;
    if (!storeDomain) throw new BadRequestException('Missing storeDomain in OAuth state');

    // Exchange code for token and verify store identity
    const tokenPayload = await this.sapoApi.exchangeCode(code, storeDomain);
    if (!tokenPayload.access_token) throw new BadRequestException('Invalid OAuth token payload');

    // Verify the store matches by calling shop API
    const shop = await this.sapoApi.getShop(storeDomain, tokenPayload.access_token).catch(() => null);
    if (!shop) throw new BadRequestException('Failed to verify store identity');

    const install = await this.db.appInstall.findUnique({ where: { storeDomain } });
    if (!install || BLOCKED_STATUSES.has(String(install.status))) {
      return { url: await this.buildInstallUrl({ storeDomain, redirectTo: oauthState.redirectTo }), reason: 'install_required' };
    }
    return this.sessionService.createHandoff(storeDomain, oauthState.redirectTo);
  }

  // ─── Install callback ───────────────────────────────────────────

  async processInstallCallback(code: string, state: string | undefined): Promise<HandoffResponse> {
    if (!code) throw new BadRequestException('Missing code');
    const oauthState = await this.oauthState.consume(state, 'install');
    const storeDomain = oauthState.storeDomain;
    if (!storeDomain) throw new BadRequestException('Missing storeDomain in OAuth state');

    // Exchange code for permanent access token
    const tokenPayload = await this.sapoApi.exchangeCode(code, storeDomain);
    if (!tokenPayload.access_token) throw new BadRequestException('Invalid OAuth token payload');

    // Verify store identity
    const shop = await this.sapoApi.getShop(storeDomain, tokenPayload.access_token).catch(() => null);
    if (!shop) throw new BadRequestException('Failed to verify store identity');
    const domains = this.shopDomains.collectDomains(shop as any);

    const lock = await this.lifecycleLocks.acquireLifecycleLock(storeDomain);
    if (!lock) throw new ConflictException('Lifecycle operation already in progress');

    try {
      const existingInstall = typeof this.db.appInstall.findUnique === 'function'
        ? await this.db.appInstall.findUnique({ where: { storeDomain } })
        : null;
      const uninstalledAt = timestampOf(existingInstall?.uninstalledAt);
      if (uninstalledAt && oauthState.createdAt < uninstalledAt) {
        throw new BadRequestException('Stale install callback after uninstall');
      }

      const encryptedToken = this.tokenEncryption.encrypt(tokenPayload.access_token);

      // v1 free-first (D5): all installs are 'active' with features unlocked
      const shopRow = await this.db.shop.upsert({
        where: { storeDomain },
        create: { storeDomain },
        update: {},
      });

      await this.db.appInstall.upsert({
        where: { storeDomain },
        create: {
          shopId: shopRow.id,
          storeDomain,
          status: 'active',
          featuresUnlocked: true,
          accessTokenCiphertext: encryptedToken.ciphertext,
          accessTokenIv: encryptedToken.iv,
          accessTokenTag: encryptedToken.tag,
          installedAt: new Date(),
          lifecycleGeneration: 1,
        },
        update: {
          status: 'active',
          featuresUnlocked: true,
          accessTokenCiphertext: encryptedToken.ciphertext,
          accessTokenIv: encryptedToken.iv,
          accessTokenTag: encryptedToken.tag,
          installedAt: new Date(),
          uninstalledAt: null,
          lifecycleGeneration: { increment: 1 },
          tokenVersion: { increment: 1 },
        },
      });

      for (const domain of domains) {
        const tombstonePriorOwner = this.db.shopDomain.updateMany({
          where: { domain, active: true, storeDomain: { not: storeDomain } },
          data: { active: false, tombstonedAt: new Date() },
        });
        const upsertDomain = this.db.shopDomain.upsert({
          where: { id: `${storeDomain}:${domain}` },
          create: { id: `${storeDomain}:${domain}`, shopId: shopRow.id, storeDomain, domain, kind: 'custom', active: true },
          update: { active: true, tombstonedAt: null, shopId: shopRow.id, storeDomain },
        });
        if (typeof this.db.$transaction === 'function') {
          await this.db.$transaction([tombstonePriorOwner, upsertDomain]);
        } else {
          await tombstonePriorOwner;
          await upsertDomain;
        }
        await this.shopDomains.saveMapping(storeDomain, domain);
      }

      // Fire-and-forget post-install hooks
      const accessToken = tokenPayload.access_token;
      this.webhookRegistration.registerForInstall(storeDomain, accessToken)
        .catch(() => { /* logged in webhookRegistration */ });
      this.storefrontService.writeStorefrontConfig(storeDomain, accessToken)
        .catch(() => { /* non-critical */ });

      return this.sessionService.createHandoff(storeDomain, oauthState.redirectTo);
    } finally {
      await this.lifecycleLocks.release(lock);
    }
  }

  // ─── Token resolution ───────────────────────────────────────────

  private decryptAccessToken(install: any): string | null {
    return this.tokenEncryption.optionalDecrypt({
      ciphertext: install.accessTokenCiphertext,
      iv: install.accessTokenIv,
      tag: install.accessTokenTag,
    });
  }

  async resolveAccessToken(storeDomain: string): Promise<string> {
    const install = await this.db.appInstall.findUnique({ where: { storeDomain } });
    if (!install || BLOCKED_STATUSES.has(String(install.status))) {
      throw new UnauthorizedException('App needs reinstall');
    }

    const accessToken = this.decryptAccessToken(install);
    if (!accessToken) throw new UnauthorizedException('Missing Sapo access token');

    // Sapo access tokens are permanent — no refresh needed
    return accessToken;
  }

  async getSessionProbe(storeDomain: string): Promise<Record<string, unknown>> {
    const [install, domain] = await Promise.all([
      this.db.appInstall.findUnique({ where: { storeDomain } }),
      this.db.shopDomain.findFirst({
        where: { storeDomain, active: true },
        orderBy: [{ kind: 'asc' }, { updatedAt: 'desc' }],
        select: { domain: true },
      }).catch(() => null),
    ]);
    return {
      storeDomain,
      shopDomain: domain?.domain,
      status: install?.status || 'unknown',
      featuresUnlocked: install?.featuresUnlocked ?? true,
      webhookStatus: install?.webhookRegistrationStatus || 'not_configured',
    };
  }
}
