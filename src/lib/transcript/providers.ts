import "server-only";
import { serverEnv } from "@/lib/env";
import type { TranscriptSegment } from "./parse";

/**
 * Transcript retrieval providers.
 *
 *  - "captions":        the video's existing caption track (via Supadata, mode=native)
 *  - "ai_transcription": speech-to-text of the YouTube audio (Supadata, mode=generate) —
 *                        only used when the user explicitly opts in
 *  - "media_upload":    speech-to-text of a media file the user uploaded and owns
 *  - "manual":          a transcript/caption file the user supplied (handled before the job starts)
 */
export type TranscriptSource = "captions" | "ai_transcription" | "media_upload" | "manual";

export type TranscriptResult =
  | { status: "done"; segments: TranscriptSegment[]; lang: string | null }
  | { status: "pending"; providerJobId: string }
  | { status: "unavailable"; reason: string };

const SUPADATA = "https://api.supadata.ai/v1";

type SupadataChunk = { text: string; offset: number; duration: number; lang?: string };
type SupadataTranscript = { content: SupadataChunk[] | string; lang?: string; availableLangs?: string[] };

function toSegments(t: SupadataTranscript): TranscriptSegment[] {
  if (typeof t.content === "string") {
    return t.content.trim() ? [{ start: 0, end: 0, text: t.content }] : [];
  }
  return t.content
    .filter((c) => c.text?.trim())
    .map((c) => ({ start: c.offset / 1000, end: (c.offset + c.duration) / 1000, text: c.text }));
}

async function supadataRequest(url: string): Promise<Response> {
  return fetch(url, { headers: { "x-api-key": serverEnv.supadataApiKey }, cache: "no-store" });
}

async function handleSupadataResponse(res: Response): Promise<TranscriptResult> {
  if (res.status === 202) {
    const body = (await res.json()) as { jobId?: string };
    if (!body.jobId) throw new Error("Transcript provider returned 202 without a job id");
    return { status: "pending", providerJobId: body.jobId };
  }
  if (res.status === 206 || res.status === 404) {
    return { status: "unavailable", reason: "No transcript is available for this video from the provider." };
  }
  if (res.status === 429) throw new RetryableError("Transcript provider rate limit reached", 30);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status >= 500) throw new RetryableError(`Transcript provider error ${res.status}`, 20);
    throw new Error(`Transcript provider error ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as SupadataTranscript;
  const segments = toSegments(body);
  if (!segments.length) return { status: "unavailable", reason: "Transcript was empty." };
  return { status: "done", segments, lang: body.lang ?? null };
}

export class RetryableError extends Error {
  constructor(
    message: string,
    public retryAfterSeconds = 15,
  ) {
    super(message);
  }
}

export function transcriptProviderConfigured() {
  return Boolean(serverEnv.supadataApiKey);
}

export async function requestTranscript(opts: {
  source: Exclude<TranscriptSource, "manual">;
  videoUrl: string;
  mediaUrl?: string;
  lang?: string;
}): Promise<TranscriptResult> {
  if (!serverEnv.supadataApiKey) {
    return {
      status: "unavailable",
      reason: "No transcript provider is configured (set SUPADATA_API_KEY) — upload a transcript file instead.",
    };
  }
  const url = new URL(`${SUPADATA}/transcript`);
  url.searchParams.set("url", opts.source === "media_upload" && opts.mediaUrl ? opts.mediaUrl : opts.videoUrl);
  url.searchParams.set("text", "false");
  url.searchParams.set("mode", opts.source === "captions" ? "native" : "generate");
  if (opts.lang) url.searchParams.set("lang", opts.lang);
  return handleSupadataResponse(await supadataRequest(url.toString()));
}

export async function pollTranscriptJob(providerJobId: string): Promise<TranscriptResult> {
  const res = await supadataRequest(`${SUPADATA}/transcript/${encodeURIComponent(providerJobId)}`);
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) throw new RetryableError(`Transcript job poll failed (${res.status})`, 20);
    throw new Error(`Transcript job poll failed (${res.status})`);
  }
  const body = (await res.json()) as SupadataTranscript & { status?: string; error?: string };
  if (body.status === "failed") {
    return { status: "unavailable", reason: body.error ?? "Transcription failed at the provider." };
  }
  if (body.status && body.status !== "completed") return { status: "pending", providerJobId };
  const segments = toSegments(body);
  if (!segments.length) return { status: "unavailable", reason: "Transcript was empty." };
  return { status: "done", segments, lang: body.lang ?? null };
}
