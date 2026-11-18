import "server-only";
import type { TranscriptSegment } from "@/lib/transcript/parse";

/**
 * Turns non-video sources (documents, web articles) into ordered text
 * segments. They have no timestamps, so every segment starts at 0 and the
 * pipeline treats them like an untimed transcript.
 */

export class SourceError extends Error {}

export const MAX_DOCUMENT_MB = 25;
const MAX_TEXT_CHARS = 1_500_000;
const TARGET_SEGMENT_CHARS = 1200;

export type ExtractedSource = {
  title: string | null;
  siteName?: string | null;
  byline?: string | null;
  excerpt?: string | null;
  imageUrl?: string | null;
  segments: TranscriptSegment[];
  characters: number;
  pages?: number;
};

/** Groups paragraphs into ~1.2k character segments, preserving order. */
export function textToSegments(blocks: string[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let buf = "";
  for (const raw of blocks) {
    const block = raw.replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!block) continue;
    if (buf && buf.length + block.length > TARGET_SEGMENT_CHARS) {
      segments.push({ start: 0, end: 0, text: buf });
      buf = "";
    }
    buf = buf ? `${buf}\n\n${block}` : block;
  }
  if (buf) segments.push({ start: 0, end: 0, text: buf });
  return segments;
}

function finish(blocks: string[], meta: Omit<ExtractedSource, "segments" | "characters">): ExtractedSource {
  const characters = blocks.reduce((n, b) => n + b.length, 0);
  if (characters < 300) {
    throw new SourceError(
      "We couldn't find enough readable text in this source. Scanned PDFs (images of pages) aren't supported — upload a text-based PDF or DOCX.",
    );
  }
  if (characters > MAX_TEXT_CHARS) {
    throw new SourceError("This source is too long to turn into one course (over ~1.5 million characters). Split it into parts.");
  }
  return { ...meta, segments: textToSegments(blocks), characters };
}

/* -------------------------------- documents -------------------------------- */

export type DocumentKind = "pdf" | "docx" | "text";

export function documentKind(fileName: string): DocumentKind | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (["txt", "md", "markdown"].includes(ext)) return "text";
  return null;
}

function titleFromFileName(name: string) {
  const base = name.replace(/^[0-9a-f-]{36}-/i, "").replace(/\.[a-z0-9]+$/i, "");
  const t = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

export async function extractDocument(bytes: Uint8Array, fileName: string): Promise<ExtractedSource> {
  const kind = documentKind(fileName);
  if (!kind) throw new SourceError("Unsupported file type. Upload a PDF, DOCX, TXT or Markdown file.");
  const fallbackTitle = titleFromFileName(fileName);

  if (kind === "pdf") {
    const { extractText, getDocumentProxy, getMeta } = await import("unpdf");
    let pdf;
    try {
      pdf = await getDocumentProxy(bytes);
    } catch {
      throw new SourceError("This PDF couldn't be opened. It may be damaged or password-protected.");
    }
    const [{ text, totalPages }, meta] = await Promise.all([
      extractText(pdf, { mergePages: false }),
      getMeta(pdf).catch(() => null),
    ]);
    const blocks = text.flatMap((page) => page.split(/\n\s*\n/));
    const infoTitle = (meta?.info as { Title?: string } | undefined)?.Title?.trim();
    return finish(blocks, { title: infoTitle && infoTitle.length > 3 ? infoTitle : fallbackTitle, pages: totalPages });
  }

  if (kind === "docx") {
    const mammoth = await import("mammoth");
    let value: string;
    try {
      ({ value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) }));
    } catch {
      throw new SourceError("This Word document couldn't be read. Save it as .docx (not .doc) and try again.");
    }
    return finish(value.split(/\n\s*\n|\n/), { title: fallbackTitle });
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^﻿/, "");
  const mdTitle = /^#\s+(.+)$/m.exec(text)?.[1]?.trim();
  return finish(text.replace(/\r\n?/g, "\n").split(/\n\s*\n/), { title: mdTitle ?? fallbackTitle });
}

/* --------------------------------- articles -------------------------------- */

const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function isPrivateIPv4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIP(ip: string) {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
  }
  return isPrivateIPv4(ip);
}

/** Rejects URLs that resolve to loopback, private, link-local or reserved addresses. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SourceError("That doesn't look like a valid link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SourceError("Only http(s) links are supported.");
  if (url.username || url.password) throw new SourceError("Links with credentials aren't supported.");
  if (url.port && !["80", "443"].includes(url.port)) throw new SourceError("Links on non-standard ports aren't supported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new SourceError("That address isn't publicly reachable.");
  }
  const { lookup } = await import("node:dns/promises");
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new SourceError("We couldn't reach that website. Check the link and try again.");
  }
  if (!addrs.length || addrs.some((a) => isPrivateIP(a.address))) throw new SourceError("That address isn't publicly reachable.");
  return url;
}

/** Fetches a public URL with manual, re-validated redirects and a size cap. */
async function safeFetch(raw: string, accept: string, maxBytes: number) {
  let current = raw;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { Accept: accept, "User-Agent": "Mozilla/5.0 (compatible; CourseBuilder/1.0; +article-import)" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new SourceError("The website redirected without a destination.");
      current = new URL(loc, url).toString();
      continue;
    }
    if (!res.ok) throw new SourceError(`The website responded with an error (${res.status}).`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) throw new SourceError("That page is too large to import.");
    const reader = res.body?.getReader();
    if (!reader) throw new SourceError("The website returned an empty response.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new SourceError("That page is too large to import.");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      body.set(c, off);
      off += c.byteLength;
    }
    return { url: url.toString(), contentType: res.headers.get("content-type") ?? "", body };
  }
  throw new SourceError("The website redirected too many times.");
}

