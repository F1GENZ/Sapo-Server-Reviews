const SENSITIVE_KEY_RE = /email|phone|token|secret|password|authorization|cookie/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?84|0)(?:[\s().-]*\d){9,10}/g;

const redactValue = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value
      .replace(EMAIL_RE, "[redacted-email]")
      .replace(PHONE_RE, "[redacted-phone]");
  }
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen));

  return Object.entries(value).reduce((result, [key, item]) => {
    result[key] = SENSITIVE_KEY_RE.test(key) ? "[redacted]" : redactValue(item, seen);
    return result;
  }, {});
};

const normalizeError = (error) => {
  if (!error) return { message: "Unknown error" };

  if (typeof error === "string") {
    return { message: error };
  }

  return {
    message: error.message || "Unknown error",
    name: error.name,
    stack: error.stack,
    code: error.code,
    status: error.response?.status,
    data: redactValue(error.response?.data),
    url: error.config?.url,
    method: error.config?.method,
  };
};

export const reportClientError = (scope, error, context = {}) => {
  const payload = {
    scope,
    timestamp: new Date().toISOString(),
    context: redactValue(context),
    error: normalizeError(error),
  };

  console.error("[ClientError]", payload);
};
