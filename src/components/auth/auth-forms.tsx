"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  type AuthState,
} from "@/app/(auth)/actions";

function FormAlert({ state }: { state: AuthState }) {
  if (state.error) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
      </div>
    );
  }
  if (state.message) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2.5 text-sm text-foreground">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> {state.message}
      </div>
    );
  }
  return null;
}

function Field({ label, children, hint }: { label: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">{typeof label === "string" ? <Label>{label}</Label> : label}{hint}</div>
      {children}
    </div>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z" />
      <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.87 8.88 4.76 12 4.76Z" />
    </svg>
  );
}

function GoogleButton({ next }: { next: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-10 w-full"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
            });
            if (error) throw error;
          } catch (e) {
            setError(e instanceof Error ? e.message : "Google sign-in failed");
            setLoading(false);
          }
        }}
      >
        {loading ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Divider() {
  return (
    <div className="relative my-6 text-center text-xs text-muted-foreground">
      <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <span className="relative bg-background px-3">or continue with email</span>
    </div>
  );
}

function ConfigNotice() {
  if (publicEnv.supabaseUrl && publicEnv.supabaseAnonKey) return null;
  return (
    <div className="mb-6 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
      Supabase is not configured. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
      <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable sign-in.
    </div>
  );
}

export function LoginForm({ next, error }: { next: string; error?: string }) {
  const [state, action, pending] = useActionState(signInAction, {
    error:
      error === "auth_callback"
        ? "We couldn't complete sign-in. Please try again."
        : error === "link_invalid"
          ? "That link is invalid or has expired."
          : undefined,
  });
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Sign in to continue learning.</p>
      <div className="mt-8">
        <ConfigNotice />
        <GoogleButton next={next} />
        <Divider />
        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} className="h-10" />
          </Field>
          <Field
            label="Password"
            hint={<Link href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>}
          >
            <Input name="password" type="password" autoComplete="current-password" required className="h-10" />
          </Field>
          <FormAlert state={state} />
          <SubmitButton pending={pending}>Sign in</SubmitButton>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href={`/signup${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUpAction, {});
  if (state.message) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
          <MailCheck className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Turn your first YouTube video into a course in minutes.</p>
      <div className="mt-8">
        <ConfigNotice />
        <GoogleButton next={next} />
        <Divider />
        <form action={action} className="space-y-4">
          <Field label="Full name">
            <Input name="fullName" autoComplete="name" required defaultValue={state.fields?.fullName} className="h-10" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required defaultValue={state.fields?.email} className="h-10" />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="new-password" minLength={8} required className="h-10" />
          </Field>
          <p className="text-xs text-muted-foreground">At least 8 characters. Your name appears on your certificates.</p>
          <FormAlert state={state} />
          <SubmitButton pending={pending}>Create account</SubmitButton>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, {});
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Enter your email and we&apos;ll send you a reset link.</p>
      <form action={action} className="mt-8 space-y-4">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required className="h-10" />
        </Field>
        <FormAlert state={state} />
        <SubmitButton pending={pending}>Send reset link</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered it? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, {});
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Make it at least 8 characters.</p>
      <form action={action} className="mt-8 space-y-4">
        <Field label="New password">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required className="h-10" />
        </Field>
        <Field label="Confirm password">
          <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required className="h-10" />
        </Field>
        <FormAlert state={state} />
        <SubmitButton pending={pending}>Update password</SubmitButton>
      </form>
    </div>
  );
}
