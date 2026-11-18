import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { publicEnv } from "@/lib/env";
import { MODEL_PRICING } from "@/lib/ai/pricing";
import { imageProviderConfigured } from "@/lib/ai/images";
import { AdminSettingsForm } from "@/components/admin/settings-form";
import { PageHeader } from "@/components/shared/ui-bits";

export const metadata: Metadata = { title: "Settings" };

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-5-5": "Claude Opus 5.5 (recommended)",
  "claude-fable-5-2": "Claude Fable 5.2 (most capable, highest cost)",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-haiku-5-5": "Claude Haiku 5.5 (lowest cost)",
};

export default async function AdminSettingsPage() {
  await requireAdmin();
  const [community, certificates, completion, ai] = await Promise.all([
    getSetting("community"),
    getSetting("certificates"),
    getSetting("completion"),
    getSetting("ai"),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Platform settings" description="Community links, certificate branding, completion rules and AI configuration." />
      <AdminSettingsForm
        initial={{
          community: { whatsapp_url: community.whatsapp_url ?? "", telegram_url: community.telegram_url ?? "" },
          certificates,
          completion,
          ai,
        }}
        models={Object.keys(MODEL_PRICING).map((id) => {
          const p = MODEL_PRICING[id];
          return { id, label: `${MODEL_LABELS[id] ?? id} — $${p.input}/$${p.output} per 1M tokens` };
        })}
        envFallback={{ whatsapp: Boolean(publicEnv.whatsappUrl), telegram: Boolean(publicEnv.telegramUrl) }}
        imageProviderConfigured={imageProviderConfigured()}
      />
    </div>
  );
}
