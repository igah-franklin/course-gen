import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-screen bg-muted/30 lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b bg-sidebar px-3 py-4 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-2 pb-4 lg:pb-6">
          <Logo href="/admin" />
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">Admin</span>
        </div>
        <Suspense fallback={<div className="h-64" />}>
          <AdminNav />
        </Suspense>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
