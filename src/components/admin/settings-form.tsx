"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TelegramIcon, WhatsAppIcon } from "@/components/brand/brand-icons";
import { saveSettingsAction } from "@/lib/actions/admin";

export type AdminSettings = {
  community: { whatsapp_url: string; telegram_url: string };
  certificates: { platform_name: string; signatory_name: string; signatory_title: string; accent_color: string };
  completion: { require_final_assessment: boolean; default_passing_score: number };
  ai: { model: string; effort: "low" | "medium" | "high" | "xhigh" | "max"; max_lessons_per_course: number; image_generation: boolean };
};

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 rounded-2xl border bg-card p-6 shadow-xs md:grid-cols-[240px_1fr]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function AdminSettingsForm({
  initial,
  models,
  envFallback,
  imageProviderConfigured,
}: {
  initial: AdminSettings;
  models: { id: string; label: string }[];
  envFallback: { whatsapp: boolean; telegram: boolean };
  imageProviderConfigured: boolean;
}) {
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = <K extends keyof AdminSettings>(k: K, v: Partial<AdminSettings[K]>) => setS((prev) => ({ ...prev, [k]: { ...prev[k], ...v } }));

  const save = () =>
    start(async () => {
      const r = await saveSettingsAction(s);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Settings saved");
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <Section title="Community links" description="Shown on the landing page, dashboard, sidebar, course pages and completion screen.">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            <WhatsAppIcon className="size-4 text-[#1DA851]" /> WhatsApp group invite URL
          </Label>
          <Input
            placeholder="https://chat.whatsapp.com/…"
            value={s.community.whatsapp_url}
            onChange={(e) => set("community", { whatsapp_url: e.target.value })}
          />
          {!s.community.whatsapp_url && envFallback.whatsapp && (
            <p className="text-xs text-muted-foreground">Empty — falling back to NEXT_PUBLIC_WHATSAPP_COMMUNITY_URL.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            <TelegramIcon className="size-4 text-[#229ED9]" /> Telegram group URL
          </Label>
          <Input placeholder="https://t.me/…" value={s.community.telegram_url} onChange={(e) => set("community", { telegram_url: e.target.value })} />
          {!s.community.telegram_url && envFallback.telegram && (
            <p className="text-xs text-muted-foreground">Empty — falling back to NEXT_PUBLIC_TELEGRAM_COMMUNITY_URL.</p>
          )}
        </div>
      </Section>

      <Section title="Certificate branding" description="Applied to newly issued certificates.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Platform name</Label>
            <Input value={s.certificates.platform_name} onChange={(e) => set("certificates", { platform_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Accent color</Label>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Accent color"
                value={s.certificates.accent_color}
                onChange={(e) => set("certificates", { accent_color: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded-lg border"
              />
              <Input value={s.certificates.accent_color} onChange={(e) => set("certificates", { accent_color: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Signatory name</Label>
            <Input value={s.certificates.signatory_name} onChange={(e) => set("certificates", { signatory_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Signatory title</Label>
            <Input value={s.certificates.signatory_title} onChange={(e) => set("certificates", { signatory_title: e.target.value })} />
          </div>
        </div>
      </Section>

      <Section title="Completion requirements" description="Platform defaults. Course creators can override them per course.">
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm">Require passing the final assessment</span>
          <Switch
            checked={s.completion.require_final_assessment}
            onCheckedChange={(v) => set("completion", { require_final_assessment: v })}
          />
        </label>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">Default passing score</span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              className="w-20"
              value={s.completion.default_passing_score}
              onChange={(e) => set("completion", { default_passing_score: Number(e.target.value) })}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
      </Section>

      <Section title="AI provider" description="Model and generation limits. API keys are configured as server environment variables and never shown here.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="model">Model</Label>
            <select id="model" className={selectCls} value={s.ai.model} onChange={(e) => set("ai", { model: e.target.value })}>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="effort">Effort</Label>
            <select
              id="effort"
              className={selectCls}
              value={s.ai.effort}
              onChange={(e) => set("ai", { effort: e.target.value as AdminSettings["ai"]["effort"] })}
            >
              {["low", "medium", "high", "xhigh", "max"].map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Higher effort = more thorough lessons, higher cost and latency.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxl">Max lessons per course</Label>
            <Input
              id="maxl"
              type="number"
              min={3}
              max={200}
              value={s.ai.max_lessons_per_course}
              onChange={(e) => set("ai", { max_lessons_per_course: Number(e.target.value) })}
            />
          </div>
        </div>
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm">Generate raster concept images</span>
            <span className="block text-xs text-muted-foreground">
              {imageProviderConfigured ? "Uses the OpenAI Images API (one image per lesson at most)." : "Requires OPENAI_API_KEY."}
            </span>
          </span>
          <Switch
            checked={s.ai.image_generation}
            disabled={!imageProviderConfigured}
            onCheckedChange={(v) => set("ai", { image_generation: v })}
          />
        </label>
      </Section>

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" className="h-10 px-5 shadow-lg" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save settings
        </Button>
      </div>
    </div>
  );
}
