import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { SidebarNav, SidebarNavFallback } from "@/components/dashboard/sidebar-nav";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { SidebarCommunityCard } from "@/components/dashboard/community-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { getCachedCommunityLinks } from "@/lib/settings-cached";
import { redirect } from "next/navigation";

export default function DashboardShellLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[280px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r bg-sidebar px-5 py-7 lg:flex">
        <div className="px-3 pb-9">
          <Logo href="/dashboard" />
        </div>
        <Suspense fallback={<SidebarNavFallback />}>
          <SidebarNavWithRole />
        </Suspense>
        <div className="mt-auto space-y-4 pt-8">
          <Suspense fallback={null}>
            <SidebarCommunity />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-11 w-full" />}>
            <SidebarUser />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur lg:hidden">
          <Suspense fallback={<div className="size-8" />}>
            <MobileNavWithRole />
          </Suspense>
          <Logo href="/dashboard" />
          <div className="ml-auto w-10">
            <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
              <SidebarUser compact />
            </Suspense>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-12 lg:py-10">{children}</main>
      </div>
    </div>
  );
}

async function SidebarNavWithRole() {
  const user = await getCurrentUser();
  return <SidebarNav isAdmin={user?.role === "admin"} />;
}

async function MobileNavWithRole() {
  const [user, links] = await Promise.all([getCurrentUser(), getCachedCommunityLinks()]);
  return <MobileNav isAdmin={user?.role === "admin"} footer={<SidebarCommunityCard links={links} />} />;
}

async function SidebarCommunity() {
  const links = await getCachedCommunityLinks();
  return <SidebarCommunityCard links={links} />;
}

async function SidebarUser({ compact = false }: { compact?: boolean }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <UserMenu
      compact={compact}
      user={{ fullName: user.fullName, email: user.email, avatarUrl: user.avatarUrl, role: user.role }}
    />
  );
}
