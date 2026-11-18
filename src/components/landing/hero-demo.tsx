"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  FileText,
  Layers,
  Link2,
  Loader2,
  PlayCircle,
  Sparkles,
  Workflow,
} from "lucide-react";
import { YouTubeIcon } from "@/components/brand/brand-icons";
import { cn } from "@/lib/utils";

/**
 * Illustrative product walkthrough for the landing page. It is an animation
 * of the flow (clearly labelled as a demo), not real data.
 */

const URL_TEXT = "youtube.com/watch?v=intro-to-web-dev";
const STAGES = [
  "Retrieving video information",
  "Extracting transcript",
  "Analyzing video content",
  "Organizing course modules",
  "Generating detailed lessons",
  "Creating illustrations",
];
const MODULES = [
  { title: "Introduction to Web Development", lessons: ["What is web development?", "Frontend vs backend", "Tools you need"] },
  { title: "HTML Fundamentals", lessons: ["Your first HTML page", "Elements & attributes", "Links and images"] },
  { title: "CSS Fundamentals", lessons: ["Selectors", "The box model", "Styling your page"] },
];

type Phase = "typing" | "analyzing" | "course";

export function HeroDemo() {
  const [rawPhase, setPhase] = useState<Phase>("typing");
  const [typed, setTyped] = useState(0);
  const [stage, setStage] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const phase: Phase = reduced ? "course" : rawPhase;

  useEffect(() => {
    if (reduced) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (typed < URL_TEXT.length) t = setTimeout(() => setTyped((n) => n + 1), 45);
      else t = setTimeout(() => setPhase("analyzing"), 700);
    } else if (phase === "analyzing") {
      if (stage < STAGES.length) t = setTimeout(() => setStage((s) => s + 1), 750);
      else t = setTimeout(() => setPhase("course"), 400);
    } else {
      t = setTimeout(() => {
        setTyped(0);
        setStage(0);
        setPhase("typing");
        setCycle((c) => c + 1);
      }, 6500);
    }
    return () => clearTimeout(t);
  }, [rawPhase, phase, typed, stage, reduced]);

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      <div className="absolute -inset-x-10 -top-10 -bottom-10 -z-10 rounded-[3rem] bg-[radial-gradient(ellipse_at_top,oklch(0.93_0.05_277/.7),transparent_65%)]" />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/10 ring-1 ring-black/[0.03]">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-xs text-muted-foreground">Create a course</span>
          <span className="ml-auto rounded-md border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Demo
          </span>
        </div>

        <div className="grid min-h-[380px] grid-cols-1 md:grid-cols-[1.05fr_1fr]">
          {/* Left: input + pipeline */}
          <div className="flex min-w-0 flex-col gap-5 border-b p-5 md:border-r md:border-b-0 md:p-7">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-medium text-muted-foreground">YouTube URL</p>
              <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl border bg-background px-3 py-2.5 shadow-xs">
                <YouTubeIcon className="size-4 shrink-0 text-[#FF0000]" />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                  {URL_TEXT.slice(0, reduced ? URL_TEXT.length : typed)}
                  {phase === "typing" && <span className="ml-px inline-block h-4 w-px animate-pulse bg-foreground align-middle" />}
                </span>
                <Link2 className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </div>
            </div>

            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4 text-primary" /> Analyzing the entire video
              </div>
              <ul className="space-y-2.5">
                {STAGES.map((label, i) => {
                  const done = phase === "course" || i < stage;
                  const active = phase === "analyzing" && i === stage;
                  return (
                    <li key={label} className="flex items-center gap-2.5 text-[13px]">
                      {done ? (
                        <CheckCircle2 className="size-4 text-primary" />
                      ) : active ? (
                        <Loader2 className="size-4 animate-spin text-primary" />
                      ) : (
                        <CircleDashed className="size-4 text-muted-foreground/50" />
                      )}
                      <span className={cn(done || active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Right: generated course */}
          <div className="relative min-w-0 bg-background p-5 md:p-7">
            <AnimatePresence mode="wait">
              {phase !== "course" ? (
                <motion.div
                  key={`wait-${cycle}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground"
                >
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-accent">
                    <Layers className="size-6 text-primary" />
                  </div>
                  <p className="text-sm">Your course will appear here</p>
                </motion.div>
              ) : (
                <motion.div key={`course-${cycle}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-primary">Generated course</p>
                    <h3 className="mt-1 text-lg font-semibold">Complete Beginner&apos;s Guide to Web Development</h3>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Layers className="size-3.5" /> 3 modules</span>
                      <span className="inline-flex items-center gap-1"><BookOpen className="size-3.5" /> 9 lessons</span>
                      <span className="inline-flex items-center gap-1"><Workflow className="size-3.5" /> 12 diagrams</span>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {MODULES.map((m, mi) => (
                      <motion.div
                        key={m.title}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 + mi * 0.25 }}
                        className="rounded-xl border p-3"
                      >
                        <div className="flex items-center justify-between text-[13px] font-medium">
                          <span>
                            <span className="text-muted-foreground">Module {mi + 1} · </span>
                            {m.title}
                          </span>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </div>
                        <ul className="mt-2 space-y-1.5">
                          {m.lessons.map((l, li) => (
                            <motion.li
                              key={l}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.3 + mi * 0.25 + li * 0.08 }}
                              className="flex items-center gap-2 text-xs text-muted-foreground"
                            >
                              {mi === 0 && li < 2 ? (
                                <Check className="size-3.5 text-primary" />
                              ) : li === 0 && mi === 0 ? (
                                <PlayCircle className="size-3.5" />
                              ) : (
                                <FileText className="size-3.5" />
                              )}
                              {l}
                            </motion.li>
                          ))}
                        </ul>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
