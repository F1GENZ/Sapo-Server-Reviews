import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearAuthSession,
  consumePostAuthRedirect,
  getActiveOrgid,
  getOrgid,
  getSessionToken,
  setAuthSession,
  setPostAuthRedirect,
  syncAuthSession,
} from '../src/common/AuthStorage.js';

class MemoryStorage {
  #map = new Map();

  getItem(key) {
    return this.#map.has(key) ? this.#map.get(key) : null;
  }

  setItem(key, value) {
    this.#map.set(key, String(value));
  }

  removeItem(key) {
    this.#map.delete(key);
  }

  clear() {
    this.#map.clear();
  }
}

const cookieJar = new Map();
const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();

function resetBrowserState(search = '?orgid=shop-a') {
  cookieJar.clear();
  localStorage.clear();
  sessionStorage.clear();

  globalThis.window = {
    location: {
      protocol: 'https:',
      hostname: 'reviews.example.com',
      pathname: '/',
      search,
      hash: '',
      origin: 'https://reviews.example.com',
    },
    localStorage,
    sessionStorage,
  };

  globalThis.document = {
    get cookie() {
      return Array.from(cookieJar.entries())
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('; ');
    },
    set cookie(value) {
      const [head, ...parts] = String(value).split(';');
      const [encodedKey, encodedValue = ''] = head.split('=');
      const key = decodeURIComponent(encodedKey);
      const attrs = parts.map((part) => part.trim().toLowerCase());
      const isRemoval = attrs.some((part) => part === 'max-age=0');
      if (isRemoval) {
        cookieJar.delete(key);
        return;
      }
      cookieJar.set(key, decodeURIComponent(encodedValue));
    },
  };
}

test.beforeEach(() => {
  resetBrowserState();
  clearAuthSession('shop-a');
  clearAuthSession('shop-b');
});

test('scopes auth session tokens by orgid so one org cannot satisfy another', () => {
  setAuthSession('shop-a', 'session-a');
  setAuthSession('shop-b', 'session-b');

  assert.equal(getSessionToken('shop-a'), 'session-a');
  assert.equal(getSessionToken('shop-b'), 'session-b');
  assert.notEqual(getSessionToken('shop-a'), getSessionToken('shop-b'));
});

test('ignores invalid orgid values from the URL during session sync', () => {
  resetBrowserState('?orgid=../../bad');
  sessionStorage.setItem('auth_session_token', 'legacy-token');
  sessionStorage.setItem('auth_verified', '1');

  syncAuthSession();

  assert.equal(getOrgid(), null);
  assert.equal(getActiveOrgid(), null);
  assert.equal(getSessionToken('../../bad'), null);
});

test('never stores or consumes post-auth redirects back into /install or /oauth', () => {
  setPostAuthRedirect('/install/login?orgid=shop-a');
  assert.equal(consumePostAuthRedirect('shop-a'), null);

  setPostAuthRedirect('/oauth/callback?code=123');
  assert.equal(consumePostAuthRedirect('shop-a'), null);

  setPostAuthRedirect('/reviews?tab=spam');
  assert.equal(consumePostAuthRedirect('shop-a'), '/reviews?tab=spam');
});
