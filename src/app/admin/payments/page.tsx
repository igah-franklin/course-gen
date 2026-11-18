import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getPayoutOverview } from "@/lib/data/marketplace";
import { adminMarkPaidOutAction } from "@/lib/actions/marketplace";
import { paystackConfigured } from "@/lib/payments/paystack";
import { ActionButton } from "@/components/admin/action-button";
import { PageHeader, SectionCard } from "@/components/shared/ui-bits";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { requestNow } from "@/lib/utils/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments" };

const STATUS_CLS: Record<string, string> = {
  success: "bg-tile-mint",
  pending: "bg-tile-butter",
  failed: "bg-destructive/10 text-destructive",
  abandoned: "bg-muted text-muted-foreground",
};

export default async function AdminPayments() {
  await requireAdmin();
  const { balances, revenue, recent } = await getPayoutOverview();
  // Payouts settle only the sales visible at render time; later sales stay unpaid.
  const upTo = new Date(requestNow()).toISOString();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Payments" description="Course sales collected through Paystack, platform fees, and creator payouts." />

      {!paystackConfigured() && (
        <div className="rounded-2xl bg-tile-butter px-5 py-3.5 text-sm">
          Paystack isn&apos;t configured. Set <code>PAYSTACK_SECRET_KEY</code> and add the webhook URL{" "}
          <code>/api/payments/paystack/webhook</code> in your Paystack dashboard.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {revenue.length ? (
          revenue.map((r) => (
            <div key={r.currency} className="rounded-3xl bg-tile-mint p-5">
              <p className="text-3xl font-medium tracking-tight tabular-nums">{formatMoney(r.gross, r.currency)}</p>
              <p className="mt-2 text-sm text-foreground/70">Gross sales ({r.currency})</p>
              <p className="mt-0.5 text-xs text-foreground/60">Platform fees: {formatMoney(r.fees, r.currency)}</p>
            </div>
          ))
        ) : (
          <div className="rounded-3xl border bg-card p-5 text-sm text-muted-foreground">No sales yet.</div>
        )}
      </div>

      <SectionCard title="Owed to creators" description="Pay creators outside the app (bank transfer), then record it here.">
        {balances.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Creator</TableHead>
                <TableHead>Unpaid sales</TableHead>
                <TableHead>Amount owed</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.map((b) => (
                <TableRow key={`${b.creatorId}:${b.currency}`}>
                  <TableCell>
                    <div className="font-medium">{b.name}</div>
                    {b.email && <div className="text-xs text-muted-foreground">{b.email}</div>}
                  </TableCell>
                  <TableCell className="tabular-nums">{b.sales}</TableCell>
                  <TableCell className="font-medium tabular-nums">{formatMoney(b.owed, b.currency)}</TableCell>
                  <TableCell className="text-right">
                    <ActionButton
                      action={adminMarkPaidOutAction.bind(null, b.creatorId, b.currency, upTo)}
                      label="Mark as paid out"
                      confirm={`Record that you've paid ${b.name} ${formatMoney(b.owed, b.currency)}?`}
                      success="Payout recorded"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing owed right now.</p>
        )}
      </SectionCard>

      <SectionCard title="Recent transactions">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Creator</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                  {new Date(p.paid_at ?? p.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </TableCell>
                <TableCell className="max-w-56 truncate">{p.course_title}</TableCell>
                <TableCell className="max-w-40 truncate">{p.creatorName}</TableCell>
                <TableCell className="tabular-nums">{formatMoney(p.amount, p.currency)}</TableCell>
                <TableCell className="tabular-nums">{formatMoney(p.platform_fee, p.currency)}</TableCell>
                <TableCell>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] capitalize", STATUS_CLS[p.status] ?? "bg-muted")}>{p.status}</span>
                  {p.status === "success" && p.payout_status === "paid_out" && (
                    <span className="ml-1 rounded-full bg-tile-sky px-2 py-0.5 text-[11px]">paid out</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!recent.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No transactions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}
