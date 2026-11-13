import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { buildSapoAdminAppUrl, SAPO_APP_ADMIN_HANDLE } from '../src/core/sapo/admin-app-url';
import { SapoController } from '../src/core/sapo/sapo.controller';
import type { AppEnv } from '../src/core/config/env.schema';

const FRONTEND_URL = 'https://reviews-sapo.f1genz.dev';

type Harness = {
  redirects: Array<{ status: number; location: string }>;
  cookies: string[];
  call: (input: {
    flow: 'install' | 'login';
    storeDomain: string;
    redirectTo?: string;
    accept?: string;
  }) => Promise<unknown>;
};

const makeHarness = (): Harness => {
  const redirects: Harness['redirects'] = [];
  const cookies: string[] = [];
  let current: { flow: 'install' | 'login'; storeDomain: string; redirectTo?: string } | null = null;

  const handoff = () => ({
    handoffCode: 'sapo_handoff_test',
    storeDomain: current!.storeDomain,
    redirectTo: current!.redirectTo ?? '/dashboard',
  });

  const sapo = {
    peekStateFlow: async () => current!.flow,
    processInstallCallback: async () => handoff(),
    processLoginCallback: async () => handoff(),
    getLifecycleGeneration: async () => 1,
  };
  const sessions = {
    createSessionToken: (store: string) => `token-for-${store}`,
    setSessionCookie: (_res: unknown, token: string) => {
      cookies.push(token);
    },
  };
  const rateLimit = { assertAllowed: async () => undefined };

  const controller = new SapoController(
    { FRONTEND_URL, AUTH_RATE_LIMIT_WINDOW_SECONDS: 60, AUTH_RATE_LIMIT_MAX: 60 } as unknown as AppEnv,
    sapo as never,
    {} as never,
    sessions as never,
    {} as never,
    rateLimit as never,
  );

  const res = {
    redirect: (status: number, location: string) => {
      redirects.push({ status, location });
    },
  } as unknown as Response;

  return {
    redirects,
    cookies,
    call: async ({ flow, storeDomain, redirectTo, accept }) => {
      current = { flow, storeDomain, redirectTo };
      const req = {
        method: 'GET',
        headers: { accept: accept ?? 'text/html' },
        query: {},
      } as unknown as Request;
      return controller.installCallbackGet(req, res, 'code-1', 'state-1');
    },
  };
};

describe('buildSapoAdminAppUrl', () => {
  it('builds the embedded app URL for a mysapo.net store', () => {
    expect(buildSapoAdminAppUrl('f1genz-seafoods.mysapo.net')).toBe(
      `https://f1genz-seafoods.mysapo.net/admin/apps/${SAPO_APP_ADMIN_HANDLE}`,
    );
    expect(buildSapoAdminAppUrl('  Shop-One.MySapo.net ')).toBe(
      `https://shop-one.mysapo.net/admin/apps/${SAPO_APP_ADMIN_HANDLE}`,
    );
  });

  it.each([
    '',
    'evil.com',
    'mysapo.net',
    'shop.mysapo.net.evil.com',
    'evil.com/shop.mysapo.net',
    'evil.com#.mysapo.net',
    'user@shop.mysapo.net',
    'shop.mysapo.net:8443',
    'shop.mysapo.net/path',
    '-bad.mysapo.net',
    'a.b.mysapo.net',
    'shop.mysapo.com',
  ])('rejects %j', (value) => {
    expect(buildSapoAdminAppUrl(value)).toBeNull();
  });

  it('rejects non-string input', () => {
    expect(buildSapoAdminAppUrl(undefined)).toBeNull();
    expect(buildSapoAdminAppUrl(42)).toBeNull();
  });
});

describe('OAuth callback redirect', () => {
  it('sends a completed install back to the app inside the Sapo admin, without a session cookie or handoff', async () => {
    const h = makeHarness();
    const out = await h.call({ flow: 'install', storeDomain: 'f1genz-seafoods.mysapo.net' });
    expect(out).toBeUndefined();
    expect(h.redirects).toEqual([
      { status: 302, location: `https://f1genz-seafoods.mysapo.net/admin/apps/${SAPO_APP_ADMIN_HANDLE}` },
    ]);
    expect(h.cookies).toEqual([]);
  });

  it('ignores the stored redirect path for an install and still lands in the admin', async () => {
    const h = makeHarness();
    await h.call({ flow: 'install', storeDomain: 'shop.mysapo.net', redirectTo: '/reviews' });
    expect(h.redirects[0].location).toBe(`https://shop.mysapo.net/admin/apps/${SAPO_APP_ADMIN_HANDLE}`);
  });

  it.each(['evil.com', 'shop.mysapo.net.evil.com', 'evil.com/shop.mysapo.net', ''])(
    'falls back to the admin SPA handoff when the store is %j',
    async (storeDomain) => {
      const h = makeHarness();
      await h.call({ flow: 'install', storeDomain });
      expect(h.redirects).toHaveLength(1);
      const location = new URL(h.redirects[0].location);
      expect(location.origin).toBe(FRONTEND_URL);
      expect(location.searchParams.get('handoff_code')).toBe('sapo_handoff_test');
      expect(location.searchParams.get('storeDomain')).toBe(storeDomain);
      expect(h.cookies).toHaveLength(1);
    },
  );

  it('keeps the login flow on the admin SPA with a handoff', async () => {
    const h = makeHarness();
    await h.call({ flow: 'login', storeDomain: 'shop.mysapo.net', redirectTo: '/reviews' });
    const location = new URL(h.redirects[0].location);
    expect(location.origin).toBe(FRONTEND_URL);
    expect(location.pathname).toBe('/reviews');
    expect(location.searchParams.get('handoff_code')).toBe('sapo_handoff_test');
    expect(h.cookies).toHaveLength(1);
  });

  it('returns JSON to API clients instead of redirecting', async () => {
    const h = makeHarness();
    const out = (await h.call({
      flow: 'install',
      storeDomain: 'shop.mysapo.net',
      accept: 'application/json',
    })) as { handoffCode: string; storeDomain: string };
    expect(h.redirects).toEqual([]);
    expect(out.handoffCode).toBe('sapo_handoff_test');
    expect(out.storeDomain).toBe('shop.mysapo.net');
  });
});
