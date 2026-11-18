import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AlertTriangle, BookOpen, Check, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { readAuthorizeParams, validateAuthorize } from "@/lib/oauth/server";
import { publicEnv } from "@/lib/env";
import { decideAuthorization } from "./actions";

export const metadata: Metadata = { title: "Connect an AI assistant", robots: { index: false } };

export default function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/30 px-4 py-10">
      <Logo />
      <div className="mt-10 w-full max-w-md">
        <Suspense
          fallback={
            <div className="flex h-80 items-center justify-center rounded-2xl border bg-card">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <Consent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Consent({ searchParams }: { searchParams: PageProps<"/oauth/authorize">["searchParams"] }) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const params = readAuthorizeParams(get);
  const check = await validateAuthorize(params);

  if (!check.ok) {
    if (!check.showToUser) redirect(check.redirectTo);
    return (
      <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto size-8 text-destructive" />
        <h1 className="mt-4 text-lg font-semibold">Can&apos;t connect this application</h1>
        <p className="mt-2 text-sm text-muted-foreground">{check.error}</p>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs.toString()}`)}`);
  }

  const redirectHost = new URL(params.redirectUri).host;
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="p-7">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
          <ShieldCheck className="size-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">
          Allow <span className="text-primary">{check.client.client_name}</span> to use your {publicEnv.appName} account?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user.email}</span>
        </p>

        <ul className="mt-6 space-y-3 text-sm">
          {[
            "Create courses from YouTube videos in your account",
            "Read the transcripts and courses it is building for you",
            "Save lessons, illustrations and quizzes it writes",
            "See a list of your courses",
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {t}
            </li>
          ))}
        </ul>
        <p className="mt-4 flex gap-2.5 text-sm text-muted-foreground">
          <BookOpen className="mt-0.5 size-4 shrink-0" />
          It can&apos;t see your password or anyone else&apos;s data, and you can disconnect it anytime.
        </p>

        <div className="mt-6 rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <ExternalLink className="size-3.5" /> You&apos;ll be sent back to <span className="font-medium text-foreground">{redirectHost}</span>
          </p>
          <p className="mt-1">Only approve if you just started connecting this app yourself (for example from Claude or ChatGPT).</p>
        </div>
      </div>

      <form action={decideAuthorization} className="flex gap-3 border-t bg-muted/20 p-5">
        <input type="hidden" name="response_type" value={params.responseType} />
        <input type="hidden" name="client_id" value={params.clientId} />
        <input type="hidden" name="redirect_uri" value={params.redirectUri} />
        <input type="hidden" name="code_challenge" value={params.codeChallenge} />
        <input type="hidden" name="code_challenge_method" value={params.codeChallengeMethod} />
        <input type="hidden" name="scope" value={params.scope} />
        {params.state && <input type="hidden" name="state" value={params.state} />}
        {params.resource && <input type="hidden" name="resource" value={params.resource} />}
        <Button type="submit" name="decision" value="deny" variant="outline" size="lg" className="h-10 flex-1">
          Cancel
        </Button>
        <Button type="submit" name="decision" value="approve" size="lg" className="h-10 flex-1">
          Allow access
        </Button>
      </form>
    </div>
  );
}
