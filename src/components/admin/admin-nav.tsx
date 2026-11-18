"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Award, BookOpen, Cpu, LayoutDashboard, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/admin/jobs", label: "Generation jobs", icon: Cpu },
  { href: "/admin/certificates", label: "Certificates", icon: Award },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map((i) => {
        const active = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <i.icon className={cn("size-4", active && "text-primary")} /> {i.label}
          </Link>
        );
      })}
      <Link
        href="/dashboard"
        className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground lg:mt-4"
      >
        <ArrowLeft className="size-4" /> Back to app
      </Link>
    </nav>
  );
}
