import React, { useState, useEffect } from "react";
import { DeleteOutlined, CheckOutlined, EyeInvisibleOutlined, SendOutlined, QuestionCircleOutlined, EditOutlined, CloseOutlined, ShoppingOutlined } from "@ant-design/icons";
import { Popconfirm, Card, Typography, Flex, Button, Input, Tag, Space } from "antd";
import { getErrorMessage } from "../../common/getErrorMessage";
import { toast } from "../../common/toast";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const statusConfig = {
  pending: { color: "orange", label: "Chờ duyệt" },
  approved: { color: "green", label: "Đã duyệt" },
  hidden: { color: "default", label: "Đã ẩn" },
};

const isGenericProductLabel = (value, productId) =>
  Boolean(productId && String(value || "").trim() === `Sản phẩm #${productId}`);

const QnaCard = ({ question, onAnswer, onStatusChange, onDelete, onEdit, productUrl }) => {
  const [answering, setAnswering] = useState(false);
  const [answerText, setAnswerText] = useState(question.answer || "");
  const [answerSubmitting, setAnswerSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [statusAction, setStatusAction] = useState(null);
  const [deletePending, setDeletePending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    question: question.question,
    author: question.author,
    answer: question.answer || "",
  });

  useEffect(() => {
    setAnswerText(question.answer || "");
    setEditData({
      question: question.question,
      author: question.author,
      answer: question.answer || "",
    });
  }, [question.answer, question.author, question.question]);

  const date = new Date(question.created_at);
  const dateStr = date.toLocaleDateString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

  const handleSubmitAnswer = async () => {
    if (!answerText.trim()) return;
    setAnswerSubmitting(true);
    try {
      await onAnswer(question.id, { answer: answerText.trim() });
      setAnswering(false);
      toast.success(question.answer ? "Đã cập nhật câu trả lời" : "Đã gửi câu trả lời");
    } catch (error) {
      toast.error(getErrorMessage(error, "Gửi câu trả lời thất bại"));
    } finally {
      setAnswerSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editData.question.trim() || !editData.author.trim()) return;
    setEditSubmitting(true);
    try {
      const payload = {
        question: editData.question.trim(),
        author: editData.author.trim(),
      };
      if (editData.answer.trim()) payload.answer = editData.answer.trim();
      else if (question.answer && !editData.answer.trim()) payload.answer = "";
      await onEdit(question.id, payload);
      setEditing(false);
      toast.success("Đã cập nhật câu hỏi");
    } catch (error) {
      toast.error(getErrorMessage(error, "Cập nhật câu hỏi thất bại"));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleStatusAction = async (nextStatus) => {
    if (!onStatusChange) return;

    const actionKey = nextStatus === "hidden"
      ? "hide"
      : question.status === "hidden"
        ? "restore"
        : "approve";

    setStatusAction(actionKey);
    try {
      await onStatusChange(question.id, { status: nextStatus });
      toast.success(
        nextStatus === "hidden"
          ? "Đã ẩn câu hỏi"
          : question.status === "hidden"
            ? "Đã hiện lại câu hỏi"
            : "Đã duyệt câu hỏi"
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Cập nhật trạng thái thất bại"));
    } finally {
      setStatusAction(null);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setDeletePending(true);
    try {
      await onDelete(question.id);
      toast.success("Đã xóa câu hỏi");
    } catch (error) {
      toast.error(getErrorMessage(error, "Xóa câu hỏi thất bại"));
    } finally {
      setDeletePending(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditData({
      question: question.question,
      author: question.author,
      answer: question.answer || "",
    });
  };

  const status = statusConfig[question.status] || statusConfig.pending;
  const isBusy = answerSubmitting || editSubmitting || deletePending || !!statusAction;
  const questionProductId = question.productId;
  const productLabel =
    [question.productTitle, question.productName].find(
      (value) => value && !isGenericProductLabel(value, questionProductId),
    ) ||
    (questionProductId ? "Không rõ sản phẩm" : "");

  if (editing) {
    return (
      <Card size="small">
        <Flex justify="space-between" align="center" style={{ marginBottom: 10 }}>
          <Text strong style={{ fontSize: 13 }}>Chỉnh sửa câu hỏi</Text>
          <Button type="text" size="small" icon={<CloseOutlined />} aria-label="Đóng chỉnh sửa" onClick={cancelEdit} disabled={editSubmitting} />
        </Flex>
        <Flex vertical gap={10}>
          <div>
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>Người hỏi</Text>
            <Input
              value={editData.author}
              onChange={(e) => setEditData((d) => ({ ...d, author: e.target.value }))}
              maxLength={100}
              size="small"
            />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>Câu hỏi</Text>
            <TextArea
              value={editData.question}
              onChange={(e) => setEditData((d) => ({ ...d, question: e.target.value }))}
              rows={2}
              maxLength={1000}
              showCount
            />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>Câu trả lời</Text>
            <TextArea
              value={editData.answer}
              onChange={(e) => setEditData((d) => ({ ...d, answer: e.target.value }))}
              rows={3}
              maxLength={2000}
              showCount
              placeholder="Để trống nếu chưa trả lời"
            />
          </div>
          <Flex gap={8}>
            <Button type="primary" size="small" loading={editSubmitting} onClick={handleSaveEdit} disabled={editSubmitting || !editData.question.trim() || !editData.author.trim()}>
              Lưu
            </Button>
            <Button size="small" onClick={cancelEdit} disabled={editSubmitting}>Hủy</Button>
          </Flex>
        </Flex>
      </Card>
    );
  }

  return (
    <Card size="small">
      <Flex justify="space-between" align="start" gap={8} wrap style={{ minWidth: 0 }}>
        <Flex vertical gap={4} style={{ flex: "1 1 180px", minWidth: 0 }}>
          <Flex align="center" gap={8} wrap style={{ minWidth: 0 }}>
            <Text strong style={{ fontSize: 13, maxWidth: "100%", overflowWrap: "anywhere" }}>{question.author}</Text>
            <Tag color={status.color} style={{ fontSize: 11 }}>{status.label}</Tag>
            {question.email && (
              <Text type="secondary" style={{ fontSize: 11, minWidth: 0, overflowWrap: "anywhere" }}>{question.email}</Text>
            )}
          </Flex>
          <Text type="secondary" style={{ fontSize: 11 }}>{dateStr}</Text>
          {productLabel ? (
            <a
              href={productUrl || undefined}
              target={productUrl ? "_blank" : undefined}
              rel={productUrl ? "noopener noreferrer" : undefined}
              onClick={(event) => {
                if (!productUrl) event.preventDefault();
              }}
              style={{ width: "fit-content", maxWidth: "100%" }}
            >
              <Tag
                icon={<ShoppingOutlined />}
                color="blue"
                style={{
                  marginTop: 4,
                  marginInlineEnd: 0,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  width: "fit-content",
                }}
                title={productLabel}
              >
                {productLabel}
              </Tag>
            </a>
          ) : null}
        </Flex>

        <Space size={4} style={{ flex: "0 0 auto" }}>
          {onEdit && (
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => setEditing(true)}
              aria-label="Chỉnh sửa câu hỏi"
              title="Chỉnh sửa"
              disabled={isBusy}
            />
          )}
          {question.status === "pending" && (
            <Button
              type="text"
              size="small"
              icon={<CheckOutlined />}
              style={{ color: "#52c41a" }}
              onClick={() => handleStatusAction("approved")}
              aria-label="Duyệt câu hỏi"
              title="Duyệt"
              loading={statusAction === "approve"}
              disabled={deletePending || answerSubmitting || editSubmitting || statusAction === "hide" || statusAction === "restore"}
            />
          )}
          {question.status !== "hidden" && (
            <Button
              type="text"
              size="small"
              icon={<EyeInvisibleOutlined />}
              onClick={() => handleStatusAction("hidden")}
              aria-label="Ẩn câu hỏi"
              title="Ẩn"
              loading={statusAction === "hide"}
              disabled={deletePending || answerSubmitting || editSubmitting || statusAction === "approve" || statusAction === "restore"}
            />
          )}
          {question.status === "hidden" && (
            <Button
              type="text"
              size="small"
              icon={<CheckOutlined />}
              style={{ color: "#52c41a" }}
              onClick={() => handleStatusAction("approved")}
              aria-label="Hiện lại câu hỏi"
              title="Hiện lại"
              loading={statusAction === "restore"}
              disabled={deletePending || answerSubmitting || editSubmitting || statusAction === "approve" || statusAction === "hide"}
            />
          )}
          <Popconfirm
            title="Xóa câu hỏi này?"
            onConfirm={handleDelete}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ loading: deletePending, danger: true }}
            cancelButtonProps={{ disabled: deletePending }}
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label="Xóa câu hỏi" loading={deletePending} disabled={answerSubmitting || editSubmitting || !!statusAction} />
          </Popconfirm>
        </Space>
      </Flex>

      <Paragraph style={{ marginTop: 8, marginBottom: 0, fontSize: 13, fontWeight: 500, overflowWrap: "anywhere" }}>
        <QuestionCircleOutlined style={{ color: "#722ed1", marginRight: 6 }} />
        {question.question}
      </Paragraph>

      {question.answer && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            background: "#f6ffed",
            borderLeft: "3px solid #52c41a",
            borderRadius: "0 6px 6px 0",
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: 700, color: "#52c41a", textTransform: "uppercase" }}>
            {question.answered_by || "Shop"} trả lời
          </Text>
          {question.answered_at && (
            <Text type="secondary" style={{ fontSize: 10, marginLeft: 8 }}>
              {new Date(question.answered_at).toLocaleDateString("vi-VN")}
            </Text>
          )}
          <Paragraph style={{ margin: "4px 0 0", fontSize: 13, overflowWrap: "anywhere" }}>
            {question.answer}
          </Paragraph>
        </div>
      )}

      {!question.answer && !answering && (
        <Button
          type="link"
          size="small"
          icon={<SendOutlined />}
          onClick={() => setAnswering(true)}
          style={{ marginTop: 8, padding: 0 }}
          disabled={isBusy}
        >
          Trả lời
        </Button>
      )}

      {answering && (
        <div style={{ marginTop: 10 }}>
          <TextArea
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder="Nhập câu trả lời…"
            rows={3}
            maxLength={2000}
            showCount
          />
          <Flex gap={8} style={{ marginTop: 8 }}>
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={answerSubmitting}
              onClick={handleSubmitAnswer}
              disabled={!answerText.trim() || isBusy}
            >
              Gửi trả lời
            </Button>
            <Button size="small" onClick={() => { setAnswering(false); setAnswerText(question.answer || ""); }} disabled={answerSubmitting}>
              Hủy
            </Button>
          </Flex>
        </div>
      )}
    </Card>
  );
};

export default React.memo(QnaCard);
