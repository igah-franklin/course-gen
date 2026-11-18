import "server-only";
import { serverEnv } from "@/lib/env";
import { parseIsoDuration, thumbnailUrl } from "./url";

export type VideoMetadata = {
  videoId: string;
  title: string;
  channelName: string;
  description: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string;
  /** "available" | "none" | "unknown" — from YouTube's contentDetails.caption flag. */
  captions: "available" | "none" | "unknown";
  source: "youtube_data_api" | "oembed";
  isShort: boolean;
  publishedAt: string | null;
};

export class VideoNotFoundError extends Error {}

/**
 * Retrieves video metadata. Uses the YouTube Data API when YOUTUBE_API_KEY is
 * set (full details), otherwise falls back to the public oEmbed endpoint
 * (title, channel and thumbnail only — duration/description reported unknown).
 */
export async function fetchVideoMetadata(videoId: string, isShort = false): Promise<VideoMetadata> {
  if (serverEnv.youtubeApiKey) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", serverEnv.youtubeApiKey);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`YouTube Data API error (${res.status})`);
    const json = (await res.json()) as {
      items?: Array<{
        snippet: {
          title: string;
          channelTitle: string;
          description: string;
          publishedAt: string;
          thumbnails?: Record<string, { url: string }>;
        };
        contentDetails: { duration: string; caption: "true" | "false" };
        status?: { embeddable?: boolean; privacyStatus?: string };
      }>;
    };
    const item = json.items?.[0];
    if (!item) throw new VideoNotFoundError("Video not found or is private.");
    const thumbs = item.snippet.thumbnails ?? {};
    return {
      videoId,
      title: item.snippet.title,
      channelName: item.snippet.channelTitle,
      description: item.snippet.description || null,
      durationSeconds: parseIsoDuration(item.contentDetails.duration),
      thumbnailUrl: thumbs.maxres?.url ?? thumbs.high?.url ?? thumbnailUrl(videoId),
      captions: item.contentDetails.caption === "true" ? "available" : "none",
      source: "youtube_data_api",
      isShort,
      publishedAt: item.snippet.publishedAt,
    };
  }

  const oembed = new URL("https://www.youtube.com/oembed");
  oembed.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  oembed.searchParams.set("format", "json");
  const res = await fetch(oembed, { cache: "no-store" });
  if (res.status === 404 || res.status === 401 || res.status === 400) {
    throw new VideoNotFoundError("Video not found, private, or not embeddable.");
  }
  if (!res.ok) throw new Error(`YouTube oEmbed error (${res.status})`);
  const json = (await res.json()) as { title: string; author_name: string; thumbnail_url?: string };
  return {
    videoId,
    title: json.title,
    channelName: json.author_name,
    description: null,
    durationSeconds: null,
    thumbnailUrl: thumbnailUrl(videoId),
    captions: "unknown",
    source: "oembed",
    isShort,
    publishedAt: null,
  };
}
