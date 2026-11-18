import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdminToolbar({
  basePath,
  q,
  filters,
  active,
  placeholder = "Search…",
  search = true,
}: {
  basePath: string;
  q?: string;
  filters?: { key: string; label: string }[];
  active?: string;
  placeholder?: string;
  search?: boolean;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap gap-1.5">
        {filters?.map((f) => (
          <Link
            key={f.key}
            href={`${basePath}?${new URLSearchParams({ ...(f.key !== "all" ? { status: f.key } : {}), ...(q ? { q } : {}) })}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              (active ?? "all") === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>
      {search && (
      <form action={basePath} className="relative w-full md:w-72">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        {active && active !== "all" && <input type="hidden" name="status" value={active} />}
        <Input name="q" defaultValue={q} placeholder={placeholder} className="h-9 pl-9" />
      </form>
      )}
    </div>
  );
}

export function Pagination({ basePath, page, pages, params }: { basePath: string; page: number; pages: number; params: Record<string, string> }) {
  if (pages <= 1) return null;
  const href = (p: number) => `${basePath}?${new URLSearchParams({ ...params, page: String(p) })}`;
  return (
    <nav className="mt-6 flex items-center justify-end gap-2">
      <Link href={href(page - 1)} className={cn(buttonVariants({ variant: "outline", size: "sm" }), page <= 1 && "pointer-events-none opacity-50")}>
        <ChevronLeft /> Prev
      </Link>
      <span className="text-sm text-muted-foreground">
        {page} / {pages}
      </span>
      <Link href={href(page + 1)} className={cn(buttonVariants({ variant: "outline", size: "sm" }), page >= pages && "pointer-events-none opacity-50")}>
        Next <ChevronRight />
      </Link>
    </nav>
  );
}

export const PAGE_SIZE = 25;
export const clean = (q: string) => q.replace(/[%_,()]/g, " ").trim();
