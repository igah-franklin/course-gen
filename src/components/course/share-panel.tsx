"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Loader2, Share2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { updateCourseSharingAction } from "@/lib/actions/marketplace";
import { CURRENCIES, MIN_PRICE, fromMinor, type Currency } from "@/lib/money";
import { cn } from "@/lib/utils";

export function SharePanel({
  courseId,
  shareUrl,
  initial,
  canShare,
  paymentsEnabled,
  feePercent,
  learners,
}: {
  courseId: string;
  shareUrl: string;
  initial: { isPublic: boolean; priceAmount: number; currency: Currency };
  canShare: boolean;
  paymentsEnabled: boolean;
  feePercent: number;
  learners: number;
}) {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [paid, setPaid] = useState(initial.priceAmount > 0);
  const [price, setPrice] = useState(initial.priceAmount > 0 ? String(fromMinor(initial.priceAmount)) : "");
  const [currency, setCurrency] = useState<Currency>(initial.currency);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const dirty =
    isPublic !== initial.isPublic ||
    paid !== initial.priceAmount > 0 ||
    (paid && (Number(price) !== fromMinor(initial.priceAmount) || currency !== initial.currency));

  const save = () =>
    start(async () => {
      const res = await updateCourseSharingAction(courseId, { isPublic, paid, price: paid ? Number(price) || 0 : 0, currency });
      if (!res.ok) return void toast.error(res.error);
      toast.success(isPublic ? "Sharing settings saved — your course is live." : "Saved. Your course is private.");
      router.refresh();
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  };

  const earnPreview = paid && Number(price) > 0 ? (Number(price) * (100 - feePercent)) / 100 : null;

  return (
    <section className="rounded-3xl border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Share2 className="size-4 text-primary" /> Share & sell
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Let other people enroll in this course.</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-tile-sky px-2.5 py-1 text-xs">
          <Users className="size-3" /> {learners}
        </span>
      </div>

      {!canShare ? (
        <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">You can share this course once it has finished generating.</p>
      ) : (
        <div className="mt-5 space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-2xl bg-muted/60 px-4 py-3">
            <span>
              <span className="block text-sm font-medium">Publish course</span>
              <span className="block text-xs text-muted-foreground">Listed in Explore and reachable by its share link</span>
            </span>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </label>

          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pricing">
            {[
              { key: false, label: "Free", body: "Anyone can enroll" },
              { key: true, label: "Paid", body: paymentsEnabled ? "Learners pay to enroll" : "Payments not set up" },
            ].map((o) => (
              <button
                key={String(o.key)}
                type="button"
                role="radio"
                aria-checked={paid === o.key}
                disabled={o.key && !paymentsEnabled}
                onClick={() => setPaid(o.key)}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50",
                  paid === o.key ? "border-primary bg-accent/50 ring-1 ring-primary" : "hover:border-primary/40",
                )}
              >
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.body}</span>
              </button>
            ))}
          </div>

          {paid && (
            <div>
              <div className="flex gap-2">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  aria-label="Currency"
                  className="h-11 rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={MIN_PRICE[currency]}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={`Min ${MIN_PRICE[currency]}`}
                  aria-label="Price"
                  className="h-11 rounded-xl"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {earnPreview != null
                  ? `You earn ${currency} ${earnPreview.toLocaleString(undefined, { maximumFractionDigits: 2 })} per sale after the ${feePercent}% platform fee.`
                  : `Platform fee: ${feePercent}% per sale. Paystack processes payments; earnings are paid out to you by the platform.`}
              </p>
            </div>
          )}

          <Button className="h-11 w-full rounded-xl" onClick={save} disabled={!dirty || pending}>
            {pending && <Loader2 className="animate-spin" />} Save sharing settings
          </Button>

          {initial.isPublic && (
            <div className="border-t pt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Share link</p>
              <div className="flex gap-2">
                <Input readOnly value={shareUrl} className="h-10 rounded-xl text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
                <Button variant="outline" size="icon-lg" className="shrink-0 rounded-xl" onClick={copy} aria-label="Copy link">
                  {copied ? <Check /> : <Copy />}
                </Button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open share page"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card hover:bg-muted"
                >
                  <ExternalLink className="size-4" />
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
