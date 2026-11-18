"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

export type FormState = { error?: string; message?: string };

export async function updateProfileAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  const parsed = z
    .object({
      fullName: z.string().trim().min(2, "Enter your full name").max(120),
      avatarUrl: z.union([z.literal(""), z.string().url("Avatar must be a valid URL").max(500)]),
    })
    .safeParse({ fullName: formData.get("fullName"), avatarUrl: formData.get("avatarUrl") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, avatar_url: parsed.data.avatarUrl || null })
    .eq("id", user.id);
  if (error) return { error: error.message };
  await supabase.auth.updateUser({ data: { full_name: parsed.data.fullName } });
  revalidatePath("/dashboard", "layout");
  return { message: "Profile updated. Certificates you earn from now on will use this name." };
}

export async function changeEmailAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  const parsed = z.string().trim().email("Enter a valid email").safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?next=/dashboard/settings` },
  );
  if (error) return { error: error.message };
  return { message: "Check both your old and new inbox to confirm the change." };
}

export async function changePasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  const parsed = z
    .object({ password: z.string().min(8, "Password must be at least 8 characters"), confirm: z.string() })
    .refine((d) => d.password === d.confirm, { message: "Passwords do not match" })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  return { message: "Password updated." };
}
