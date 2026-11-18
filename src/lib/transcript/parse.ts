/** Transcript normalisation, parsing and chunking. Pure functions. */

export type TranscriptSegment = { start: number; end: number; text: string };

export type TranscriptChunk = {
  index: number;
  start: number;
  end: number;
  text: string; // "[mm:ss] text" lines
  segmentCount: number;
};

const clean = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

function tsToSeconds(ts: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(ts.trim());
  if (!m) return null;
  const [, h, mi, s, ms] = m;
  return Number(h ?? 0) * 3600 + Number(mi) * 60 + Number(s) + (ms ? Number(ms.padEnd(3, "0")) / 1000 : 0);
}

export type ParsedTranscriptFile = { segments: TranscriptSegment[]; hasTimestamps: boolean; format: string };

/**
 * Parses WebVTT, SRT, YouTube "Show transcript" copy/paste (timestamp line +
 * text line), "[mm:ss] text" lines, or plain text (no timestamps).
 */
export function parseTranscriptFile(input: string): ParsedTranscriptFile {
  const text = input.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const cueRe = /((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g;

  // VTT / SRT cues
  const cues: TranscriptSegment[] = [];
  for (const m of text.matchAll(cueRe)) {
    const start = tsToSeconds(m[1]);
    const end = tsToSeconds(m[2]);
    const body = clean(m[3]);
    if (start != null && end != null && body) cues.push({ start, end, text: body });
  }
  if (cues.length > 0) {
    return { segments: dedupeRolling(cues), hasTimestamps: true, format: text.startsWith("WEBVTT") ? "vtt" : "srt" };
  }

  // "[mm:ss] text" or "mm:ss text" or "mm:ss\ntext"
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const stamped: { start: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const inline = /^\[?((?:\d+:)?\d{1,2}:\d{2})\]?\s+(.+)$/.exec(lines[i]);
    if (inline) {
      const s = tsToSeconds(inline[1]);
      if (s != null) {
        stamped.push({ start: s, text: clean(inline[2]) });
        continue;
      }
    }
    const alone = /^\[?((?:\d+:)?\d{1,2}:\d{2})\]?$/.exec(lines[i]);
    if (alone && i + 1 < lines.length) {
      const s = tsToSeconds(alone[1]);
      if (s != null) {
        stamped.push({ start: s, text: clean(lines[i + 1]) });
        i++;
        continue;
      }
    }
    if (stamped.length > 0) stamped[stamped.length - 1].text += ` ${clean(lines[i])}`;
  }
  if (stamped.length >= 2) {
    const segments = stamped.map((s, i) => ({
      start: s.start,
      end: stamped[i + 1]?.start ?? s.start + 5,
      text: s.text,
    }));
    return { segments, hasTimestamps: true, format: "timestamped-text" };
  }

  // Plain text: keep paragraphs, no timing information.
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(clean)
    .filter(Boolean);
  return {
    segments: paragraphs.map((p) => ({ start: 0, end: 0, text: p })),
    hasTimestamps: false,
    format: "plain",
  };
}

/** Auto-generated captions often repeat the previous line; drop exact rolling repeats. */
function dedupeRolling(segs: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && prev.text === s.text) {
      prev.end = Math.max(prev.end, s.end);
      continue;
    }
    if (prev && s.text.startsWith(prev.text) && s.start - prev.start < 10) {
      prev.text = s.text;
      prev.end = Math.max(prev.end, s.end);
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

/** Merge tiny caption fragments into readable ~20–40s segments. */
export function normalizeSegments(segs: TranscriptSegment[], targetSeconds = 25): TranscriptSegment[] {
  const sorted = [...segs].filter((s) => s.text.trim()).sort((a, b) => a.start - b.start);
  const out: TranscriptSegment[] = [];
  let cur: TranscriptSegment | null = null;
  for (const s of sorted) {
    if (!cur) {
      cur = { ...s, text: clean(s.text) };
      continue;
    }
    const tooLong = s.end - cur.start > targetSeconds || cur.text.length > 600;
    const sentenceEnd = /[.!?]["')\]]?$/.test(cur.text);
    if (tooLong && (sentenceEnd || s.end - cur.start > targetSeconds * 1.8)) {
      out.push(cur);
      cur = { ...s, text: clean(s.text) };
    } else {
      cur.text = `${cur.text} ${clean(s.text)}`.trim();
      cur.end = Math.max(cur.end, s.end);
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function fmt(seconds: number) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => n.toString().padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

export function renderSegments(segs: TranscriptSegment[], hasTimestamps = true) {
  return segs.map((s) => (hasTimestamps ? `[${fmt(s.start)}] ${s.text}` : s.text)).join("\n");
}

/**
 * Split the full transcript into analysis chunks. Every segment lands in
 * exactly one chunk, so the whole video is analysed — nothing is dropped.
 */
export function chunkTranscript(
  segs: TranscriptSegment[],
  opts: { maxChars?: number; maxSeconds?: number; hasTimestamps?: boolean } = {},
): TranscriptChunk[] {
  const maxChars = opts.maxChars ?? 14000;
  const maxSeconds = opts.maxSeconds ?? 600;
  const hasTs = opts.hasTimestamps ?? true;
  const chunks: TranscriptChunk[] = [];
  let bucket: TranscriptSegment[] = [];
  let chars = 0;

  const flush = () => {
    if (!bucket.length) return;
    chunks.push({
      index: chunks.length,
      start: bucket[0].start,
      end: bucket[bucket.length - 1].end,
      text: renderSegments(bucket, hasTs),
      segmentCount: bucket.length,
    });
    bucket = [];
    chars = 0;
  };

  for (const s of segs) {
    const wouldExceed =
      bucket.length > 0 &&
      (chars + s.text.length > maxChars || (hasTs && s.end - bucket[0].start > maxSeconds));
    if (wouldExceed) flush();
    bucket.push(s);
    chars += s.text.length + 10;
  }
  flush();
  return chunks;
}

export function transcriptSlice(segs: TranscriptSegment[], start: number, end: number, padding = 15) {
  return segs.filter((s) => s.end >= start - padding && s.start <= end + padding);
}
