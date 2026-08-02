import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, Component, lazy, Suspense } from "react";
import { reportClientError } from "./common/ErrorReporter";
import { exchangeHandoff } from "./common/ApiService";
import {
  clearAuthSession,
  getOrgid,
  isAuthVerified,
  migrateAuthStorage,
  setAuthSession,
  setPostAuthRedirect,
  syncAuthSession,
} from "./common/AuthStorage";
import { resetClientCache } from "./common/queryClient";
import { canAccessOpsPage } from "./common/DevGate";

/* ── Lazy pages ── */
const Login = lazy(() => import("./pages/auth/login/index"));
const GrandService = lazy(() => import("./pages/auth/grandservice/index"));
const DashboardPage = lazy(() => import("./pages/dashboard/index"));
const ReviewsPage = lazy(() => import("./pages/reviews/index"));
const QnaPage = lazy(() => import("./pages/qna/index"));
const SettingsPage = lazy(() => import("./pages/settings/index"));
const GuidePage = lazy(() => import("./pages/guide/index"));
const DevGuidePage = lazy(() => import("./pages/dev/index"));
const ContactPage = lazy(() => import("./pages/contact/index"));
const OpsPage = lazy(() => import("./pages/ops/index"));

function DevOnlyOpsPage() {
  const location = useLocation();
  if (!canAccessOpsPage(location.search)) {
    return <Navigate to={`/${location.search}`} replace />;
  }
  return <OpsPage />;
}

const PageLoader = () => (
  <div className="f1g-route-loader" role="status" aria-live="polite" aria-label="Đang tải">
    <div className="f1g-route-spinner" aria-hidden="true" />
  </div>
);

const isPublicPath = (pathname) =>
  pathname.startsWith("/install") || pathname.startsWith("/oauth");

function OrgidUrlKeeper() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isPublicPath(location.pathname)) return;
    syncAuthSession();
    const orgid = getOrgid();
    if (!orgid || !isAuthVerified()) return;

    const params = new URLSearchParams(location.search);
    let changed = false;
    if (!params.get("orgid")) {
      params.set("orgid", orgid);
      changed = true;
    }
    if (params.get("session_token")) {
      params.delete("session_token");
      changed = true;
    }
    if (params.get("handoff_code")) {
      params.delete("handoff_code");
      changed = true;
    }
    if (!changed) return;

    const query = params.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}${location.hash}`, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}

/* ── Error Boundary ── */
class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    reportClientError("ErrorBoundary", error, { componentStack: info?.componentStack });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="f1g-error-shell">
          <div className="f1g-error-panel" role="alert">
            <h1>Đã xảy ra lỗi</h1>
            <p>Trang gặp sự cố. Vui lòng tải lại.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

let handoffExchangeInFlight = false;

// One-time handoff code from the OAuth redirect URL → session token via
// POST /api/auth/session/exchange. Never stores the token in the URL.
async function consumeHandoffFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const orgid = params.get("orgid");
  const handoff = params.get("handoff_code");
  if (!orgid || !handoff || handoffExchangeInFlight) return false;
  handoffExchangeInFlight = true;
  try {
    const result = await exchangeHandoff(handoff);
    if (result?.ok && result?.storeDomain && result?.sessionToken) {
      setAuthSession(result.storeDomain, result.sessionToken);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("handoff_code");
      window.history.replaceState({}, "", nextUrl.pathname + nextUrl.search + nextUrl.hash);
      return true;
    }
  } catch {
    // Expired/consumed code — the auth effect below redirects to login.
  } finally {
    handoffExchangeInFlight = false;
  }
  return false;
}

function App() {
  const pathname = window.location.pathname;
  const isAuthPage = isPublicPath(pathname);
  syncAuthSession();
  const lastOrgidRef = useRef(getOrgid());

  const currentOrgid = getOrgid();
  const authVerified = isAuthVerified();

  useEffect(() => {
    migrateAuthStorage();
    lastOrgidRef.current = getOrgid();
  }, []);

  useEffect(() => {
    if (isAuthPage) return;
    consumeHandoffFromUrl();

    const searchParams = new URLSearchParams(window.location.search);
    const pOrgid = searchParams.get("orgid");
    const pShop = searchParams.get("shop");
    const pSessionToken = searchParams.get("session_token");
    const sOrgid = getOrgid();
    const verified = isAuthVerified();

    if (pOrgid && pSessionToken) {
      setAuthSession(pOrgid, pSessionToken);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("session_token");
      window.history.replaceState({}, "", nextUrl.pathname + nextUrl.search + nextUrl.hash);
      return;
    }

    if (pOrgid && sOrgid && pOrgid !== sOrgid) {
      void resetClientCache();
      clearAuthSession();
      const loginParams = new URLSearchParams({ orgid: pOrgid });
      if (pShop) loginParams.set("shop", pShop);
      window.location.href = `/install/login?${loginParams.toString()}`;
      return;
    }

    if (lastOrgidRef.current && sOrgid && lastOrgidRef.current !== sOrgid) {
      void resetClientCache();
    }
    lastOrgidRef.current = sOrgid;

    if (!verified || !sOrgid) {
      setPostAuthRedirect(window.location.pathname + window.location.search + window.location.hash);
      const loginParams = new URLSearchParams();
      if (pOrgid) loginParams.set("orgid", pOrgid);
      if (pShop) loginParams.set("shop", pShop);
      const loginQuery = loginParams.toString();
      window.location.href = loginQuery ? `/install/login?${loginQuery}` : "/install/login";
      return;
    }

    if (verified && sOrgid && pOrgid) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("session_token");
      nextUrl.searchParams.delete("handoff_code");
      window.history.replaceState({}, "", nextUrl.pathname + nextUrl.search + nextUrl.hash);
    }
  }, [isAuthPage]);

  if (!isAuthPage && (!currentOrgid || !authVerified)) {
    return null;
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <OrgidUrlKeeper />
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/qna" element={<QnaPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="/dev" element={<DevGuidePage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/health" element={<DevOnlyOpsPage />} />
          <Route path="/ops" element={<DevOnlyOpsPage />} />
          <Route path="/install/login" element={<Login />} />
          <Route path="/install/grandservice" element={<GrandService />} />
          <Route path="*" element={<Navigate to={`/${window.location.search}`} replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
