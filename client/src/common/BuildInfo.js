const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

const APP_GIT_HASH =
  typeof __APP_GIT_HASH__ !== "undefined" ? __APP_GIT_HASH__ : "local";

const APP_BUILD_TIME_RAW =
  typeof __APP_BUILD_TIME__ !== "undefined" ? __APP_BUILD_TIME__ : "";

function formatBuildTime(value) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const formatted = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);

  return `${formatted} GMT+7`;
}

export const BUILD_INFO = {
  version: APP_VERSION,
  gitHash: APP_GIT_HASH,
  buildTime: formatBuildTime(APP_BUILD_TIME_RAW),
  buildTimeRaw: APP_BUILD_TIME_RAW,
};
