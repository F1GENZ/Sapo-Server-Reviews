const ORGID_KEY = "orgid";
const AUTH_VERIFIED_KEY = "auth_verified";
// Stores the internal app session JWT issued by our server.
// Haravan access/refresh tokens must never be stored in the client.
const SESSION_TOKEN_KEY = "auth_session_token";
const POST_AUTH_REDIRECT_KEY = "post_auth_redirect";
const SESSION_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
const ORGID_PATTERN = /^[a-zA-Z0-9._-]{1,253}$/;

function getStorage(type) {
  if (typeof window === "undefined") return null;
  try {
    return window[type];
  } catch {
    return null;
  }
}

function isIpAddress(hostname) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":");
}

function getCookieDomain() {
  if (typeof window === "undefined") return "";
  const hostname = window.location.hostname;
  if (!hostname || hostname === "localhost" || isIpAddress(hostname)) return "";
  return `; Domain=.${hostname.replace(/^\./, "")}`;
}

function getCookieAttributes() {
  if (typeof window === "undefined") return "";
  const secure = window.location.protocol === "https:";
  return [
    "; Path=/",
    `; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    getCookieDomain(),
    secure ? "; SameSite=None; Secure" : "; SameSite=Lax",
  ].join("");
}

function normalizeOrgid(value) {
  const text = String(value || "").trim();
  return ORGID_PATTERN.test(text) ? text : null;
}

function getUrlOrgid() {
  if (typeof window === "undefined") return null;
  return normalizeOrgid(new URLSearchParams(window.location.search).get("orgid"));
}

function scopedKey(key, orgid) {
  const normalized = normalizeOrgid(orgid);
  return normalized ? `${key}:${normalized}` : key;
}

function getCookieValue(key) {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(key)}=`;
  const item = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!item) return null;
  try {
    return decodeURIComponent(item.slice(prefix.length));
  } catch {
    return null;
  }
}

