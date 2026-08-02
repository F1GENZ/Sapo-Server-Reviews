import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ConfigProvider, Layout, Menu, Typography, Tag, theme, Button } from "antd";
import {
  HomeOutlined,
  StarOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  BookOutlined,
  CodeOutlined,
  CustomerServiceOutlined,
  ShopOutlined,
  HeartOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  MenuOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { fetchAppSession } from "../../common/ApiService";
import { getOrgid } from "../../common/AuthStorage";
import { APP_ANTD_THEME } from "../../common/antdTheme";
import { BUILD_INFO } from "../../common/BuildInfo";
import { shopQueryKeys } from "../../common/queryKeys";
import { ToastProvider } from "../../common/toast";
import { canAccessOpsPage } from "../../common/DevGate";
import { useOrgNavigate } from "../../hooks/useOrgRoute";

const { Sider, Content } = Layout;
const { Text } = Typography;

const SIDER_WIDTH = 260;
const MOBILE_BP = 768;
const SIDEBAR_BG = "#001529";
const SIDEBAR_BORDER = "rgba(255, 255, 255, 0.10)";
const CONTENT_MAX_WIDTH = 1560;

const getPlanLabel = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "trial") return "Dùng thử";
  if (normalized === "active") return "Đang hoạt động";
  if (normalized === "pro") return "Pro";
  return status;
};

const getDisplayPlan = (shopInfo) =>
  shopInfo?.plan || shopInfo?.status || "";

const getPlanTagStyle = (status, token) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "pro") {
    return {
      color: "#fff7cc",
      borderColor: "rgba(253, 230, 138, 0.62)",
      background: "rgba(254, 243, 199, 0.15)",
      boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.20)",
      fontWeight: 700,
    };
  }
  if (normalized === "trial") {
    return {
      color: token.colorPrimary,
      borderColor: token.colorPrimaryBorder,
      background: token.colorPrimaryBg,
      fontWeight: 600,
    };
  }
  if (normalized === "active") {
    return {
      color: token.colorSuccessText,
      borderColor: token.colorSuccessBorder,
      background: token.colorSuccessBg,
      fontWeight: 600,
    };
  }
  return {};
};

const menuItems = [
  { key: "/", icon: <HomeOutlined />, label: "Tổng quan" },
  { key: "/reviews", icon: <StarOutlined />, label: "Đánh giá" },
  { key: "/qna", icon: <QuestionCircleOutlined />, label: "Hỏi đáp" },
  { key: "/settings", icon: <SettingOutlined />, label: "Cấu hình" },
  { key: "/guide", icon: <BookOutlined />, label: "Hướng dẫn" },
  { key: "/contact", icon: <CustomerServiceOutlined />, label: "Liên hệ" },
  { key: "/dev", icon: <CodeOutlined />, label: "Dev guide" },
];

const getMenuItems = (search) =>
  canAccessOpsPage(search)
    ? [...menuItems, { key: "/health", icon: <HeartOutlined />, label: "Health" }]
    : menuItems;

