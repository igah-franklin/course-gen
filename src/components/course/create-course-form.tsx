"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Captions,
  CheckCircle2,
  Clock,
  FileAudio,
  FileText,
  Globe,
  ImagePlus,
  Info,
  Link2,
  Loader2,
  Mic,
  Plug,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { YouTubeIcon } from "@/components/brand/brand-icons";
import { formatDuration, formatTimestamp } from "@/lib/youtube/url";
import { createCourseAction, previewVideoAction, type VideoPreview } from "@/lib/actions/courses";
import { cn } from "@/lib/utils";
import { EnginePicker, FileDrop, uploadFile, type Capabilities } from "./create-course-shared";
import { SourceCourseForm, type OtherSource } from "./source-course-form";

type Source = "captions" | "ai_transcription" | "manual" | "media_upload";
type Frame = { path: string; previewUrl: string; timestamp: string; caption: string; name: string };

const MAX_MEDIA_MB = 500;

function parseTs(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const parts = t.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function YouTubeCourseForm({ userId, initialUrl = "" }: { userId: string; initialUrl?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [preview, setPreview] = useState<VideoPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, startPreview] = useTransition();
  const [creating, startCreate] = useTransition();
  const [source, setSource] = useState<Source>("captions");
  const [engine, setEngine] = useState<"server" | "assistant">("server");
  const [lang, setLang] = useState("");
  const [transcriptFile, setTranscriptFile] = useState<{ name: string; path: string } | null>(null);
  const [mediaFile, setMediaFile] = useState<{ name: string; path: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [showDescription, setShowDescription] = useState(false);
  const frameInput = useRef<HTMLInputElement>(null);

  const fetchPreview = (value = url) => {
    setError(null);
    startPreview(async () => {
      const res = await previewVideoAction(value);
      if (!res.ok) {
        setPreview(null);
        setError(res.error);
        return;
      }
      setPreview(res.data);
      const caps = res.data.capabilities;
      setEngine(caps.ai ? "server" : "assistant");
      setSource(caps.transcriptProvider ? (res.data.captions === "none" ? "ai_transcription" : "captions") : "manual");
    });
  };

  const handleUpload = async (file: File, kind: "transcript" | "media") => {
    if (kind === "transcript" && file.size > 5 * 1024 * 1024) return toast.error("Transcript files must be under 5 MB.");
    if (kind === "media" && file.size > MAX_MEDIA_MB * 1024 * 1024) return toast.error(`Media files must be under ${MAX_MEDIA_MB} MB.`);
    setUploading(kind);
    try {
      const path = await uploadFile(userId, file, kind === "transcript" ? "transcripts" : "media");
      if (kind === "transcript") setTranscriptFile({ name: file.name, path });
      else setMediaFile({ name: file.name, path });
      toast.success(`${file.name} uploaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const addFrames = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading("frames");
    try {
      const added: Frame[] = [];
      for (const file of Array.from(files).slice(0, 30 - frames.length)) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 8 MB`);
          continue;
        }
        const path = await uploadFile(userId, file, "frames");
        added.push({ path, previewUrl: URL.createObjectURL(file), timestamp: "", caption: "", name: file.name });
      }
      setFrames((f) => [...f, ...added]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
      if (frameInput.current) frameInput.current.value = "";
    }
  };

  const canSubmit =
    preview &&
    (engine === "assistant" || preview.capabilities.ai) &&
    !uploading &&
    (source === "manual" ? Boolean(transcriptFile) : source === "media_upload" ? Boolean(mediaFile) : preview.capabilities.transcriptProvider);

  const submit = () => {
    if (!preview) return;
    const badTs = frames.find((f) => f.timestamp && parseTs(f.timestamp) === null);
    if (badTs) return toast.error(`Invalid timestamp for ${badTs.name}. Use mm:ss.`);
    startCreate(async () => {
      const res = await createCourseAction({
        url: preview.url,
        engine,
        transcriptSource: source,
        transcriptPath: transcriptFile?.path,
        mediaPath: mediaFile?.path,
        lang: lang || undefined,
        frames: frames.map((f) => ({ path: f.path, timestamp: parseTs(f.timestamp), caption: f.caption || undefined })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        engine === "server"
          ? "Course generation started. You can leave this page — we'll keep working."
          : "Course prepared. Now ask your connected Claude or ChatGPT to continue it.",
      );
      router.push(`/dashboard/courses/${res.data.courseId}`);
    });
  };

  const sources: { key: Source; title: string; body: string; icon: typeof Captions; disabled?: string }[] = [
    {
      key: "captions",
      title: "Use the video's captions",
      body: "Fastest. Uses the captions published on YouTube (manual or auto-generated).",
      icon: Captions,
      disabled: !preview?.capabilities.transcriptProvider
        ? "Transcript provider not configured"
        : preview?.captions === "none"
          ? "This video has no captions"
          : undefined,
    },
    {
      key: "ai_transcription",
      title: "AI transcription of the audio",
      body: "For videos without captions. The audio is transcribed by our transcription provider.",
      icon: Mic,
      disabled: !preview?.capabilities.transcriptProvider ? "Transcript provider not configured" : undefined,
    },
    {
      key: "manual",
      title: "Upload a transcript file",
      body: "Provide a .vtt, .srt or timestamped .txt transcript you have the right to use.",
      icon: FileText,
    },
    {
      key: "media_upload",
      title: "Upload your own recording",
      body: "Own the video? Upload the audio or video file and we'll transcribe it.",
      icon: FileAudio,
      disabled: !preview?.capabilities.transcriptProvider ? "Transcript provider not configured" : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Step 1: URL */}
      <section className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span>
          Paste a YouTube URL
        </div>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            fetchPreview();
          }}
        >
          <div className="relative flex-1">
            <YouTubeIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-[#FF0000]" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (text) setTimeout(() => fetchPreview(text), 0);
              }}
              placeholder="https://www.youtube.com/watch?v=… or https://youtu.be/…"
              aria-label="YouTube URL"
              className="h-12 rounded-xl pl-10 text-[15px]"
              autoFocus
            />
          </div>
          <Button type="submit" size="lg" className="h-12 rounded-xl px-5" disabled={loadingPreview || !url.trim()}>
            {loadingPreview ? <Loader2 className="animate-spin" /> : <Link2 />}
            Fetch video
          </Button>
        </form>
        <p className="mt-2.5 text-xs text-muted-foreground">Supports youtube.com/watch, youtu.be, YouTube Shorts, embed and live links.</p>
        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
          </div>
        )}
      </section>

      {loadingPreview && !preview && (
        <div className="flex animate-pulse gap-5 rounded-2xl border bg-card p-6">
          <div className="aspect-video w-64 rounded-xl bg-muted" />
          <div className="flex-1 space-y-3">
            <div className="h-5 w-3/4 rounded bg-muted" />
            <div className="h-4 w-1/3 rounded bg-muted" />
          </div>
        </div>
      )}

      {preview && (
        <>
          {/* Step 2: preview */}
          <section className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">2</span>
              Confirm the video
            </div>
            <div className="mt-4 flex flex-col gap-5 md:flex-row">
              <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-muted md:w-72">
                <Image src={preview.thumbnailUrl} alt="" fill sizes="288px" className="object-cover" />
                {preview.isShort && (
                  <span className="absolute top-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">Short</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-snug">{preview.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{preview.channelName}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                    <Clock className="size-3.5" />
                    {preview.durationSeconds ? formatDuration(preview.durationSeconds) : "Duration unavailable"}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                      preview.captions === "available" && "border-success/40 bg-success/5",
                      preview.captions === "none" && "border-warning/50 bg-warning/5",
                    )}
                  >
                    <Captions className="size-3.5" />
                    {preview.captions === "available"
                      ? "Captions available"
                      : preview.captions === "none"
                        ? "No captions published"
                        : "Caption status unknown"}
                  </span>
                </div>
                {preview.description ? (
                  <div className="mt-4">
                    <p className={cn("text-sm whitespace-pre-line text-muted-foreground", !showDescription && "line-clamp-3")}>
                      {preview.description}
                    </p>
                    <button className="mt-1 text-xs font-medium text-primary" onClick={() => setShowDescription((s) => !s)}>
                      {showDescription ? "Show less" : "Show full description"}
                    </button>
                  </div>
                ) : !preview.capabilities.fullMetadata ? (
                  <p className="mt-4 text-xs text-muted-foreground">
                    Duration, description and caption details require a YouTube Data API key (YOUTUBE_API_KEY).
                  </p>
                ) : null}
                {preview.existingCourseId && (
                  <p className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground">
                    <Info className="size-3.5" /> You already have a course from this video.{" "}
                    <Link href={`/dashboard/courses/${preview.existingCourseId}`} className="font-medium underline">
                      Open it
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </section>

          <EnginePicker engine={engine} onChange={setEngine} aiAvailable={preview.capabilities.ai} />

          {/* Step 3: transcript source */}
          <section className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">3</span>
              How should we read the video?
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              The whole video is analysed from its transcript — every section, from start to finish.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Transcript source">
              {sources.map((s) => {
                const selected = source === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={Boolean(s.disabled)}
                    onClick={() => setSource(s.key)}
                    className={cn(
                      "flex gap-3 rounded-xl border p-4 text-left transition-all",
                      selected ? "border-primary bg-accent/50 ring-1 ring-primary" : "hover:border-primary/40",
                      s.disabled && "cursor-not-allowed opacity-50 hover:border-border",
                    )}
                  >
                    <s.icon className={cn("mt-0.5 size-5 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
                    <span>
                      <span className="block text-sm font-medium">{s.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{s.disabled ?? s.body}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {(source === "captions" || source === "ai_transcription") && (
              <div className="mt-4 max-w-xs space-y-1.5">
                <Label htmlFor="lang">Preferred language (optional)</Label>
                <Input id="lang" placeholder="e.g. en, es, fr" value={lang} onChange={(e) => setLang(e.target.value.slice(0, 5))} />
              </div>
            )}

            {source === "manual" && (
              <FileDrop
                accept=".vtt,.srt,.txt,text/plain,text/vtt"
                label="Transcript file"
                hint=".vtt, .srt, or text with [mm:ss] timestamps (max 5 MB)"
                file={transcriptFile}
                busy={uploading === "transcript"}
                onFile={(f) => handleUpload(f, "transcript")}
                onClear={() => setTranscriptFile(null)}
              />
            )}
            {source === "media_upload" && (
              <FileDrop
                accept="audio/*,video/*"
                label="Audio or video file"
                hint={`Only upload media you own or have permission to use (max ${MAX_MEDIA_MB} MB)`}
                file={mediaFile}
                busy={uploading === "media"}
                onFile={(f) => handleUpload(f, "media")}
                onClear={() => setMediaFile(null)}
              />
            )}
          </section>

          {/* Step 4: optional frames */}
          <section className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs">4</span>
                  Key screenshots <span className="font-normal text-muted-foreground">(optional, recommended for visual tutorials)</span>
                </div>
                <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                  Transcripts don&apos;t capture what&apos;s on screen. Add screenshots of important moments (code, settings,
                  diagrams) with their timestamp and they&apos;ll be analysed and placed in the matching lessons.
                </p>
              </div>
              <Button variant="outline" onClick={() => frameInput.current?.click()} disabled={uploading === "frames" || frames.length >= 30}>
                {uploading === "frames" ? <Loader2 className="animate-spin" /> : <ImagePlus />}
                Add screenshots
              </Button>
              <input ref={frameInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => addFrames(e.target.files)} />
            </div>
            {frames.length > 0 && (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {frames.map((f, i) => (
                  <li key={f.path} className="overflow-hidden rounded-xl border">
                    <div className="relative aspect-video bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.previewUrl} alt={f.name} className="h-full w-full object-cover" />
                      <button
                        className="absolute top-2 right-2 rounded-md bg-black/60 p-1 text-white hover:bg-black/80"
                        aria-label="Remove screenshot"
                        onClick={() => setFrames((fs) => fs.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="space-y-2 p-3">
                      <Input
                        placeholder="Timestamp (mm:ss)"
                        value={f.timestamp}
                        onChange={(e) => setFrames((fs) => fs.map((x, j) => (j === i ? { ...x, timestamp: e.target.value } : x)))}
                        className="h-8 text-xs"
                      />
                      <Textarea
                        placeholder="What does this show? (optional)"
                        value={f.caption}
                        rows={2}
                        onChange={(e) => setFrames((fs) => fs.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
                        className="text-xs"
                      />
                      {f.timestamp && parseTs(f.timestamp) !== null && (
                        <p className="text-[11px] text-muted-foreground">At {formatTimestamp(parseTs(f.timestamp))}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Submit */}
          <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="text-sm">
              {engine === "assistant" ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Plug className="size-4 text-primary" /> We&apos;ll prepare the transcript; your assistant writes the course.
                </p>
              ) : !preview.capabilities.ai ? (
                <p className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-4" /> Built-in AI isn&apos;t configured — choose &ldquo;Your Claude or ChatGPT&rdquo; instead.
                </p>
              ) : (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="size-4 text-primary" /> Runs in the background — you can close this page.
                </p>
              )}
            </div>
            <Button size="lg" className="h-12 rounded-xl px-6 text-[15px]" disabled={!canSubmit || creating} onClick={submit}>
              {creating ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {engine === "assistant" ? "Prepare Course for My AI" : "Analyze Video & Generate Course"}
              {!creating && <ArrowRight />}
            </Button>
          </section>
        </>
      )}
    </div>
  );
}

const SOURCE_TABS: { key: "youtube" | OtherSource; label: string; body: string; icon: typeof FileText }[] = [
  { key: "youtube", label: "YouTube video", body: "Paste a link", icon: Link2 },
  { key: "video_upload", label: "Video / audio file", body: "Upload a recording", icon: FileAudio },
  { key: "document", label: "Document", body: "PDF, DOCX, TXT", icon: FileText },
  { key: "article", label: "Article link", body: "Blog post or web page", icon: Globe },
  { key: "prompt", label: "From a prompt", body: "Describe a course", icon: Sparkles },
];

export function CreateCourseForm({
  userId,
  initialUrl = "",
  capabilities,
}: {
  userId: string;
  initialUrl?: string;
  capabilities: Capabilities;
}) {
  const [kind, setKind] = useState<"youtube" | OtherSource>("youtube");
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" role="tablist" aria-label="Course source">
        {SOURCE_TABS.map((t) => {
          const active = kind === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setKind(t.key)}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all",
                active ? "border-ink bg-ink text-ink-foreground shadow-sm" : "bg-card hover:border-foreground/25",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl",
                  active ? "bg-ink-foreground/10" : "bg-muted",
                )}
              >
                <t.icon className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t.label}</span>
                <span className={cn("block truncate text-xs", active ? "text-ink-foreground/65" : "text-muted-foreground")}>{t.body}</span>
              </span>
            </button>
          );
        })}
      </div>
      {kind === "youtube" ? (
        <YouTubeCourseForm userId={userId} initialUrl={initialUrl} />
      ) : (
        <SourceCourseForm key={kind} userId={userId} kind={kind} capabilities={capabilities} />
      )}
    </div>
  );
}
