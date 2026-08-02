import httpClient from "../config/AxiosConfig";

// ─── Dashboard ───
export const fetchDashboardOverview = async () => {
  const res = await httpClient.get("/api/admin/dashboard/overview");
  return res.data?.data;
};

// ─── App session (thay fetchShopInfo — dùng storeDomain trực tiếp) ───
export const fetchAppSession = async () => {
  const res = await httpClient.get("/api/app/session");
  return res.data?.data;
};

// ─── Auth session exchange (one-time handoff code → session token) ───
export const exchangeHandoff = async (handoffCode) => {
  const res = await httpClient.post("/api/auth/session/exchange", { handoffCode });
  return res.data;
};

// ─── Products ───
export const fetchProducts = async (params = {}) => {
  const res = await httpClient.get("/api/admin/products", { params });
  return res.data?.data;
};

export const fetchProduct = async (productId) => {
  const res = await httpClient.get(`/api/admin/products/${productId}`);
  return res.data?.data;
};

// ─── Ops (4 endpoints Sapo) ───
export const fetchOpsHealth = async () => {
  const res = await httpClient.get("/api/admin/ops/health");
  return res.data?.data;
};

export const resyncOpsConfig = async () => {
  const res = await httpClient.post("/api/admin/ops/resync-config");
  return res.data?.data;
};

export const resyncOpsWebhooks = async () => {
  const res = await httpClient.post("/api/admin/ops/resync-webhooks");
  return res.data?.data;
};

export const backfillOpsCatalog = async (data = {}) => {
  const res = await httpClient.post("/api/admin/ops/backfill-catalog", data);
  return res.data?.data;
};

// ─── Reviews ───
export const fetchAllReviews = async (params = {}) => {
  const { pageSize, sortBy, star, ...rest } = params;
  const res = await httpClient.get(`/admin/reviews`, {
    params: {
      ...rest,
      limit: pageSize,
      sort: sortBy,
      ...(star ? { star } : {}),
    },
    timeout: 60000,
    skipRetry: true,
  });
  return res.data?.data;
};

export const fetchReviews = async (productId) => {
  const res = await httpClient.get(`/admin/reviews/${productId}`);
  return res.data?.data;
};

export const fetchReviewSummary = async (productId) => {
  const res = await httpClient.get(`/admin/reviews/${productId}/stats`);
  const stats = res.data?.data;
  if (!stats) return stats;
  const inner = stats.summary || {};
  return {
    count: stats.total ?? inner.count ?? 0,
    avg: inner.avg ?? stats.avgRating ?? 0,
    distribution: inner.distribution || {},
  };
};

export const createReview = async (productId, data) => {
  const res = await httpClient.post(`/admin/reviews/${productId}`, data);
  return res.data?.data;
};

export const updateReview = async (productId, reviewId, data) => {
  const res = await httpClient.patch(`/admin/reviews/${productId}/${reviewId}`, data);
  return res.data?.data;
};

export const replyToReview = async (productId, reviewId, data) => {
  const res = await httpClient.patch(`/admin/reviews/${productId}/${reviewId}/reply`, data);
  return res.data?.data;
};

export const updateReviewStatus = async (productId, reviewId, status) => {
  const res = await httpClient.patch(`/admin/reviews/${productId}/${reviewId}/status`, { status });
  return res.data?.data;
};

export const deleteReview = async (productId, reviewId) => {
  const res = await httpClient.delete(`/admin/reviews/${productId}/${reviewId}`);
  return res.data?.data;
};

// ─── Spam Config ───
export const fetchSpamConfig = async () => {
  const res = await httpClient.get("/admin/reviews/spam-config");
  return res.data?.data;
};

export const saveSpamConfig = async (data) => {
  const res = await httpClient.put("/admin/reviews/spam-config", data);
  return res.data?.data;
};

// ─── Widget Config ───
export const fetchWidgetConfig = async () => {
  const res = await httpClient.get("/admin/reviews/widget-config");
  return res.data?.data;
};

export const saveWidgetConfig = async (data) => {
  const res = await httpClient.put("/admin/reviews/widget-config", data);
  return res.data?.data;
};

// ─── Q&A ───
export const fetchAllQuestions = async (params = {}) => {
  const { pageSize, sortBy, ...rest } = params;
  const res = await httpClient.get(`/admin/qna`, {
    params: {
      ...rest,
      limit: pageSize,
      sort: sortBy,
    },
    timeout: 60000,
    skipRetry: true,
  });
  return res.data?.data;
};

export const fetchQuestions = async (productId) => {
  const res = await httpClient.get(`/admin/qna/${productId}`);
  return res.data?.data;
};

export const createQuestion = async (productId, data) => {
  const res = await httpClient.post(`/admin/qna/${productId}`, data);
  return res.data?.data;
};

export const answerQuestion = async (productId, questionId, data) => {
  const res = await httpClient.patch(`/admin/qna/${productId}/${questionId}/answer`, data);
  return res.data?.data;
};

export const updateQuestionStatus = async (productId, questionId, data) => {
  const res = await httpClient.patch(`/admin/qna/${productId}/${questionId}/status`, data);
  return res.data?.data;
};

export const updateQuestion = async (productId, questionId, data) => {
  const res = await httpClient.patch(`/admin/qna/${productId}/${questionId}`, data);
  return res.data?.data;
};

export const deleteQuestion = async (productId, questionId) => {
  const res = await httpClient.delete(`/admin/qna/${productId}/${questionId}`);
  return res.data?.data;
};
