const scopedKey = (orgid, ...parts) => ["shop", orgid || "unknown", ...parts];

export const shopQueryKeys = {
  dashboardOverview: (orgid) => scopedKey(orgid, "dashboard-overview"),
  shopInfo: (orgid) => scopedKey(orgid, "shop-info"),
  product: (orgid, productId) => scopedKey(orgid, "product", productId || "none"),
  products: (orgid, params = {}) => scopedKey(orgid, "products", params),
  reviews: (orgid, productId) => scopedKey(orgid, "reviews", productId || "all"),
  allReviews: (orgid, params = {}) => scopedKey(orgid, "reviews", "all-list", params),
  allReviewsRoot: (orgid) => scopedKey(orgid, "reviews", "all-list"),
  reviewSummary: (orgid, productId) =>
    scopedKey(orgid, "reviews", productId || "all", "summary"),
  qna: (orgid, productId) => scopedKey(orgid, "qna", productId || "all"),
  allQna: (orgid, params = {}) => scopedKey(orgid, "qna", "all-list", params),
  allQnaRoot: (orgid) => scopedKey(orgid, "qna", "all-list"),
  widgetConfig: (orgid) => scopedKey(orgid, "widgetConfig"),
  spamConfig: (orgid) => scopedKey(orgid, "spamConfig"),
  opsHealth: (orgid) => scopedKey(orgid, "ops", "health"),
};
