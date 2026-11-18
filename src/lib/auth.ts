import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured, serverEnv } from "@/lib/env";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: "user" | "admin";
  emailVerified: boolean;
};

/**
 * Data Access Layer: resolves the signed-in user (verified against Supabase
 * Auth) and their profile. Deduplicated per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const user = data.user;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();

  let role: "user" | "admin" = profile?.role === "admin" ? "admin" : "user";

  // Bootstrap admins from ADMIN_EMAILS (server-side only).
  const email = (user.email ?? "").toLowerCase();
  if (role !== "admin" && email && serverEnv.adminEmails.includes(email) && user.email_confirmed_at) {
    try {
      await createAdminClient().from("profiles").update({ role: "admin" }).eq("id", user.id);
      role = "admin";
    } catch {
      /* service role not configured */
    }
  }

  return {
    id: user.id,
    email: user.email ?? "",
    fullName:
      profile?.full_name ??
      (user.user_metadata?.full_name as string | undefined) ??
      (user.email ? user.email.split("@")[0] : "Learner"),
    avatarUrl: profile?.avatar_url ?? (user.user_metadata?.avatar_url as string | undefined) ?? null,
    role,
    emailVerified: Boolean(user.email_confirmed_at),
  };
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser("/admin");
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}
