import { Suspense } from "react";
import Link from "next/link";
import { LayoutDashboard, LogOut } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* Auth-aware pieces for public pages. Session reads are request-time, so each
 * piece streams inside its own Suspense boundary; the static page around it
 * still prerenders. */

async function HeaderActions() {
  const user = await getCurrentUser();
  if (user) {
    return (
      <>
        <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }), "px-4")}>
          <LayoutDashboard /> Dashboard
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "px-3")}>
            <LogOut /> Log out
          </button>
        </form>
      </>
    );
  }
  return (
    <>
      <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "hidden sm:inline-flex")}>
        Sign in
      </Link>
      <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), "px-4")}>
        Get started
      </Link>
    </>
  );
}

/** Header buttons: "Dashboard" + "Log out" when signed in, "Sign in" + "Get started" otherwise. */
export function HeaderAuthActions() {
  return (
    <Suspense
      // Same footprint, no labels: avoids flashing the wrong buttons while the session resolves.
      fallback={<span aria-hidden className="inline-block h-10 w-[188px] rounded-xl" />}
    >
      <HeaderActions />
    </Suspense>
  );
}

async function Cta({ className, signedOutLabel }: { className: string; signedOutLabel: string }) {
  const user = await getCurrentUser();
  return user ? (
    <Link href="/dashboard/courses/new" className={className}>
      Create a New Course
    </Link>
  ) : (
    <Link href="/signup" className={className}>
      {signedOutLabel}
    </Link>
  );
}

/** Primary call to action: sign up when signed out, straight to course creation when signed in. */
export function PrimaryCta({ className, signedOutLabel }: { className?: string; signedOutLabel: string }) {
  const cls = cn(buttonVariants({ size: "lg" }), className);
  return (
    <Suspense
      fallback={
        <span aria-hidden className={cn(cls, "pointer-events-none opacity-0")}>
          {signedOutLabel}
        </span>
      }
    >
      <Cta className={cls} signedOutLabel={signedOutLabel} />
    </Suspense>
  );
}
