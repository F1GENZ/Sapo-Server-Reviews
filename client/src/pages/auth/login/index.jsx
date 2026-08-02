import { useEffect, useRef, useState } from "react";
import { authService } from "../../../common/AuthService";
import { exchangeHandoff } from "../../../common/ApiService";
import {
  extractAuthFromRedirect,
  getAuthenticatedRedirect,
  isInternalLoginRedirect,
  redirectIfChanged,
  stripCallbackParams,
} from "../../../common/authFlow";
import { getErrorMessage } from "../../../common/getErrorMessage";
import {
  getActiveOrgid,
  getOrgid,
  isAuthVerified,
  setAuthSession,
  syncAuthSession,
} from "../../../common/AuthStorage";
import { resetClientCache } from "../../../common/queryClient";
import AuthScreen from "../AuthScreen";

const Login = () => {
  const [authError, setAuthError] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const startedRef = useRef(false);

  const activateOrgSession = async (orgid, sessionToken) => {
    const previousOrgid = getActiveOrgid();
    if (previousOrgid && previousOrgid !== orgid) {
      await resetClientCache();
    }
    setAuthSession(orgid, sessionToken);
  };

  const persistAuthSession = async (redirectUrl, fallbackOrgid, fallbackToken) => {
    const auth = extractAuthFromRedirect(redirectUrl, fallbackOrgid, fallbackToken);
    if (auth) {
      await activateOrgSession(auth.orgid, auth.sessionToken);
      return auth;
    }
    return null;
  };

  const authenticateAndRedirect = async (orgid, sessionToken) => {
    if (!sessionToken) {
      startAuthEntry(orgid);
      return;
    }
    await activateOrgSession(orgid, sessionToken);
    window.location.href = getAuthenticatedRedirect(orgid);
  };

  const exchangeHandoffInLogin = async (orgid, handoff) => {
    try {
      const result = await exchangeHandoff(handoff);
      if (result?.ok && result?.storeDomain && result?.sessionToken) {
        await authenticateAndRedirect(result.storeDomain, result.sessionToken);
        return;
      }
      setAuthError("Khong tao duoc phien dang nhap. Vui long mo lai app tu Haravan va thu lai.");
    } catch (error) {
      setAuthError(getErrorMessage(error, "Xac thuc that bai. Vui long thu lai."));
    }
  };

  const startLegacyLogin = (orgidParam, shopParam) => {
    authService
      .login(orgidParam || "", shopParam || "")
      .then((response) => {
        if (response.status === 200 && response.data) {
          redirectIfChanged(response.data);
          return;
        }

        setAuthError("Khong the khoi tao dang nhap Haravan.");
      })
      .catch((error) => {
        setAuthError(getErrorMessage(error, "Khong the ket noi den dich vu xac thuc."));
      });
  };

  const startAuthEntry = (orgidParam, shopParam) => {
    authService
      .entry(orgidParam || "", shopParam || "")
      .then(async (response) => {
        const entry = response.data || {};
        if (entry.status === "ready" && entry.orgid && entry.sessionToken) {
          await authenticateAndRedirect(entry.orgid, entry.sessionToken);
          return;
        }
        if (entry.url) {
          redirectIfChanged(entry.url);
          return;
        }
        setAuthError(entry.reason || "Khong the khoi tao dang nhap Haravan.");
      })
      .catch((error) => {
        if (error.response?.status === 404) {
          startLegacyLogin(orgidParam, shopParam);
          return;
        }
        setAuthError(getErrorMessage(error, "Khong the ket noi den dich vu xac thuc."));
      });
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const hmac = params.get("hmac");
    const state = params.get("state");
    const idToken = params.get("id_token");
    const authCallback = params.get("auth_callback");
    const errorCode = params.get("error");
    const errorMessage = params.get("message");
    const orgidParam = params.get("orgid") || getOrgid();
    const shopParam = params.get("shop");

    if (errorCode) {
      if (errorCode === "install_failed") {
        setAuthError("Cai dat app that bai. Vui long mo lai app tu Haravan va thu lai.");
        return;
      }

      if (errorCode === "oauth_callback_failed") {
        setAuthError(errorMessage || "Xac thuc OAuth that bai. Vui long thu lai.");
        return;
      }

      setAuthError(errorMessage || "Khong the xac thuc. Vui long thu lai.");
      return;
    }

    const sessionTokenParam = params.get("session_token");
    const handoffParam = params.get("handoff_code");

    if (orgidParam && sessionTokenParam) {
      void authenticateAndRedirect(orgidParam, sessionTokenParam);
      return;
    }

    if (orgidParam && handoffParam) {
      void exchangeHandoffInLogin(orgidParam, handoffParam);
      return;
    }

    syncAuthSession();
    const storedOrgid = getOrgid();
    if (!code && !hmac && isAuthVerified() && storedOrgid && (!orgidParam || orgidParam === storedOrgid)) {
      redirectIfChanged(getAuthenticatedRedirect(storedOrgid), { replace: true });
      return;
    }

    if (!code && !hmac && authCallback === "1") {
      setAuthError("Khong tao duoc phien dang nhap. Vui long mo lai app tu Haravan va thu lai.");
      return;
    }

    if (hmac && !code) {
      authService
        .verifyHmac(window.location.search.replace(/^\?/, ""))
        .then((response) => {
          if (response.data?.valid && response.data?.orgid && response.data?.sessionToken) {
            void authenticateAndRedirect(response.data.orgid, response.data.sessionToken);
          } else {
            startAuthEntry(orgidParam, shopParam);
          }
        })
        .catch(() => {
          startAuthEntry(orgidParam, shopParam);
        });
      return;
    }

    if (code) {
      stripCallbackParams({ markAuthCallback: true });
      authService
        .verifyLogin({
          code,
          ...(state ? { state } : {}),
          ...(idToken ? { id_token: idToken } : {}),
        })
        .then(async (response) => {
          if (response.data?.orgid && response.data?.sessionToken) {
            await activateOrgSession(response.data.orgid, response.data.sessionToken);
            redirectIfChanged(getAuthenticatedRedirect(response.data.orgid), { replace: true });
            return;
          }

          if (response.data?.url) {
            const auth = await persistAuthSession(response.data.url, orgidParam, response.data.sessionToken);
            if (auth) {
              redirectIfChanged(getAuthenticatedRedirect(auth.orgid), { replace: true });
              return;
            }
            if (isInternalLoginRedirect(response.data.url)) {
              setAuthError("Khong tao duoc phien dang nhap. Vui long mo lai app tu Haravan va thu lai.");
              return;
            }
            redirectIfChanged(response.data.url, { replace: true });
            return;
          }

          setAuthError("Khong nhan duoc URL chuyen huong sau khi xac thuc.");
        })
        .catch((error) => {
          setAuthError(getErrorMessage(error, "Xac thuc OAuth that bai. Vui long thu lai."));
        });
      return;
    }

    startAuthEntry(orgidParam, shopParam);
  }, []);

  useEffect(() => {
    if (authError) return undefined;
    const timer = setTimeout(() => setTimedOut(true), 12000);
    return () => clearTimeout(timer);
  }, [authError]);

  if (authError) {
    return (
      <AuthScreen
        status="error"
        title="Xac thuc khong thanh cong"
        message={authError}
        actionLabel="Thu lai"
        onAction={() => { window.location.href = "/install/login"; }}
      />
    );
  }

  if (timedOut) {
    return (
      <AuthScreen
        status="warning"
        title="Khong the ket noi"
        message="Xac thuc mat qua lau. Vui long kiem tra ket noi va thu lai."
        actionLabel="Thu lai"
        onAction={() => window.location.reload()}
      />
    );
  }

  return <AuthScreen />;
};

export default Login;
