"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  GraduationCap,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FlowStep, ProgressBar } from "@/components/shared/ui-bits";
import { cn } from "@/lib/utils";
import { hrefFor, type PlayerLocation, type PlayerOutline } from "./player-nav";

/* Sidebar collapsed preference: per-viewer convenience in localStorage. */
const COLLAPSE_KEY = "player:collapsed";
const collapseListeners = new Set<() => void>();
function subscribeCollapsed(cb: () => void) {
  collapseListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    collapseListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  collapseListeners.forEach((cb) => cb());
}

export type { PlayerLocation, PlayerOutline } from "./player-nav";

function Outline({ outline, current, onNavigate }: { outline: PlayerOutline; current: PlayerLocation; onNavigate?: () => void }) {
  const currentModule = outline.modules.find((m) =>
    current.kind === "lesson" ? m.lessons.some((l) => l.id === current.id) : current.kind === "quiz" && m.quiz?.id === current.id,
  );
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(currentModule ? [currentModule.id] : outline.modules[0] ? [outline.modules[0].id] : []));
  // Expand the module containing the current item when navigation changes it
  // (state adjusted during render — React's recommended alternative to an effect).
  const [trackedModuleId, setTrackedModuleId] = useState(currentModule?.id);
  if (currentModule && currentModule.id !== trackedModuleId) {
    setTrackedModuleId(currentModule.id);
    setOpenIds((s) => new Set(s).add(currentModule.id));
  }

  return (
    <div className="space-y-1">
      {outline.modules.map((m, mi) => {
        const open = openIds.has(m.id);
        const done = m.lessons.filter((l) => l.completed).length;
        return (
          <div key={m.id}>
            <button
              onClick={() =>
                setOpenIds((s) => {
                  const n = new Set(s);
                  if (n.has(m.id)) n.delete(m.id);
                  else n.add(m.id);
                  return n;
                })
              }
              aria-expanded={open}
              className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-sidebar-accent"
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-medium",
                  m.completed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {m.completed ? <CheckCircle2 className="size-3.5" /> : String(mi + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-5 font-medium">{m.title}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {done}/{m.lessons.length} complete
                </span>
              </span>
              <ChevronDown className={cn("mt-1.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>
            {open && (
              <ul className="mt-0.5 mb-2 ml-2">
                {m.lessons.map((l, li) => {
                  const active = current.kind === "lesson" && current.id === l.id;
                  return (
                    <FlowStep key={l.id} done={l.completed} active={active} last={li === m.lessons.length - 1 && !m.quiz} dotLeft={4} dotTop={9}>
                      <Link
                        href={hrefFor(outline.courseId, { kind: "lesson", id: l.id })}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-start gap-2 rounded-xl py-2.5 pr-2 pl-9 text-[13px] leading-5 transition-colors",
                          active
                            ? "bg-accent font-medium text-foreground"
                            : l.completed
                              ? "font-medium text-foreground hover:bg-sidebar-accent"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                        )}
                      >
                        <span className="flex-1">{l.title}</span>
                        {l.bookmarked && <Bookmark className="mt-0.5 size-3 shrink-0 fill-current text-primary" />}
                      </Link>
                    </FlowStep>
                  );
                })}
                {m.quiz && (
                  <FlowStep done={!!m.quiz.passed} active={current.kind === "quiz" && current.id === m.quiz.id} last dotLeft={4} dotTop={9}>
                    <Link
                      href={hrefFor(outline.courseId, { kind: "quiz", id: m.quiz.id })}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2 rounded-xl py-2.5 pr-2 pl-9 text-[13px] leading-5 transition-colors",
                        current.kind === "quiz" && current.id === m.quiz.id
                          ? "bg-accent font-medium text-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                      )}
                    >
                      <ClipboardCheck className="size-3.5 text-primary" /> Module quiz
                    </Link>
                  </FlowStep>
                )}
              </ul>
            )}
          </div>
        );
      })}
      {outline.finalQuiz && (
        <Link
          href={hrefFor(outline.courseId, { kind: "quiz", id: outline.finalQuiz.id })}
          onClick={onNavigate}
          className={cn(
            "mt-3 flex items-center gap-2.5 rounded-2xl border bg-card px-3.5 py-3 text-[13px] font-medium transition-colors",
            current.kind === "quiz" && current.id === outline.finalQuiz.id ? "border-primary bg-accent" : "hover:bg-sidebar-accent",
          )}
        >
          <GraduationCap className={cn("size-4", outline.finalQuiz.passed ? "text-primary" : "text-muted-foreground")} />
          Final assessment
          {outline.finalQuiz.passed && <CheckCircle2 className="ml-auto size-4 text-primary" />}
        </Link>
      )}
    </div>
  );
}

function SidebarHeader({ outline }: { outline: PlayerOutline }) {
  return (
    <div className="border-b px-5 pt-5 pb-5">
      <Link href={`/dashboard/courses/${outline.courseId}`} className="line-clamp-2 text-[15px] leading-snug font-medium hover:text-primary">
        {outline.courseTitle}
      </Link>
      <div className="mt-4 rounded-2xl bg-sidebar-accent p-3.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Your Progress</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {outline.completedLessons}/{outline.totalLessons}
          </span>
        </div>
        <ProgressBar value={outline.progress} size="sm" className="mt-2.5" />
      </div>
    </div>
  );
}

export function PlayerShell({
  outline,
  current,
  children,
  footer,
  headerActions,
}: {
  outline: PlayerOutline;
  current: PlayerLocation;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
}) {
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [readPct, setReadPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setReadPct(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 100);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [current]);

  const toggle = () => writeCollapsed(!collapsed);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-80 flex-col border-r bg-sidebar transition-transform duration-200 lg:flex",
          collapsed && "-translate-x-full",
        )}
      >
        <SidebarHeader outline={outline} />
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Course outline">
          <Outline outline={outline} current={current} />
        </nav>
      </aside>

      {/* Mobile outline */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-sm gap-0 p-0">
          <SheetTitle className="sr-only">Course outline</SheetTitle>
          <SidebarHeader outline={outline} />
          <nav className="flex-1 overflow-y-auto p-3">
            <Outline outline={outline} current={current} onNavigate={() => setMobileOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>

      <div className={cn("transition-[padding] duration-200", !collapsed && "lg:pl-80")}>
        <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open course outline">
              <Menu className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={toggle}
              aria-label={collapsed ? "Show course outline" : "Hide course outline"}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </Button>
            <Link
              href={`/dashboard/courses/${outline.courseId}`}
              className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4 shrink-0" />
              <span className="truncate">{outline.courseTitle}</span>
            </Link>
            <div className="ml-auto flex items-center gap-1">{headerActions}</div>
          </div>
          {current.kind === "lesson" && (
            <div className="h-0.5 w-full bg-transparent" aria-hidden>
              <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${readPct}%` }} />
            </div>
          )}
        </header>
        <main className="mx-auto max-w-3xl px-4 pt-10 pb-12 sm:px-6">{children}</main>
        {footer}
      </div>
    </div>
  );
}
