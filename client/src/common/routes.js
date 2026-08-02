const INTERNAL_PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:/i;

function appendOrgidToPath(path, orgid, currentSearch) {
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "/";
  const basePath =
    path.startsWith("?") || path.startsWith("#")
      ? `${currentPath}${path}`
      : path || "/";

  const url = new URL(basePath, window.location.origin);
  if (!url.searchParams.get("orgid")) {
    url.searchParams.set("orgid", orgid);
  }

  const currentParams = new URLSearchParams(currentSearch);
  ["dev", "password"].forEach((key) => {
    const value = currentParams.get(key);
    if (value && !url.searchParams.get(key)) {
      url.searchParams.set(key, value);
    }
  });

  return `${url.pathname}${url.search}${url.hash}`;
}

export function withOrgid(to, orgid, currentSearch = "") {
  if (!orgid || typeof window === "undefined") {
    return to;
  }

  if (typeof to === "string") {
    if (INTERNAL_PROTOCOL_RE.test(to) || to.startsWith("//")) {
      return to;
    }
    return appendOrgidToPath(to, orgid, currentSearch);
  }

  if (!to || typeof to !== "object") return to;

  const path = `${to.pathname || window.location.pathname}${to.search || ""}${to.hash || ""}`;
  const routed = appendOrgidToPath(path, orgid, currentSearch);
  const url = new URL(routed, window.location.origin);
  return {
    ...to,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
  };
}
