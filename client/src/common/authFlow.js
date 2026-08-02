import { consumePostAuthRedirect } from "./AuthStorage";

const AUTH_CALLBACK_PARAMS = [
  "handoff_code",
  "session_token",
  "code",
  "state",
  "scope",
  "session_state",
  "id_token",
  "auth_callback",
];

export function sanitizeInternalRedirect(targetUrl, orgid) {
  let next;
  try {
    next = new URL(targetUrl || "/", window.location.origin);
  } catch {
    next = new URL("/", window.location.origin);
  }
  if (next.origin !== window.location.origin) {
    next = new URL("/", window.location.origin);
  }
  if (orgid) next.searchParams.set("orgid", orgid);
  AUTH_CALLBACK_PARAMS.forEach((key) => next.searchParams.delete(key));
  return next.pathname + next.search + next.hash;
}

export function getAuthenticatedRedirect(orgid) {
  return sanitizeInternalRedirect(consumePostAuthRedirect(orgid) || "/", orgid);
}

export function redirectIfChanged(targetUrl, { replace = false } = {}) {
  if (!targetUrl) return;
  const current = new URL(window.location.href);
  const next = new URL(targetUrl, window.location.origin);

  if (current.href === next.href) return;
  if (replace) {
    window.location.replace(next.href);
    return;
  }
  window.location.href = next.href;
}

export function isInternalLoginRedirect(targetUrl) {
  try {
    const next = new URL(targetUrl || "", window.location.origin);
    return next.origin === window.location.origin && next.pathname === "/install/login";
  } catch {
    return false;
  }
}

export function extractAuthFromRedirect(redirectUrl, fallbackOrgid, fallbackToken) {
  if (!redirectUrl) return null;

  try {
    const parsedUrl = new URL(redirectUrl, window.location.origin);
    const orgidFromUrl = parsedUrl.searchParams.get("orgid");
    const tokenFromUrl = parsedUrl.searchParams.get("session_token");
    const resolvedOrgid =
      orgidFromUrl && orgidFromUrl !== "null" && orgidFromUrl !== "undefined"
        ? orgidFromUrl
        : fallbackOrgid;
    const resolvedToken = tokenFromUrl || fallbackToken;
    return resolvedOrgid && resolvedToken
      ? { orgid: resolvedOrgid, sessionToken: resolvedToken }
      : null;
  } catch {
    return null;
  }
}

export function stripCallbackParams({ markAuthCallback = false } = {}) {
  const nextUrl = new URL(window.location.href);
  AUTH_CALLBACK_PARAMS
    .filter((key) => key !== "auth_callback")
    .forEach((key) => nextUrl.searchParams.delete(key));
  if (markAuthCallback) nextUrl.searchParams.set("auth_callback", "1");
  else nextUrl.searchParams.delete("auth_callback");
  window.history.replaceState({}, "", nextUrl.pathname + nextUrl.search + nextUrl.hash);
}
