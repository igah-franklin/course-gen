import Link from "next/link";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-medium tracking-tight sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 text-[15px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export type Tone = "sky" | "mint" | "lilac" | "butter" | "peach" | "plain";

export const TONE_BG: Record<Tone, string> = {
  sky: "bg-tile-sky",
  mint: "bg-tile-mint",
  lilac: "bg-tile-lilac",
  butter: "bg-tile-butter",
  peach: "bg-tile-peach",
  plain: "bg-card border",
};

/** Pastel stat tile: big number, quiet label. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "plain",
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-3xl p-5", TONE_BG[tone])}>
      <span className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-card/70 text-foreground/70 backdrop-blur-sm">
        <Icon className="size-4" />
      </span>
      <p className="text-[40px] leading-none font-medium tracking-tight tabular-nums">{value}</p>
      <p className="mt-3 text-sm text-foreground/70">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-foreground/50">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-3xl border border-dashed bg-card/60 px-6 py-14 text-center", className)}>
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <Icon className="size-6" />
      </span>
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? (
        <Link href={action.href} className={cn(buttonVariants({ size: "lg" }), "mt-6 px-5")}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function ProgressBar({ value, className, size = "md" }: { value: number; className?: string; size?: "sm" | "md" }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("w-full overflow-hidden rounded-full bg-foreground/10", size === "sm" ? "h-1.5" : "h-2", className)}
    >
      <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-3xl border bg-card p-5 sm:p-6", className)}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  draft: { label: "Queued", cls: "bg-muted text-muted-foreground" },
  processing: { label: "Generating", cls: "bg-tile-lilac text-foreground/80" },
  ready: { label: "Ready", cls: "bg-tile-mint text-foreground/80" },
  needs_review: { label: "Needs review", cls: "bg-tile-butter text-foreground/80" },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
};

export function CourseStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium", s.cls, className)}>{s.label}</span>
  );
}

/** Small round marker used in progress flow lines. */
export function FlowDot({ done, active, className }: { done: boolean; active?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full transition-colors",
        done
          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
          : active
            ? "border-2 border-primary bg-card"
            : "border-[1.5px] border-foreground/20 bg-card",
        className,
      )}
      aria-hidden
    >
      {done ? <Check className="size-3" strokeWidth={3} /> : active ? <span className="size-2 rounded-full bg-primary" /> : null}
    </span>
  );
}

/**
 * One row of a vertical progress flow line. Rows rendered inside a <ul> are
 * joined by a connector running from this row's dot to the next row's dot.
 * `dotTop` is the dot's offset from the row's top edge (px), and `dotLeft` its
 * horizontal offset — both must match the row's padding.
 */
export function FlowStep({
  done,
  active,
  last,
  dashed,
  children,
  className,
  dotTop = 12,
  dotLeft = 12,
}: {
  done: boolean;
  active?: boolean;
  last?: boolean;
  dashed?: boolean;
  children: React.ReactNode;
  className?: string;
  dotTop?: number;
  dotLeft?: number;
}) {
  return (
    <li className={cn("relative", className)}>
      {!last && (
        <span
          aria-hidden
          className={cn(
            "absolute w-0 border-l-[1.5px]",
            dashed ? "border-dashed" : "border-solid",
            done ? "border-primary/50" : "border-foreground/15",
          )}
          style={{ left: dotLeft + 10.25, top: dotTop + 22, bottom: -dotTop }}
        />
      )}
      <span className="absolute" style={{ left: dotLeft, top: dotTop }}>
        <FlowDot done={done} active={active} />
      </span>
      {children}
    </li>
  );
}

export function relativeTime(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "Never";
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
