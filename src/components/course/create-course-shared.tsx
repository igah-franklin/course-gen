"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Plug, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type Capabilities = { ai: boolean; transcriptProvider: boolean };
export type Engine = "server" | "assistant";

export async function uploadFile(userId: string, file: File, folder: string) {
  const supabase = createClient();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${userId}/${folder}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from("uploads").upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export function StepCard({
  step,
  title,
  description,
  children,
  muted,
}: {
  step: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section className="rounded-3xl border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-2.5 text-[15px] font-medium">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full text-xs",
            muted ? "bg-muted text-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {step}
        </span>
        {title}
      </div>
      {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </section>
  );
}

export function EnginePicker({ engine, onChange, aiAvailable }: { engine: Engine; onChange: (e: Engine) => void; aiAvailable: boolean }) {
  return (
    <StepCard step="★" title="Who should write the course?">
      <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Generation engine">
        {[
          {
            key: "server" as const,
            title: "Our AI, in the background",
            body: "Upload and walk away. We generate the whole course and notify you here when it's ready.",
            icon: Sparkles,
            disabled: aiAvailable ? undefined : "Built-in AI isn't configured on this server",
          },
          {
            key: "assistant" as const,
            title: "Your Claude or ChatGPT",
            body: "Uses your own subscription through the connector — no API keys. Your assistant writes each lesson in a chat.",
            icon: Plug,
          },
        ].map((o) => {
          const selected = engine === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={Boolean(o.disabled)}
              onClick={() => onChange(o.key)}
              className={cn(
                "flex gap-3 rounded-2xl border p-4 text-left transition-all",
                selected ? "border-primary bg-accent/50 ring-1 ring-primary" : "hover:border-primary/40",
                o.disabled && "cursor-not-allowed opacity-50 hover:border-border",
              )}
            >
              <o.icon className={cn("mt-0.5 size-5 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
              <span>
                <span className="block text-sm font-medium">{o.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{o.disabled ?? o.body}</span>
              </span>
            </button>
          );
        })}
      </div>
      {engine === "assistant" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Haven&apos;t connected yet?{" "}
          <Link href="/dashboard/connect" className="font-medium text-primary hover:underline">
            Set up the connector
          </Link>{" "}
          — it takes a minute. You can also start courses directly from the chat.
        </p>
      )}
    </StepCard>
  );
}

export function FileDrop({
  accept,
  label,
  hint,
  file,
  busy,
  onFile,
  onClear,
}: {
  accept: string;
  label: string;
  hint: string;
  file: { name: string } | null;
  busy: boolean;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  if (file) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-tile-mint px-4 py-3 text-sm">
        <CheckCircle2 className="size-4 text-success" />
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
        <button onClick={onClear} className="text-foreground/60 hover:text-foreground" aria-label="Remove file">
          <X className="size-4" />
        </button>
      </div>
    );
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        "mt-4 flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center transition-colors",
        drag ? "border-primary bg-accent/40" : "bg-muted/30",
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-card">
        {busy ? <Loader2 className="size-5 animate-spin text-primary" /> : <Upload className="size-5 text-muted-foreground" />}
      </span>
      <p className="mt-3 text-sm font-medium">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <Button variant="outline" size="sm" className="mt-4 h-9 px-4" disabled={busy} onClick={() => ref.current?.click()}>
        Choose file
      </Button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
