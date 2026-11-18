/**
 * Centralised environment access. Public values (NEXT_PUBLIC_*) are inlined at
 * build time and safe for the browser; everything else must only be read on
 * the server.
 */

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "CourseForge",
  whatsappUrl: process.env.NEXT_PUBLIC_WHATSAPP_COMMUNITY_URL ?? "",
  telegramUrl: process.env.NEXT_PUBLIC_TELEGRAM_COMMUNITY_URL ?? "",
};

export function isSupabaseConfigured() {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

/** Server-only configuration. Never import the values into client components. */
export const serverEnv = {
  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "";
  },
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY ?? "";
  },
  get youtubeApiKey() {
    return process.env.YOUTUBE_API_KEY ?? "";
  },
  get supadataApiKey() {
    return process.env.SUPADATA_API_KEY ?? "";
  },
  get openaiApiKey() {
    return process.env.OPENAI_API_KEY ?? "";
  },
  get jobRunnerSecret() {
    return process.env.JOB_RUNNER_SECRET ?? "";
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  get jobSliceSeconds() {
    const v = Number(process.env.JOB_SLICE_SECONDS ?? 240);
    return Number.isFinite(v) && v > 10 ? v : 240;
  },
  get paystackSecretKey() {
    return process.env.PAYSTACK_SECRET_KEY ?? "";
  },
  get adminEmails() {
    return (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
};

export type IntegrationStatus = {
  key: string;
  label: string;
  configured: boolean;
  required: boolean;
  envVars: string[];
  purpose: string;
};

/** Used to render configuration states in the UI (no secret values leave the server). */
export function integrationStatus(): IntegrationStatus[] {
  return [
    {
      key: "supabase",
      label: "Supabase",
      configured: isSupabaseConfigured() && Boolean(serverEnv.supabaseServiceRoleKey),
      required: true,
      envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
      purpose: "Database, authentication and file storage",
    },
    {
      key: "anthropic",
      label: "Anthropic (Claude)",
      configured: Boolean(serverEnv.anthropicApiKey),
      required: true,
      envVars: ["ANTHROPIC_API_KEY"],
      purpose: "Source analysis, course, lesson, illustration and quiz generation",
    },
    {
      key: "supadata",
      label: "Supadata transcripts",
      configured: Boolean(serverEnv.supadataApiKey),
      required: false,
      envVars: ["SUPADATA_API_KEY"],
      purpose: "Retrieves YouTube captions and transcribes audio when captions are unavailable",
    },
    {
      key: "youtube",
      label: "YouTube Data API",
      configured: Boolean(serverEnv.youtubeApiKey),
      required: false,
      envVars: ["YOUTUBE_API_KEY"],
      purpose: "Full video metadata (duration, description, caption availability)",
    },
    {
      key: "paystack",
      label: "Paystack payments",
      configured: Boolean(serverEnv.paystackSecretKey),
      required: false,
      envVars: ["PAYSTACK_SECRET_KEY"],
      purpose: "Collects payments for paid courses (webhook: /api/payments/paystack/webhook)",
    },
    {
      key: "openai_images",
      label: "OpenAI Images (optional)",
      configured: Boolean(serverEnv.openaiApiKey),
      required: false,
      envVars: ["OPENAI_API_KEY"],
      purpose: "Optional raster concept illustrations in addition to generated diagrams",
    },
    {
      key: "jobs",
      label: "Background job runner",
      configured: Boolean(serverEnv.jobRunnerSecret),
      required: true,
      envVars: ["JOB_RUNNER_SECRET", "CRON_SECRET"],
      purpose: "Authenticates background processing slices and the recovery cron",
    },
  ];
}
