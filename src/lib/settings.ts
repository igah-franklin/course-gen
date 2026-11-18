import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv, serverEnv } from "@/lib/env";

export const CommunitySettings = z.object({
  whatsapp_url: z.string().url().nullable().catch(null),
  telegram_url: z.string().url().nullable().catch(null),
});
export const CertificateSettings = z.object({
  platform_name: z.string().catch("CourseForge"),
  signatory_name: z.string().catch("CourseForge Learning Team"),
  signatory_title: z.string().catch("Platform Representative"),
  accent_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .catch("#4f46e5"),
});
export const CompletionSettings = z.object({
  require_final_assessment: z.boolean().catch(true),
  default_passing_score: z.number().int().min(0).max(100).catch(70),
});
export const AiSettings = z.object({
  model: z.string().catch("claude-opus-5-5"),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).catch("medium"),
  max_lessons_per_course: z.number().int().min(3).max(200).catch(60),
  image_generation: z.boolean().catch(false),
});

export const PaymentSettings = z.object({
  platform_fee_percent: z.number().min(0).max(90).catch(10),
});

export type CommunityLinks = { whatsappUrl: string | null; telegramUrl: string | null };

const schemas = {
  community: CommunitySettings,
  certificates: CertificateSettings,
  completion: CompletionSettings,
  ai: AiSettings,
  payments: PaymentSettings,
} as const;
export type SettingKey = keyof typeof schemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof schemas)[K]>;

/** Reads a platform setting with schema defaults. Server-only (service role). */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const schema = schemas[key];
  let raw: unknown = {};
  try {
    if (serverEnv.supabaseServiceRoleKey) {
      const { data } = await createAdminClient()
        .from("platform_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      raw = data?.value ?? {};
    }
  } catch {
    raw = {};
  }
  return schema.parse(raw ?? {}) as SettingValue<K>;
}

/**
 * Community links: admin settings take precedence, environment variables are
 * the fallback. Nothing is invented — missing links render as "not configured".
 */
export async function getCommunityLinks(): Promise<CommunityLinks> {
  const s = await getSetting("community");
  return {
    whatsappUrl: s.whatsapp_url || publicEnv.whatsappUrl || null,
    telegramUrl: s.telegram_url || publicEnv.telegramUrl || null,
  };
}