function setCookieValue(key, value) {
  if (typeof document === "undefined") return;
  document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}${getCookieAttributes()}`;
}

function removeCookieValue(key) {
  if (typeof document === "undefined") return;
  const domain = getCookieDomain();
  const secure = window.location.protocol === "https:";
  document.cookie = `${encodeURIComponent(key)}=; Path=/; Max-Age=0${domain}${secure ? "; SameSite=None; Secure" : "; SameSite=Lax"}`;
}

function getValue(key) {
  const local = getStorage("localStorage");
  const session = getStorage("sessionStorage");
  return session?.getItem(key) || local?.getItem(key) || getCookieValue(key) || null;
}

function getSessionValue(key) {
  const session = getStorage("sessionStorage");
  const local = getStorage("localStorage");
  return session?.getItem(key) || local?.getItem(key) || getCookieValue(key) || null;
}

function setValue(key, value, { persistent = true } = {}) {
  const normalized = String(value);
  if (persistent) {
    getStorage("localStorage")?.setItem(key, normalized);
  } else {
    getStorage("localStorage")?.removeItem(key);
  }
  getStorage("sessionStorage")?.setItem(key, normalized);
  setCookieValue(key, normalized);
}

function removeValue(key) {
  getStorage("localStorage")?.removeItem(key);
  getStorage("sessionStorage")?.removeItem(key);
  removeCookieValue(key);
}

export function migrateAuthStorage() {
  syncAuthSession();
}

export function syncAuthSession() {
  const storedOrgid = normalizeOrgid(getValue(ORGID_KEY));
  const orgid = getUrlOrgid();
  const legacyToken = getSessionValue(SESSION_TOKEN_KEY);
  const legacyVerified = getSessionValue(AUTH_VERIFIED_KEY);

  if (!orgid) return;

  setValue(ORGID_KEY, orgid);

  const tokenKey = scopedKey(SESSION_TOKEN_KEY, orgid);
  const verifiedKey = scopedKey(AUTH_VERIFIED_KEY, orgid);
  const scopedToken = getSessionValue(tokenKey);
  const canUseLegacyToken = storedOrgid === orgid && !!legacyToken;

  if (!scopedToken && canUseLegacyToken) {
    setValue(tokenKey, legacyToken);
    if (legacyVerified) setValue(verifiedKey, legacyVerified);
  }

  const sessionToken = getSessionValue(tokenKey) || (canUseLegacyToken ? legacyToken : null);
  const verified = getSessionValue(verifiedKey) || (canUseLegacyToken ? legacyVerified : null);

  if (sessionToken) {
    setValue(SESSION_TOKEN_KEY, sessionToken);
    if (verified) setValue(AUTH_VERIFIED_KEY, verified);
  } else {
    removeValue(SESSION_TOKEN_KEY);
    removeValue(AUTH_VERIFIED_KEY);
  }
}

export function getOrgid() {
  return getUrlOrgid();
}

export function getActiveOrgid() {
  return normalizeOrgid(getValue(ORGID_KEY));
}

export function getSessionToken(orgid = getOrgid()) {
  const normalizedOrgid = normalizeOrgid(orgid);
  if (!normalizedOrgid) return null;
  const scopedToken = getSessionValue(scopedKey(SESSION_TOKEN_KEY, normalizedOrgid));
  if (scopedToken) return scopedToken;
  return getActiveOrgid() === normalizedOrgid ? getSessionValue(SESSION_TOKEN_KEY) : null;
}

export function isAuthVerified(orgid = getOrgid()) {
  const normalizedOrgid = normalizeOrgid(orgid);
  if (!normalizedOrgid || !getSessionToken(normalizedOrgid)) return false;
  const scopedVerified = getSessionValue(scopedKey(AUTH_VERIFIED_KEY, normalizedOrgid));
  if (scopedVerified === "1") return true;
  return getActiveOrgid() === normalizedOrgid && getSessionValue(AUTH_VERIFIED_KEY) === "1";
}

export function setAuthSession(orgid, sessionToken) {
  const normalizedOrgid = normalizeOrgid(orgid);
  if (!normalizedOrgid) return;
  setValue(ORGID_KEY, normalizedOrgid);

  if (!sessionToken) {
    clearAuthSession(normalizedOrgid);
    return;
  }

  setValue(scopedKey(SESSION_TOKEN_KEY, normalizedOrgid), sessionToken);
  setValue(scopedKey(AUTH_VERIFIED_KEY, normalizedOrgid), "1");
  setValue(SESSION_TOKEN_KEY, sessionToken);
  setValue(AUTH_VERIFIED_KEY, "1");
}

export function clearAuthSession(orgid = getOrgid()) {
  const normalizedOrgid = normalizeOrgid(orgid);
  if (normalizedOrgid) {
    removeValue(scopedKey(SESSION_TOKEN_KEY, normalizedOrgid));
    removeValue(scopedKey(AUTH_VERIFIED_KEY, normalizedOrgid));
  }
  if (!normalizedOrgid || getActiveOrgid() === normalizedOrgid) {
    removeValue(ORGID_KEY);
    removeValue(AUTH_VERIFIED_KEY);
    removeValue(SESSION_TOKEN_KEY);
  }
}

export function setPostAuthRedirect(path) {
  if (!path || path.startsWith("/install") || path.startsWith("/oauth")) return;
  const orgid = getOrgid();
  if (orgid) {
    getStorage("localStorage")?.setItem(scopedKey(POST_AUTH_REDIRECT_KEY, orgid), path);
  }
  getStorage("localStorage")?.setItem(POST_AUTH_REDIRECT_KEY, path);
}

export function consumePostAuthRedirect(orgid = getOrgid()) {
  const redirectKey = orgid ? scopedKey(POST_AUTH_REDIRECT_KEY, orgid) : POST_AUTH_REDIRECT_KEY;
  const value =
    getStorage("localStorage")?.getItem(redirectKey) ||
    (!orgid ? getStorage("localStorage")?.getItem(POST_AUTH_REDIRECT_KEY) : null);
  getStorage("localStorage")?.removeItem(redirectKey);
  getStorage("localStorage")?.removeItem(POST_AUTH_REDIRECT_KEY);
  if (!value || value.startsWith("/install") || value.startsWith("/oauth")) {
    return null;
  }
  return value;
}
