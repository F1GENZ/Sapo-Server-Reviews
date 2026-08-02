import axios from "axios";
import { reportClientError } from "../common/ErrorReporter";
import {
  clearAuthSession,
  getOrgid,
  getSessionToken,
  setPostAuthRedirect,
  syncAuthSession,
} from "../common/AuthStorage";

const httpClient = axios.create({
  baseURL: "", // Force relative URLs (/api/...) for Cloudflare proxy
  timeout: 12000,
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  withCredentials: true,
});

// Request interceptor — attach orgid
httpClient.interceptors.request.use(
  async (config) => {
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      if (typeof config.headers?.delete === "function") {
        config.headers.delete("Content-Type");
      } else if (config.headers) {
        delete config.headers["Content-Type"];
        delete config.headers["content-type"];
      }
    }

    const isOAuthRequest =
      typeof config.url === "string" && config.url.startsWith("/api/oauth/");

    if (!isOAuthRequest) {
      syncAuthSession();
      const currentParams =
        config.params instanceof URLSearchParams
          ? Object.fromEntries(config.params.entries())
          : { ...(config.params || {}) };
      const urlOrgid = new URLSearchParams(window.location.search).get("orgid");
      const orgid = currentParams.orgid || urlOrgid || getOrgid();
      if (Object.prototype.hasOwnProperty.call(currentParams, "orgid")) {
        const { orgid: _orgid, ...paramsWithoutOrgid } = currentParams;
        config.params = paramsWithoutOrgid;
      }
      if (orgid) {
        config.headers["x-orgid"] = orgid;
        config.headers.orgid = orgid;
      }

      // This bearer token is the internal app session JWT from our backend.
      // It is distinct from the Haravan access token, which remains server-side.
      const sessionToken = getSessionToken();
      if (sessionToken) {
        config.headers.Authorization = `Bearer ${sessionToken}`;
      }
    }
    return config;
  },
  (err) => Promise.reject(err)
);

// Response interceptor — handle 401
httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config || {};
    const status = error.response?.status;

    const retryableStatus = [408, 500, 502, 503, 504];
    const isIdempotent = !config.method || ["get", "head", "options"].includes(config.method.toLowerCase());
    const shouldRetry =
      !config.skipRetry &&
      isIdempotent &&
      (!status ||
      retryableStatus.includes(status) ||
      error.code === "ECONNABORTED");

    config.__retryCount = config.__retryCount || 0;

    if (shouldRetry && config.__retryCount < 2) {
      config.__retryCount += 1;
      const retryAfterHeader =
        error.response?.headers?.["retry-after"] ??
        error.response?.headers?.["Retry-After"] ??
        (typeof error.response?.headers?.get === "function"
          ? error.response.headers.get("retry-after")
          : undefined);
      const retryAfterSeconds = Number(Array.isArray(retryAfterHeader)
        ? retryAfterHeader[0]
        : retryAfterHeader);
      const retryAfterDelay =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : null;
      const delay = retryAfterDelay ?? 1500 * Math.pow(2, config.__retryCount - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return httpClient(config);
    }

    if (error.response?.status === 401) {
      const orgid =
        getOrgid() ||
        new URLSearchParams(window.location.search).get("orgid");

      setPostAuthRedirect(window.location.pathname + window.location.search + window.location.hash);
      clearAuthSession(orgid);
      window.location.href = orgid
        ? `/install/login?orgid=${encodeURIComponent(orgid)}`
        : `/install/login`;

      return new Promise(() => {});
    }

    reportClientError("axios", error, {
      url: config.url,
      method: config.method,
      retryCount: config.__retryCount || 0,
    });

    return Promise.reject(error);
  }
);

export default httpClient;
