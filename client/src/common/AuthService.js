import httpClient from "../config/AxiosConfig";

class AuthService {
  buildLoginQuery(orgid, shop) {
    const params = new URLSearchParams();
    params.set("redirect", "1");
    if (orgid) params.set("orgid", orgid);
    if (shop) params.set("shop", shop);
    return params.toString() ? `?${params.toString()}` : "";
  }

  async login(orgid, shop) {
    return await httpClient.get(`/api/oauth/install/login${this.buildLoginQuery(orgid, shop)}`);
  }

  async entry(orgid, shop) {
    return await httpClient.get(`/api/oauth/install/login/entry${this.buildLoginQuery(orgid, shop)}`, {
      skipRetry: true,
    });
  }

  /**
   * Verify Haravan admin HMAC — if valid, skip full OAuth.
   * Uses raw fetch (not httpClient) to avoid interceptor adding orgid param
   * which would corrupt the HMAC query string order.
   */
  async verifyHmac(queryString) {
    const res = await fetch(
      `/api/oauth/install/login/verify-hmac?${queryString}`,
      { headers: { Accept: "application/json" } },
    );
    return { data: await res.json() };
  }

  async install(code) {
    return await httpClient.get(`/api/oauth/install/grandservice?code=${encodeURIComponent(code)}`);
  }

  async verifyLogin(payload) {
    const body = new URLSearchParams();
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        body.set(key, String(value));
      }
    });
    return await httpClient.post("/api/oauth/install/login/callback", body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }
}

export const authService = new AuthService();
