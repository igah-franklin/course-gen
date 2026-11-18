"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  BookOpen,
  Compass,
  LayoutDashboard,
  Plug,
  PlusCircle,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean };

export const NAV_ITEMS: Item[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/courses", label: "My Courses", icon: BookOpen, exact: true },
  { href: "/dashboard/courses/new", label: "Create a Course", icon: PlusCircle },
  { href: "/dashboard/explore", label: "Explore Courses", icon: Compass },
  { href: "/dashboard/connect", label: "Connect AI", icon: Plug },
  { href: "/dashboard/certificates", label: "Certificates", icon: Award },
  { href: "/dashboard/community", label: "Community", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function SidebarNav({ isAdmin = false, onNavigate }: { isAdmin?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (item: Item) => {
    if (item.exact) {
      // "My Courses" also covers course detail pages (but not "new").
      if (item.href === "/dashboard/courses") {
        return pathname === item.href || (pathname.startsWith("/dashboard/courses/") && !pathname.startsWith("/dashboard/courses/new"));
      }
      return pathname === item.href;
    }
    return pathname.startsWith(item.href);
  };

  return (
    <nav className="space-y-0.5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <item.icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            {item.label}
          </Link>
        );
      })}
      {isAdmin && (
        <Link
          href="/admin"
          onClick={onNavigate}
          className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <ShieldCheck className="size-4" /> Admin
        </Link>
      )}
    </nav>
  );
}

/** Static nav (no active state) used as the Suspense fallback while the pathname resolves. */
export function SidebarNavFallback() {
  return (
    <nav className="space-y-0.5">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground"
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
