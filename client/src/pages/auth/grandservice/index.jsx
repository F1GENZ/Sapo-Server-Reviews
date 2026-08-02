import { useEffect, useRef, useState } from "react";
import { authService } from "../../../common/AuthService";
import {
  extractAuthFromRedirect,
  getAuthenticatedRedirect,
  redirectIfChanged,
  sanitizeInternalRedirect,
  stripCallbackParams,
} from "../../../common/authFlow";
import {
  getActiveOrgid,
  setAuthSession,
} from "../../../common/AuthStorage";
import { resetClientCache } from "../../../common/queryClient";
import AuthScreen from "../AuthScreen";

const GrandService = () => {
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

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const orgid = params.get("orgid");
    const sessionToken = params.get("session_token");

    if (orgid && sessionToken) {
      stripCallbackParams();
      void activateOrgSession(orgid, sessionToken).then(() => {
        redirectIfChanged(getAuthenticatedRedirect(orgid), { replace: true });
      });
      return;
    }

    if (code) {
      stripCallbackParams();
      authService
        .install(code)
        .then(async (response) => {
          if (response.data?.orgid && response.data?.sessionToken) {
            await activateOrgSession(response.data.orgid, response.data.sessionToken);
            redirectIfChanged(
              getAuthenticatedRedirect(response.data.orgid) ||
                sanitizeInternalRedirect(response.data.url || "/", response.data.orgid),
              { replace: true },
            );
            return;
          }

          if (response.data && response.data.url) {
            const auth = await persistAuthSession(response.data.url, null, response.data.sessionToken);
            redirectIfChanged(
              auth
                ? getAuthenticatedRedirect(auth.orgid)
                : response.data.url,
              { replace: true },
            );
          }
        })
        .catch(() => {
          window.location.href = "/install/login";
        });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 12000);
    return () => clearTimeout(timer);
  }, []);

  if (timedOut) {
    return (
      <AuthScreen
        status="warning"
        title="Cai dat khong thanh cong"
        message="Vui long thu lai tu trang quan tri Haravan."
        actionLabel="Ve trang dang nhap"
        onAction={() => { window.location.href = "/install/login"; }}
      />
    );
  }

  return <AuthScreen title="Dang cai dat…" message="Vui long chờ trong giay lat." />;
};

export default GrandService;
