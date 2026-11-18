import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — only use in trusted server code after
 * performing your own authorization checks. Never import into client code.
 */
export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const key = serverEnv.supabaseServiceRoleKey;
  if (!publicEnv.supabaseUrl || !key) {
    throw new Error(
      "Supabase service role is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  cached = createClient(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
