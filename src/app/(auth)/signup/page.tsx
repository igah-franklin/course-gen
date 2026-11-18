import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/components/auth/auth-forms";
import { safeNext } from "@/lib/utils/safe-next";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <Suspense fallback={<div className="h-96" />}>
      <SignupContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignupContent({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const sp = await searchParams;
  return <SignupForm next={safeNext(typeof sp.next === "string" ? sp.next : null)} />;
}
