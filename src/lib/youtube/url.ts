/** Pure helpers — safe on client and server. */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export type ParsedYouTubeUrl = { videoId: string; kind: "watch" | "short" | "youtu.be" | "embed" | "live" };

export function parseYouTubeUrl(input: string): ParsedYouTubeUrl | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.split("/")[1] ?? "";
    return ID_RE.test(id) ? { videoId: id, kind: "youtu.be" } : null;
  }
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;

  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v") ?? "";
    return ID_RE.test(id) ? { videoId: id, kind: "watch" } : null;
  }
  const [, first, second] = url.pathname.split("/");
  if (first === "shorts" && second && ID_RE.test(second)) return { videoId: second, kind: "short" };
  if (first === "embed" && second && ID_RE.test(second)) return { videoId: second, kind: "embed" };
  if (first === "live" && second && ID_RE.test(second)) return { videoId: second, kind: "live" };
  if (first === "v" && second && ID_RE.test(second)) return { videoId: second, kind: "embed" };
  return null;
}

export function canonicalWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function timestampUrl(videoId: string, seconds?: number | null) {
  const t = Math.max(0, Math.floor(seconds ?? 0));
  return `https://www.youtube.com/watch?v=${videoId}${t ? `&t=${t}s` : ""}`;
}

export function thumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function formatTimestamp(totalSeconds?: number | null) {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function formatDuration(totalSeconds?: number | null) {
  if (!totalSeconds) return "Unknown length";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Parses an ISO-8601 duration such as PT1H2M10S. */
export function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0)) as number[];
  return d * 86400 + h * 3600 + min * 60 + s;
}
