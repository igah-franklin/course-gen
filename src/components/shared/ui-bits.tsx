import Link from "next/link";
import type { LucideIcon } from "lucide-react";
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
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
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
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center", className)}>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
        <Icon className="size-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? (
        <Link href={action.href} className={cn(buttonVariants({ size: "lg" }), "mt-6 px-4")}>
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
      className={cn("w-full overflow-hidden rounded-full bg-muted", size === "sm" ? "h-1.5" : "h-2", className)}
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
    <section className={cn("rounded-xl border bg-card p-5 shadow-xs sm:p-6", className)}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
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
  processing: { label: "Generating", cls: "bg-accent text-accent-foreground" },
  ready: { label: "Ready", cls: "bg-success/10 text-success" },
  needs_review: { label: "Needs review", cls: "bg-warning/15 text-[oklch(0.5_0.13_60)]" },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive" },
};

export function CourseStatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", s.cls)}>{s.label}</span>;
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
