import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Checkbox, Flex, List, Modal, Popconfirm, Select, Tag, Typography } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import {
  applyThemeInstall,
  fetchInstallThemes,
  planThemeInstall,
  uninstallThemeInstall,
} from "../../common/ApiService";
import { getStoreDomain } from "../../common/AuthStorage";
import { navigateTopLevel, parseStoreDomainInput } from "../../common/authFlow";
import { getErrorMessage } from "../../common/getErrorMessage";
import { shopQueryKeys } from "../../common/queryKeys";
import { toast } from "../../common/toast";

const { Text, Paragraph } = Typography;

const TARGET_LABEL = {
  loader: "Loader CSS/JS (layout)",
  widget: "Khối đánh giá (trang sản phẩm)",
  badge: "Badge số sao (thẻ sản phẩm)",
};

const STATUS_TAG = {
  insert: { color: "green", text: "Sẽ chèn" },
  present: { color: "blue", text: "Đã có" },
  skipped: { color: "default", text: "Bỏ qua" },
};

const ManualPaste = ({ manual }) => (
  <Flex vertical gap={4} style={{ marginTop: 6 }}>
    <Text type="secondary">{manual.instruction}</Text>
    <Paragraph copyable={{ text: manual.code }} style={{ marginBottom: 0 }}>
      <pre
        style={{
          margin: 0,
          padding: 8,
          background: "#fafafa",
          border: "1px solid #f0f0f0",
          borderRadius: 6,
          fontSize: 12,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {manual.code}
      </pre>
    </Paragraph>
  </Flex>
);

const ROLE_TAG = {
  main: { color: "red", text: "Đang xuất bản" },
};

const errorCode = (error) => error?.response?.data?.code;

const Preview = ({ preview }) => (
  <pre
    style={{
      margin: "6px 0 0",
      padding: 8,
      background: "#fafafa",
      border: "1px solid #f0f0f0",
      borderRadius: 6,
      fontSize: 12,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
    }}
  >
    {preview.before.map((line) => `  ${line}\n`)}
    <span style={{ background: "#f6ffed", color: "#237804" }}>{`+ ${preview.inserted}\n`}</span>
    {preview.after.map((line) => `  ${line}\n`)}
  </pre>
);

const ThemeInstallCard = () => {
  const storeDomain = getStoreDomain();
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState(null);
  const [liveAck, setLiveAck] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [appliedTheme, setAppliedTheme] = useState(null);

  const themesQuery = useQuery({
    queryKey: shopQueryKeys.installThemes(storeDomain),
    queryFn: fetchInstallThemes,
    enabled: !!storeDomain,
    retry: false,
  });

  const themes = themesQuery.data ?? [];
  const unpublished = themes.filter((t) => t.role !== "main" && !t.processing);
  const chosenId = themes.some((t) => t.id === selectedId) ? selectedId : (unpublished[0]?.id ?? null);
  const chosen = themes.find((t) => t.id === chosenId) ?? null;

  const planMutation = useMutation({
    mutationFn: planThemeInstall,
    onSuccess: (result) => {
      setLiveAck(false);
      setLastResult(null);
      setPlan(result);
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không đọc được theme")),
  });

  const applyMutation = useMutation({
    mutationFn: applyThemeInstall,
    onSuccess: (result, variables) => {
      setPlan(null);
      setLastResult(result);
      setAppliedTheme({
        id: String(variables.themeId),
        role: themes.find((t) => String(t.id) === String(variables.themeId))?.role ?? "unpublished",
      });
      toast.success("Đã cài đặt vào theme");
      queryClient.invalidateQueries({ queryKey: shopQueryKeys.installThemes(storeDomain) });
    },
    onError: (error) => {
      if (errorCode(error) === "plan_changed" && error.response.data.plan) {
        setPlan(error.response.data.plan);
        setLiveAck(false);
      }
      toast.error(getErrorMessage(error, "Cài đặt thất bại"));
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: uninstallThemeInstall,
    onSuccess: (result) => {
      setLastResult(null);
      toast.success(
        result.removedFrom.length > 0
          ? `Đã gỡ khỏi ${result.removedFrom.length} file của theme`
          : "Theme không có phần nào do F1GENZ Reviews chèn",
      );
    },
    onError: (error) => toast.error(getErrorMessage(error, "Gỡ thất bại")),
  });

  const reauthorize = () =>
    navigateTopLevel(`/api/oauth/install/start?storeDomain=${encodeURIComponent(storeDomain || "")}`);

  const needsScope = errorCode(themesQuery.error) === "theme_scope_missing";
  const inserts = plan?.edits.filter((e) => e.status === "insert") ?? [];
  const isLive = plan?.role === "main";
  const previewStore = parseStoreDomainInput(storeDomain);
  const previewUrl =
    previewStore && appliedTheme
      ? appliedTheme.role === "main"
        ? `https://${previewStore}/`
        : `https://${previewStore}/?previewThemeId=${encodeURIComponent(appliedTheme.id)}`
      : null;

  return (
    <Card size="small" style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: "16px 20px" } }}>
      <Flex align="center" gap={8} style={{ marginBottom: 8 }}>
        <ThunderboltOutlined style={{ color: "#1677ff" }} />
        <Text strong>Cài tự động vào theme</Text>
      </Flex>
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Hệ thống tự tìm vị trí gắn loader, khối đánh giá và badge số sao, cho bạn xem trước từng thay đổi rồi mới ghi. Mặc định chọn theme chưa xuất bản để bạn xem thử trước khi áp dụng cho cửa hàng thật. Có thể gỡ lại bất cứ lúc nào.
      </Paragraph>

      {needsScope ? (
        <Alert
          type="warning"
          showIcon
          message="Cần cấp thêm quyền đọc/ghi theme"
          description="Ứng dụng chưa có quyền chỉnh sửa theme của cửa hàng. Cấp quyền một lần rồi quay lại trang này."
          action={<Button size="small" type="primary" onClick={reauthorize}>Cấp quyền</Button>}
        />
      ) : themesQuery.isError ? (
        <Alert type="error" showIcon message={getErrorMessage(themesQuery.error, "Không tải được danh sách theme")} />
      ) : (
        <Flex vertical gap={12}>
          {!themesQuery.isLoading && themes.length > 0 && unpublished.length === 0 ? (
            <Alert
              type="info"
              showIcon
              message="Cửa hàng chưa có theme chưa xuất bản"
              description="Hãy nhân bản theme đang dùng trong Sapo (Giao diện) để có bản xem trước an toàn rồi quay lại đây. Hoặc tự chọn theme đang xuất bản bên dưới: thay đổi sẽ hiện ngay trên cửa hàng."
            />
          ) : null}
          <Select
            aria-label="Chọn theme"
            placeholder="Chọn theme"
            style={{ width: "100%", maxWidth: 480 }}
            loading={themesQuery.isLoading}
            value={chosenId}
            onChange={setSelectedId}
            notFoundContent="Cửa hàng chưa có theme"
            options={themes.map((theme) => ({
              value: theme.id,
              disabled: theme.processing,
              label: (
                <Flex align="center" gap={8} wrap="wrap">
                  <Text>{theme.name}</Text>
                  {ROLE_TAG[theme.role] ? <Tag color={ROLE_TAG[theme.role].color}>{ROLE_TAG[theme.role].text}</Tag> : <Tag>Chưa xuất bản</Tag>}
                  {theme.processing ? <Tag color="orange">Đang xử lý</Tag> : null}
                </Flex>
              ),
            }))}
          />
          {chosen?.role === "main" ? (
            <Alert
              type="warning"
              showIcon
              message="Đây là theme đang xuất bản"
              description="Thay đổi hiện ngay trên cửa hàng thật. Nên nhân bản theme và cài vào bản nhân bản để xem trước."
            />
          ) : null}
          <Flex gap={8} wrap="wrap">
            <Button
              type="primary"
              disabled={!chosen || chosen.processing}
              loading={planMutation.isPending}
              onClick={() => planMutation.mutate(chosen.id)}
            >
              Xem kế hoạch
            </Button>
            <Popconfirm
              title="Gỡ F1GENZ Reviews khỏi theme này?"
              description="Chỉ xoá các dòng include và snippet do hệ thống tạo."
              okText="Gỡ"
              cancelText="Huỷ"
              disabled={!chosen || chosen.processing}
              onConfirm={() => uninstallMutation.mutate(chosen.id)}
            >
              <Button danger disabled={!chosen || chosen.processing} loading={uninstallMutation.isPending}>
                Gỡ
              </Button>
            </Popconfirm>
          </Flex>
        </Flex>
      )}

      {lastResult ? (
        <Alert
          style={{ marginTop: 12 }}
          type="success"
          showIcon
          message={`Đã chèn ${lastResult.inserted.length} vị trí (${lastResult.verification.mode === "live" ? "đã kiểm tra trên cửa hàng" : "đã đọc lại để đối chiếu"})`}
          action={
            previewUrl ? (
              <Button size="small" type="primary" href={previewUrl} target="_blank" rel="noopener noreferrer">
                {appliedTheme.role === "main" ? "Mở cửa hàng" : "Xem trước"}
              </Button>
            ) : null
          }
          description={
            <Flex vertical gap={4}>
              {lastResult.verification.checks.map((c) => (
                <Text key={c.name} type={c.ok ? "success" : "danger"}>{c.name}: {c.detail}</Text>
              ))}
              {lastResult.warnings.map((w) => (
                <Text key={w} type="secondary">{w}</Text>
              ))}
            </Flex>
          }
        />
      ) : null}

      <Modal
        open={!!plan}
        width={760}
        title={plan ? `Kế hoạch cài vào: ${plan.themeName}` : ""}
        onCancel={() => setPlan(null)}
        okText="Cài vào theme này"
        cancelText="Huỷ"
        okButtonProps={{ disabled: inserts.length === 0 || (isLive && !liveAck), loading: applyMutation.isPending }}
        onOk={() => applyMutation.mutate({ themeId: plan.themeId, planHash: plan.hash })}
      >
        {plan ? (
          <Flex vertical gap={12}>
            {plan.warnings.map((w) => (
              <Alert key={w} type="warning" showIcon message={w} />
            ))}
            <List
              size="small"
              dataSource={plan.edits}
              renderItem={(edit) => (
                <List.Item>
                  <Flex vertical style={{ width: "100%", minWidth: 0 }}>
                    <Flex align="center" gap={8} wrap="wrap">
                      <Tag color={edit.manual ? "orange" : STATUS_TAG[edit.status].color}>{edit.manual ? "Dán tay" : STATUS_TAG[edit.status].text}</Tag>
                      <Text strong>{TARGET_LABEL[edit.target]}</Text>
                      {edit.source === "ai" ? <Tag color="purple">AI đề xuất</Tag> : null}
                      {edit.file ? <Text code>{edit.file}</Text> : null}
                    </Flex>
                    <Text type="secondary">{edit.reason}</Text>
                    {edit.preview ? <Preview preview={edit.preview} /> : null}
                    {edit.manual ? <ManualPaste manual={edit.manual} /> : null}
                  </Flex>
                </List.Item>
              )}
            />
            {isLive ? (
              <Checkbox checked={liveAck} onChange={(e) => setLiveAck(e.target.checked)}>
                Tôi hiểu đây là theme đang xuất bản, thay đổi hiện ngay trên cửa hàng. Nếu cửa hàng lỗi sau khi ghi, hệ thống sẽ tự khôi phục.
              </Checkbox>
            ) : null}
          </Flex>
        ) : null}
      </Modal>
    </Card>
  );
};

export default ThemeInstallCard;