const BLOCK_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,figcaption,td,th,dt,dd";

export async function extractArticle(rawUrl: string): Promise<ExtractedSource & { finalUrl: string }> {
  const { url, contentType, body } = await safeFetch(rawUrl, "text/html,application/xhtml+xml,text/plain;q=0.8", MAX_HTML_BYTES);
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8";
  let text: string;
  try {
    text = new TextDecoder(charset, { fatal: false }).decode(body);
  } catch {
    text = new TextDecoder("utf-8", { fatal: false }).decode(body);
  }

  if (contentType.includes("text/plain")) {
    return { ...finish(text.split(/\n\s*\n/), { title: null, siteName: new URL(url).hostname }), finalUrl: url };
  }
  if (!/html|xml/i.test(contentType)) {
    throw new SourceError("That link isn't a web page. For PDFs or documents, download the file and upload it instead.");
  }

  const [{ parseHTML }, { Readability }] = await Promise.all([import("linkedom"), import("@mozilla/readability")]);
  const { document } = parseHTML(text);
  const meta = (sel: string) => document.querySelector(sel)?.getAttribute("content")?.trim() || null;
  const ogImage = meta('meta[property="og:image"]') ?? meta('meta[name="twitter:image"]');
  const siteName = meta('meta[property="og:site_name"]') ?? new URL(url).hostname.replace(/^www\./, "");

  // Readability mutates the document; it expects a DOM-like object.
  const article = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
  if (!article?.content) {
    throw new SourceError("We couldn't find the main article on that page. Pages behind a login or paywall can't be imported.");
  }
  const { document: content } = parseHTML(`<!doctype html><html><body>${article.content}</body></html>`);
  const blocks: string[] = [];
  for (const el of Array.from(content.querySelectorAll(BLOCK_SELECTOR))) {
    // Skip containers whose text is already captured by a nested block.
    if (el.querySelector(BLOCK_SELECTOR)) continue;
    const t = (el.textContent ?? "").trim();
    if (!t) continue;
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) blocks.push(`## ${t}`);
    else if (tag === "li") blocks.push(`• ${t}`);
    else if (tag === "pre") blocks.push(`\`\`\`\n${el.textContent ?? ""}\n\`\`\``);
    else blocks.push(t);
  }
  if (!blocks.length && article.textContent) blocks.push(...article.textContent.split(/\n\s*\n/));

  let imageUrl: string | null = null;
  if (ogImage) {
    try {
      imageUrl = new URL(ogImage, url).toString();
    } catch {
      imageUrl = null;
    }
  }

  return {
    ...finish(blocks, {
      title: article.title?.trim() || meta('meta[property="og:title"]') || null,
      siteName: article.siteName?.trim() || siteName,
      byline: article.byline?.trim() || null,
      excerpt: article.excerpt?.trim() || meta('meta[name="description"]'),
      imageUrl,
    }),
    finalUrl: url,
  };
}

/** Downloads a public image (same SSRF guards) for use as a course thumbnail. */
export async function fetchPublicImage(rawUrl: string): Promise<{ body: Uint8Array; contentType: string; ext: string } | null> {
  try {
    const { body, contentType } = await safeFetch(rawUrl, "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8", MAX_IMAGE_BYTES);
    const type = contentType.split(";")[0].trim().toLowerCase();
    const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" } as Record<string, string>)[type];
    if (!ext) return null;
    return { body, contentType: type, ext };
  } catch {
    return null;
  }
}

/** Downloads a public PDF / DOCX / TXT / MD link and extracts its text. */
export async function extractDocumentFromUrl(rawUrl: string): Promise<ExtractedSource & { fileName: string }> {
  const { url, contentType, body } = await safeFetch(
    rawUrl,
    "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown;q=0.9,*/*;q=0.5",
    MAX_DOCUMENT_MB * 1024 * 1024,
  );
  const type = contentType.split(";")[0].trim().toLowerCase();
  let name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "") || "document";
  if (!documentKind(name)) {
    const ext =
      type === "application/pdf"
        ? "pdf"
        : type.includes("wordprocessingml")
          ? "docx"
          : type === "text/markdown"
            ? "md"
            : type === "text/plain"
              ? "txt"
              : null;
    if (!ext) {
      throw new SourceError(
        type.includes("html")
          ? "That link is a web page, not a document. Use the article option for web pages."
          : "That link isn't a PDF, DOCX, TXT or Markdown file.",
      );
    }
    name = `${name.replace(/\.[a-z0-9]+$/i, "")}.${ext}`;
  }
  const extracted = await extractDocument(body, name);
  return { ...extracted, fileName: name };
}
