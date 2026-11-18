"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CheckCircle2, Globe, Loader2, Plug, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCourseAction } from "@/lib/actions/courses";
import { EnginePicker, FileDrop, StepCard, uploadFile, type Capabilities, type Engine } from "./create-course-shared";

export type OtherSource = "video_upload" | "document" | "article" | "prompt";

const MAX_MEDIA_MB = 500;
const MAX_DOC_MB = 25;

const COPY: Record<OtherSource, { step: string; hint: string; cta: string }> = {
  video_upload: {
    step: "Upload your video or audio",
    hint: "We transcribe the full recording, then build the course from everything that's said.",
    cta: "Transcribe & Generate Course",
  },
  document: {
    step: "Upload a document",
    hint: "PDF, Word (.docx), text or Markdown. Every page is read — chapters become modules and lessons.",
    cta: "Read Document & Generate Course",
  },
  prompt: {
    step: "Describe the course you want",
    hint: "Say what it should teach, who it's for and anything it must include. AI plans the syllabus, then writes every lesson, quiz and assessment.",
    cta: "Plan & Generate Course",
  },
  article: {
    step: "Paste an article or blog post link",
    hint: "We read the main article content (not menus or ads) and turn it into a structured course.",
    cta: "Read Article & Generate Course",
  },
};

