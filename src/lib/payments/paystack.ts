import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const API = "https://api.paystack.co";

export function paystackConfigured() {
  return Boolean(serverEnv.paystackSecretKey);
}

type PaystackEnvelope<T> = { status: boolean; message: string; data: T };

async function paystack<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${serverEnv.paystackSecretKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as PaystackEnvelope<T> | null;
  if (!res.ok || !body?.status) {
    throw new Error(body?.message ? `Paystack: ${body.message}` : `Paystack request failed (${res.status})`);
  }
  return body.data;
}

export async function initializeTransaction(input: {
  email: string;
  amount: number; // minor units
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}) {
  return paystack<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
  });
}

type VerifiedTransaction = {
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "processing" | "queued" | "reversed";
  reference: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  channel?: string;
  gateway_response?: string;
};

export async function verifyTransaction(reference: string) {
  return paystack<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/** Paystack signs webhook bodies with HMAC-SHA512 of the raw body using the secret key. */
export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature || !serverEnv.paystackSecretKey) return false;
  const expected = createHmac("sha512", serverEnv.paystackSecretKey).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type FulfillResult =
  | { status: "success"; courseId: string | null }
  | { status: "pending"; courseId: string | null }
  | { status: "failed"; courseId: string | null; reason: string }
  | { status: "unknown" };

/**
 * Confirms a payment with Paystack (never trusting the redirect or webhook
 * payload alone) and grants course access. Idempotent — safe to call from
 * both the callback redirect and the webhook.
 */
export async function fulfillPayment(reference: string): Promise<FulfillResult> {
  const db = createAdminClient();
  const { data: payment } = await db
    .from("payments")
    .select("id, user_id, course_id, amount, currency, status")
    .eq("reference", reference)
    .maybeSingle();
  if (!payment) return { status: "unknown" };

  if (payment.status !== "success") {
    const tx = await verifyTransaction(reference);
    if (tx.status !== "success") {
      if (tx.status === "failed" || tx.status === "abandoned" || tx.status === "reversed") {
        await db
          .from("payments")
          .update({ status: tx.status === "reversed" ? "failed" : tx.status, provider_data: { gateway_response: tx.gateway_response ?? null } })
          .eq("id", payment.id)
          .neq("status", "success");
        return { status: "failed", courseId: payment.course_id, reason: tx.gateway_response || "The payment was not completed." };
      }
      return { status: "pending", courseId: payment.course_id };
    }
    if (tx.amount !== payment.amount || tx.currency !== payment.currency) {
      await db
        .from("payments")
        .update({ status: "failed", provider_data: { mismatch: { amount: tx.amount, currency: tx.currency } } })
        .eq("id", payment.id)
        .neq("status", "success");
      console.error("[paystack] amount/currency mismatch", reference);
      return { status: "failed", courseId: payment.course_id, reason: "Payment amount did not match the course price." };
    }
    await db
      .from("payments")
      .update({
        status: "success",
        paid_at: tx.paid_at ?? new Date().toISOString(),
        provider_data: { channel: tx.channel ?? null, gateway_response: tx.gateway_response ?? null },
      })
      .eq("id", payment.id)
      .neq("status", "success");
  }

  if (payment.course_id) {
    await db
      .from("course_access")
      .upsert(
        { user_id: payment.user_id, course_id: payment.course_id, source: "purchase", payment_id: payment.id },
        { onConflict: "user_id,course_id", ignoreDuplicates: true },
      );
    await db
      .from("course_enrollments")
      .upsert(
        { user_id: payment.user_id, course_id: payment.course_id, last_accessed_at: new Date().toISOString() },
        { onConflict: "user_id,course_id", ignoreDuplicates: true },
      );
  }
  return { status: "success", courseId: payment.course_id };
}
