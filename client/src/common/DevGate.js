export const getTodayDevPassword = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("day")}${pick("month")}${pick("year")}`;
};

export const canAccessOpsPage = (search) => {
  const params = new URLSearchParams(search);
  return (
    params.get("dev") === "hangquoctai" &&
    params.get("password") === getTodayDevPassword()
  );
};