const AdminLayoutContent = ({ children }) => {
  const location = useLocation();
  const navigate = useOrgNavigate();
  const { token } = theme.useToken();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`).matches
      : false
  ));

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`);
    const onChange = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) setMobileOpen(false);
    };
    setIsMobile(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (isMobile) setMobileOpen(false);
  }, [location.pathname, isMobile]);

  const orgid = getOrgid();
  const visibleMenuItems = getMenuItems(location.search);
  const { data: shopInfo } = useQuery({
    queryKey: shopQueryKeys.shopInfo(orgid),
    queryFn: fetchAppSession,
    staleTime: 5 * 60_000,
    enabled: !!orgid,
  });
  const displayPlan = getDisplayPlan(shopInfo);
  const isProPlan = String(displayPlan).toLowerCase() === "pro";

  const selectedKey =
    visibleMenuItems.filter((item) => item.key !== "/").find((item) =>
      location.pathname.startsWith(item.key),
    )?.key || (location.pathname === "/" ? "/" : "/");

  return (
    <Layout className="f1g-admin-layout" style={{ minHeight: "100vh", background: "#f5f7fb" }}>
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9,
            background: "rgba(0,0,0,0.35)",
            transition: "opacity 0.2s",
          }}
        />
      )}

      {isMobile && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 48,
            zIndex: 8,
            background: SIDEBAR_BG,
            borderBottom: `1px solid ${SIDEBAR_BORDER}`,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            gap: 10,
          }}
        >
          <Button
            type="text"
            icon={mobileOpen ? <CloseOutlined /> : <MenuOutlined />}
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="Toggle menu"
            style={{ color: "#fff" }}
          />
          <StarOutlined style={{ fontSize: 16, color: "#60a5fa" }} />
          <Text strong style={{ fontSize: 14, color: "#fff" }}>
            F1GENZ Review
          </Text>
        </div>
      )}

      <Sider
        width={SIDER_WIDTH}
        theme="dark"
        className="f1g-admin-sider"
        style={{
          borderRight: `1px solid ${SIDEBAR_BORDER}`,
          background: SIDEBAR_BG,
          overflow: "auto",
          position: "fixed",
          left: isMobile ? (mobileOpen ? 0 : -SIDER_WIDTH) : 0,
          top: isMobile ? 48 : 0,
          bottom: 0,
          zIndex: 10,
          transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow:
            isMobile && mobileOpen ? "4px 0 16px rgba(0,0,0,0.1)" : "none",
        }}
      >
        {!isMobile && (
          <div
            style={{
              padding: "12px",
              borderBottom: `1px solid ${SIDEBAR_BORDER}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              background: SIDEBAR_BG,
            }}
            onClick={() => navigate("/")}
            role="button"
            tabIndex={0}
            aria-label="Trang chủ F1GENZ Review"
            onKeyDown={(event) => event.key === "Enter" && navigate("/")}
          >
            <StarOutlined
              style={{ fontSize: 20, color: "#60a5fa" }}
            />
            <Text strong style={{ fontSize: 15, color: "#fff" }}>
              F1GENZ Review
            </Text>
          </div>
        )}

        <Menu
          theme="dark"
          className="f1g-admin-menu"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={visibleMenuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, marginTop: 6, background: SIDEBAR_BG }}
        />

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "12px",
            borderTop: `1px solid ${SIDEBAR_BORDER}`,
            background: SIDEBAR_BG,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 0,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "linear-gradient(135deg, #1677ff, #0958d9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ShopOutlined style={{ color: "#fff", fontSize: 14 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {shopInfo?.storeDomain ? (
                <a
                  href={`https://${shopInfo.storeDomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#fff",
                    display: "block",
                    lineHeight: 1.3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={shopInfo.storeDomain}
                >
                  {shopInfo.storeDomain}
                </a>
              ) : (
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#fff",
                    display: "block",
                    lineHeight: 1.3,
                  }}
                >
                  {orgid || "Shop"}
                </Text>
              )}
              {displayPlan && (
                <Tag
                  style={{
                    fontSize: 10,
                    lineHeight: "18px",
                    padding: "0 7px",
                    margin: "3px 0 0",
                    borderRadius: 5,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    letterSpacing: 0,
                    ...getPlanTagStyle(displayPlan, token),
                  }}
                >
                  {isProPlan && (
                    <img
                      src="https://cdn.hstatic.net/files/1000405253/file/diamond.png"
                      alt="Pro"
                      style={{
                        width: 11,
                        height: 11,
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  )}
                  {getPlanLabel(displayPlan)}
                </Tag>
              )}
            </div>
          </div>

          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: `1px dashed ${SIDEBAR_BORDER}`,
            }}
          >
            <Text
              type="secondary"
              style={{ display: "block", fontSize: 11, lineHeight: 1.5, color: "rgba(255, 255, 255, 0.64)" }}
              title={BUILD_INFO.buildTimeRaw || undefined}
            >
              Build lúc {BUILD_INFO.buildTime}
            </Text>
          </div>
        </div>
      </Sider>

      <Layout
        style={{
          marginLeft: isMobile ? 0 : SIDER_WIDTH,
          paddingTop: isMobile ? 48 : 0,
          background: "#f5f7fb",
          transition: "margin-left 0.25s",
        }}
      >
        <Content style={{ padding: isMobile ? 14 : 24, minHeight: "100vh", minWidth: 0 }}>
          <div
            className="f1g-admin-content-shell"
            style={{
              width: "100%",
              maxWidth: CONTENT_MAX_WIDTH,
              margin: "0 auto",
            }}
          >
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

const AdminLayout = ({ children }) => (
  <ConfigProvider theme={APP_ANTD_THEME}>
    <ToastProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </ToastProvider>
  </ConfigProvider>
);

export default AdminLayout;
