import Link from "next/link";
import { cn } from "@/lib/utils";
import { publicEnv } from "@/lib/env";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-sm shadow-primary/30",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M4 6.5 12 3l8 3.5-8 3.5-8-3.5Z" strokeLinejoin="round" />
        <path d="M4 12l8 3.5 8-3.5" strokeLinejoin="round" opacity={0.75} />
        <path d="M4 17.5 12 21l8-3.5" strokeLinejoin="round" opacity={0.5} />
      </svg>
    </span>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="text-lg">
        {publicEnv.appName}
        <span className="text-primary">.</span>
      </span>
    </Link>
  );
}
