const HTTPS_URL_RE = /^https:\/\/[^\s<>"']{1,2000}$/i;
const DIRECT_VIDEO_RE = /\.(mp4|webm|ogg)(?:[?#].*)?$/i;

export const normalizeHttpsUrl = (value) => {
  const url = String(value || "").trim();
  return HTTPS_URL_RE.test(url) ? url : "";
};

export const normalizeVideoLink = (value) => normalizeHttpsUrl(value);

export const isDirectVideoUrl = (value) => DIRECT_VIDEO_RE.test(String(value || "").trim());

export const getVideoEmbedUrl = (value) => {
  const url = normalizeHttpsUrl(value);
  if (!url) return "";

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();

    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = parsed.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
      const shorts = /^\/shorts\/([^/?#]+)/.exec(parsed.pathname);
      if (shorts?.[1]) return `https://www.youtube.com/embed/${encodeURIComponent(shorts[1])}`;
      const embed = /^\/embed\/([^/?#]+)/.exec(parsed.pathname);
      if (embed?.[1]) return `https://www.youtube.com/embed/${encodeURIComponent(embed[1])}`;
    }

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }

    if (host === "vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (/^\d+$/.test(id || "")) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    return "";
  }

  return "";
};
