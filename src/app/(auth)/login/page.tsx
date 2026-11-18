import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/auth-forms";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/utils/safe-next";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  // Already signed in: never show the sign-in form (backstop for the proxy redirect).
  if (await getCurrentUser()) redirect(next);
  const error = typeof sp.error === "string" ? sp.error : undefined;
  return <LoginForm next={next} error={error} />;
}
