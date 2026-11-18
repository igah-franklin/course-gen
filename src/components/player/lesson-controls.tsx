"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bookmark, Check, ChevronLeft, ChevronRight, Loader2, NotebookPen } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  recordLessonVisitAction,
  saveLessonProgressAction,
  saveNoteAction,
  setLessonCompleteAction,
  toggleBookmarkAction,
} from "@/lib/actions/learning";
import { cn } from "@/lib/utils";

const SAVE_EVERY_MS = 15_000;
const IDLE_AFTER_MS = 90_000;

function scrollFraction() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
}

/** Restores reading position and records reading time + position while the learner is active. */
export function useReadingTracker(courseId: string, lessonId: string, initialPosition: number) {
  const lastActivity = useRef(0);
  const activeMs = useRef(0);
  const lastTick = useRef(0);

  useEffect(() => {
    lastActivity.current = Date.now();
    lastTick.current = Date.now();
    recordLessonVisitAction(courseId, lessonId).catch(() => {});
    // Resume where the learner left off.
    if (initialPosition > 0.03 && initialPosition < 0.97) {
      requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: initialPosition * max, behavior: "instant" as ScrollBehavior });
        toast("Resumed where you left off", { duration: 2500 });
      });
    } else {
      window.scrollTo({ top: 0 });
    }

    const markActive = () => (lastActivity.current = Date.now());
    const events = ["scroll", "mousemove", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));

    const accumulate = () => {
      const now = Date.now();
      if (document.visibilityState === "visible" && now - lastActivity.current < IDLE_AFTER_MS) {
        activeMs.current += now - lastTick.current;
      }
      lastTick.current = now;
    };
    const flush = () => {
      accumulate();
      const seconds = Math.min(300, Math.floor(activeMs.current / 1000));
      activeMs.current -= seconds * 1000;
      saveLessonProgressAction(courseId, lessonId, { position: scrollFraction(), seconds }).catch(() => {});
    };
    const interval = setInterval(flush, SAVE_EVERY_MS);
    const tickInterval = setInterval(accumulate, 5_000);
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);

    return () => {
      flush();
      clearInterval(interval);
      clearInterval(tickInterval);
      document.removeEventListener("visibilitychange", onHide);
      events.forEach((e) => window.removeEventListener(e, markActive));
    };
  }, [courseId, lessonId, initialPosition]);
}

export function LessonControls({
  courseId,
  lessonId,
  completed: initialCompleted,
  readPosition,
  prevHref,
  nextHref,
  nextLabel,
}: {
  courseId: string;
  lessonId: string;
  completed: boolean;
  readPosition: number;
  prevHref: string | null;
  nextHref: string | null;
  nextLabel: string;
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState(initialCompleted);
  const [pending, start] = useTransition();
  // Remounted per lesson via `key`, so initial props are authoritative.
  useReadingTracker(courseId, lessonId, readPosition);

  const toggleComplete = () => {
    const next = !completed;
    setCompleted(next); // optimistic
    start(async () => {
      const r = await setLessonCompleteAction(courseId, lessonId, next);
      if (!r.ok) {
        setCompleted(!next);
        toast.error(r.error);
        return;
      }
      if (next && r.data.eligible) {
        router.push(`/dashboard/courses/${courseId}/learn?complete=1`);
        return;
      }
      if (next) {
        toast.success("Lesson completed");
        if (nextHref) router.push(nextHref);
        else router.refresh();
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-6">
        {prevHref ? (
          <Link href={prevHref} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10")}>
            <ChevronLeft /> <span className="hidden sm:inline">Previous Lesson</span>
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: "outline", size: "lg" }), "pointer-events-none h-10 opacity-40")}>
            <ChevronLeft /> <span className="hidden sm:inline">Previous Lesson</span>
          </span>
        )}
        <Button
          size="lg"
          variant={completed ? "secondary" : "default"}
          className={cn("h-10 flex-1", completed && "text-primary")}
          onClick={toggleComplete}
          disabled={pending}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          {completed ? "Completed" : "Mark as Complete"}
        </Button>
        {nextHref ? (
          <Link href={nextHref} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10")}>
            <span className="hidden sm:inline">{nextLabel}</span> <ChevronRight />
          </Link>
        ) : (
          <span className={cn(buttonVariants({ variant: "outline", size: "lg" }), "pointer-events-none h-10 opacity-40")}>
            <span className="hidden sm:inline">Next Lesson</span> <ChevronRight />
          </span>
        )}
      </div>
    </div>
  );
}

export function BookmarkButton({ courseId, lessonId, bookmarked: initial }: { courseId: string; lessonId: string; bookmarked: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={on}
      disabled={pending}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(async () => {
          const r = await toggleBookmarkAction(courseId, lessonId, next);
          if (!r.ok) {
            setOn(!next);
            toast.error(r.error);
          } else {
            toast.success(next ? "Lesson bookmarked" : "Bookmark removed");
            router.refresh();
          }
        });
      }}
    >
      <Bookmark className={cn(on && "fill-current text-primary")} />
      <span className="hidden sm:inline">{on ? "Bookmarked" : "Bookmark"}</span>
    </Button>
  );
}

export function NotesButton({ courseId, lessonId, initialNote }: { courseId: string; lessonId: string; initialNote: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initialNote);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueSave = (value: string) => {
    setText(value);
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await saveNoteAction(courseId, lessonId, value);
      setStatus(r.ok ? "saved" : "error");
    }, 800);
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <NotebookPen className={cn(text && "text-primary")} />
        <span className="hidden sm:inline">Notes</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>My notes</SheetTitle>
            <SheetDescription>Private to you. Saved automatically.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col px-4 pb-4">
            <Textarea
              value={text}
              onChange={(e) => queueSave(e.target.value)}
              placeholder="Write down key ideas, questions, or things to try…"
              className="min-h-[50vh] flex-1 resize-none text-sm leading-6"
              autoFocus
            />
            <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
              {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Could not save — retrying on next edit" : ""}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
