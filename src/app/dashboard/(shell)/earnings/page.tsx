import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CircleDollarSign, Clock, Users, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCreatorEarnings } from "@/lib/data/marketplace";
import { getSetting } from "@/lib/settings";
import { EmptyState, PageHeader, SectionCard, StatCard } from "@/components/shared/ui-bits";
import { formatMoney, priceLabel } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Earnings" };

export default async function EarningsPage() {
  const user = await requireUser("/dashboard/earnings");
  const [{ sales, totals, courses }, payments] = await Promise.all([getCreatorEarnings(user.id), getSetting("payments")]);
  const learners = courses.reduce((n, c) => n + c.learners, 0);
  const primary = totals[0];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Earnings"
        description={`Sales of your shared courses. The platform keeps a ${payments.platform_fee_percent}% fee and pays out the rest to you.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard tone="mint" label="Total earned" value={primary ? formatMoney(primary.earned, primary.currency) : "—"} icon={CircleDollarSign} />
        <StatCard tone="butter" label="Awaiting payout" value={primary ? formatMoney(primary.unpaid, primary.currency) : "—"} icon={Wallet} />
        <StatCard tone="sky" label="Sales" value={sales.length} icon={BookOpen} />
        <StatCard tone="lilac" label="Learners enrolled" value={learners} icon={Users} hint="Free and paid" />
      </div>
      {totals.length > 1 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Other currencies:{" "}
          {totals
            .slice(1)
            .map((t) => `${formatMoney(t.earned, t.currency)} earned (${formatMoney(t.unpaid, t.currency)} awaiting payout)`)
            .join(" · ")}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <SectionCard title="Recent sales">
          {sales.length ? (
            <ul className="divide-y">
              {sales.slice(0, 50).map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.course_title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.paid_at ? new Date(s.paid_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"} · paid{" "}
                      {formatMoney(s.amount, s.currency)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-medium tabular-nums">{formatMoney(s.creator_earnings, s.currency)}</span>
                    <span
                      className={cn(
                        "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px]",
                        s.payout_status === "paid_out" ? "bg-tile-mint" : "bg-tile-butter",
                      )}
                    >
                      {s.payout_status === "paid_out" ? "Paid out" : "Awaiting payout"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Clock}
              title="No sales yet"
              description="Publish a course as paid from its page (Share & sell), then share the link."
              className="border-0 bg-transparent py-8"
            />
          )}
        </SectionCard>

        <SectionCard title="Your shareable courses">
          {courses.length ? (
            <ul className="space-y-2.5">
              {courses.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/courses/${c.id}`} className="flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors hover:bg-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.is_public ? "Published" : "Private"} · {c.learners} {c.learners === 1 ? "learner" : "learners"}
                      </span>
                    </span>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs", c.price_amount > 0 ? "bg-tile-peach" : "bg-tile-mint")}>
                      {priceLabel(c.price_amount, c.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Finished courses you create will appear here.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
