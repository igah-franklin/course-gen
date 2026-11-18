import { fulfillPayment, verifyWebhookSignature } from "@/lib/payments/paystack";

/**
 * Paystack webhook (set in Paystack Dashboard → Settings → API Keys & Webhooks:
 * <site>/api/payments/paystack/webhook). Guarantees access is granted even if
 * the learner closes the tab before the callback redirect.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-paystack-signature"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Bad payload" }, { status: 400 });
  }
  if (event.event === "charge.success" && event.data?.reference) {
    try {
      await fulfillPayment(event.data.reference);
    } catch (e) {
      console.error("[paystack webhook]", e);
      // Non-2xx makes Paystack retry later.
      return Response.json({ error: "Processing failed" }, { status: 500 });
    }
  }
  return Response.json({ received: true });
}