export function SourceCourseForm({ userId, kind, capabilities }: { userId: string; kind: OtherSource; capabilities: Capabilities }) {
  const router = useRouter();
  const [engine, setEngine] = useState<Engine>(capabilities.ai ? "server" : "assistant");
  const [file, setFile] = useState<{ name: string; path: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [level, setLevel] = useState<"any" | "beginner" | "intermediate" | "advanced">("any");
  const [depth, setDepth] = useState<"short" | "standard" | "comprehensive">("standard");
  const [lang, setLang] = useState("");
  const [creating, startCreate] = useTransition();
  const copy = COPY[kind];

  const blocked =
    kind === "video_upload" && !capabilities.transcriptProvider ? "Video transcription isn't configured on this server (SUPADATA_API_KEY)." : null;

  const handleFile = async (f: File) => {
    const maxMb = kind === "video_upload" ? MAX_MEDIA_MB : MAX_DOC_MB;
    if (f.size > maxMb * 1024 * 1024) return void toast.error(`Files must be under ${maxMb} MB.`);
    if (kind === "document" && !/\.(pdf|docx|txt|md|markdown)$/i.test(f.name)) {
      return void toast.error("Upload a PDF, DOCX, TXT or Markdown file.");
    }
    setUploading(true);
    try {
      const path = await uploadFile(userId, f, kind === "video_upload" ? "media" : "documents");
      setFile({ name: f.name, path });
      if (!title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const ready =
    !blocked &&
    !uploading &&
    (engine === "assistant" || capabilities.ai) &&
    (kind === "prompt" ? brief.trim().length >= 20 : kind === "article" ? /^https?:\/\/\S+\.\S+/i.test(url.trim()) : Boolean(file));

  const submit = () =>
    startCreate(async () => {
      const res = await createCourseAction({
        sourceType: kind,
        url: kind === "article" ? url.trim() : "",
        title: kind !== "article" && title.trim() ? title.trim() : undefined,
        prompt: kind === "prompt" ? brief.trim() : undefined,
        level,
        depth,
        lang: kind === "prompt" && lang.trim() ? lang.trim() : undefined,
        engine,
        transcriptSource: kind === "video_upload" ? "media_upload" : "manual",
        mediaPath: kind === "video_upload" ? file?.path : undefined,
        documentPath: kind === "document" ? file?.path : undefined,
        frames: [],
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        engine === "server"
          ? "Course generation started. You can leave this page — we'll keep working."
          : "Course prepared. Now ask your connected Claude or ChatGPT to continue it.",
      );
      router.push(`/dashboard/courses/${res.data.courseId}`);
    });

  return (
    <div className="space-y-6">
      <StepCard step="1" title={copy.step} description={copy.hint}>
        {blocked ? (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-tile-butter px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {blocked}
          </div>
        ) : kind === "prompt" ? (
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value.slice(0, 8000))}
                rows={6}
                autoFocus
                aria-label="Course brief"
                placeholder={"e.g. A practical course on personal budgeting for university students in Nigeria. Cover tracking income and expenses, the 50/30/20 rule, saving with mobile banking apps, avoiding debt traps, and planning for school fees. Include worked examples in naira and a short exercise in every lesson."}
                className="rounded-2xl text-[15px] leading-6"
              />
              <p className="flex justify-between text-xs text-muted-foreground">
                <span>The more specific you are, the better the course.</span>
                <span className="tabular-nums">{brief.length}/8000</span>
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-level">Learner level</Label>
                <select
                  id="p-level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as typeof level)}
                  className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="any">Let AI decide</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-depth">Depth</Label>
                <select
                  id="p-depth"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value as typeof depth)}
                  className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="short">Short — mini-course</option>
                  <option value="standard">Standard — complete course</option>
                  <option value="comprehensive">Comprehensive — in depth</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-lang">Language (optional)</Label>
                <Input id="p-lang" value={lang} maxLength={30} onChange={(e) => setLang(e.target.value)} placeholder="e.g. English, French, Hausa" className="h-10 rounded-xl" />
              </div>
            </div>
            <div className="max-w-md space-y-1.5">
              <Label htmlFor="p-title">Working title (optional)</Label>
              <Input id="p-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="h-10 rounded-xl" />
            </div>
            <p className="rounded-2xl bg-tile-butter px-4 py-3 text-xs leading-5">
              This course is written from general knowledge, not from a source you provide. Review it for accuracy before sharing or selling it.
            </p>
          </div>
        ) : kind === "article" ? (
          <div className="relative mt-4">
            <Globe className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/blog/how-to-…"
              aria-label="Article URL"
              className="h-12 rounded-2xl pl-10 text-[15px]"
              inputMode="url"
              autoFocus
            />
            <p className="mt-2.5 text-xs text-muted-foreground">
              Public pages only — articles behind a login or paywall can&apos;t be read. Only import content you have the right to use.
            </p>
          </div>
        ) : (
          <>
            <FileDrop
              accept={kind === "video_upload" ? "audio/*,video/*" : ".pdf,.docx,.txt,.md,.markdown,application/pdf"}
              label={kind === "video_upload" ? "Video or audio file" : "Document"}
              hint={
                kind === "video_upload"
                  ? `MP4, MOV, MP3, M4A, WAV… up to ${MAX_MEDIA_MB} MB. Only upload media you own or may use.`
                  : `PDF, DOCX, TXT or MD up to ${MAX_DOC_MB} MB. Scanned (image-only) PDFs aren't supported.`
              }
              file={file}
              busy={uploading}
              onFile={handleFile}
              onClear={() => setFile(null)}
            />
            {file && (
              <div className="mt-4 max-w-md space-y-1.5">
                <Label htmlFor="src-title">Working title (optional)</Label>
                <Input id="src-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="h-10 rounded-xl" />
                <p className="text-xs text-muted-foreground">The AI proposes a final title from the content; you can edit it later.</p>
              </div>
            )}
          </>
        )}
      </StepCard>

      <EnginePicker engine={engine} onChange={setEngine} aiAvailable={capabilities.ai} />

      <section className="flex flex-col gap-4 rounded-3xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {engine === "assistant" ? (
            <>
              <Plug className="size-4 text-primary" /> We&apos;ll prepare the content; your assistant writes the course.
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4 text-primary" /> Runs in the background — you can close this page.
            </>
          )}
        </p>
        <Button size="lg" className="h-12 rounded-xl px-6 text-[15px]" disabled={!ready || creating} onClick={submit}>
          {creating ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {engine === "assistant" ? "Prepare Course for My AI" : copy.cta}
          {!creating && <ArrowRight />}
        </Button>
      </section>
    </div>
  );
}
