"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { safeNext } from "@/lib/utils/safe-next";

export type AuthState = { error?: string; message?: string; fields?: Record<string, string> };

const notConfigured: AuthState = {
  error: "Authentication is not configured. Set the Supabase environment variables (see .env.example).",
};

const Email = z.string().trim().email("Enter a valid email address");
const Password = z.string().min(8, "Password must be at least 8 characters");

export async function signInAction(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return notConfigured;
  const parsed = z.object({ email: Email, password: z.string().min(1, "Enter your password") }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const fields = { email: String(formData.get("email") ?? "") };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, fields };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Please verify your email address first — check your inbox for the confirmation link.", fields };
    }
    return { error: "Incorrect email or password.", fields };
  }
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function signUpAction(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return notConfigured;
  const parsed = z
    .object({ fullName: z.string().trim().min(2, "Enter your full name").max(120), email: Email, password: Password })
    .safeParse({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
  const fields = { email: String(formData.get("email") ?? ""), fullName: String(formData.get("fullName") ?? "") };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, fields };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=/dashboard`,
    },
  });
  if (error) return { error: error.message, fields };
  if (data.session) redirect("/dashboard"); // email confirmation disabled in Supabase
  return {
    message: `We've sent a verification link to ${parsed.data.email}. Click it to activate your account.`,
  };
}

export async function forgotPasswordAction(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return notConfigured;
  const parsed = Email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/reset-password`,
  });
  // Same response whether or not the account exists (prevents account enumeration).
  return { message: "If an account exists for that email, a password reset link is on its way." };
}

export async function resetPasswordAction(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return notConfigured;
  const parsed = z
    .object({ password: Password, confirm: z.string() })
    .refine((d) => d.password === d.confirm, { message: "Passwords do not match" })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  redirect("/dashboard?passwordUpdated=1");
}

export async function resendVerificationAction(_: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return notConfigured;
  const parsed = Email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=/dashboard` },
  });
  if (error) return { error: error.message };
  return { message: "Verification email sent." };
}
