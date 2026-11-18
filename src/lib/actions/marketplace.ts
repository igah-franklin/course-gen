"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/settings";
import { publicEnv } from "@/lib/env";
import { CURRENCIES, MAX_PRICE, MIN_PRICE, formatMoney, toMinor } from "@/lib/money";
import { initializeTransaction, paystackConfigured } from "@/lib/payments/paystack";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const READY = ["ready", "needs_review"];

async function authed() {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  return user;
}

async function loadSellableCourse(courseId: string) {
  const db = createAdminClient();
  const { data: course } = await db
    .from("courses")
    .select("id, user_id, title, is_public, status, price_amount, currency")
    .eq("id", courseId)
    .maybeSingle();
  return { db, course };
}

/* -------------------------------------------------------------------------- */
/* Enroll in a free course                                                     */
/* -------------------------------------------------------------------------- */

export async function enrollFreeAction(courseId: string): Promise<Result<null>> {
  const user = await authed();
  const { db, course } = await loadSellableCourse(courseId);
  if (!course || !course.is_public || !READY.includes(course.status)) return { ok: false, error: "This course isn't available." };
  if (course.user_id === user.id) return { ok: true, data: null };
  if (course.price_amount > 0) return { ok: false, error: "This is a paid course." };

  const { error } = await db
    .from("course_access")
    .upsert({ user_id: user.id, course_id: courseId, source: "free" }, { onConflict: "user_id,course_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Could not enroll you. Please try again." };
  await db
    .from("course_enrollments")
    .upsert(
      { user_id: user.id, course_id: courseId, last_accessed_at: new Date().toISOString() },
      { onConflict: "user_id,course_id", ignoreDuplicates: true },
    );
  revalidatePath(`/dashboard/courses/${courseId}`);
  revalidatePath("/dashboard/courses");
  return { ok: true, data: null };
}

/* -------------------------------------------------------------------------- */
/* Buy a paid course (Paystack hosted checkout)                                */
/* -------------------------------------------------------------------------- */

export async function startCheckoutAction(courseId: string): Promise<Result<{ url: string }>> {
  const user = await authed();
  if (!paystackConfigured()) return { ok: false, error: "Payments aren't set up on this platform yet." };
  if (!user.email) return { ok: false, error: "Add an email address to your account to pay." };

  const { db, course } = await loadSellableCourse(courseId);
  if (!course || !course.is_public || !READY.includes(course.status)) return { ok: false, error: "This course isn't available." };
  if (course.user_id === user.id) return { ok: false, error: "You own this course." };
  if (course.price_amount <= 0) return { ok: false, error: "This course is free — enroll directly." };

  const { data: access } = await db
    .from("course_access")
    .select("id")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();
  if (access) return { ok: false, error: "You already have access to this course." };

  const { platform_fee_percent } = await getSetting("payments");
  const fee = Math.round((course.price_amount * platform_fee_percent) / 100);
  const reference = `crs_${crypto.randomUUID().replace(/-/g, "")}`;

  const { data: payment, error } = await db
    .from("payments")
    .insert({
      reference,
      user_id: user.id,
      course_id: course.id,
      creator_id: course.user_id,
      course_title: course.title,
      amount: course.price_amount,
      currency: course.currency,
      platform_fee: fee,
      creator_earnings: course.price_amount - fee,
    })
    .select("id")
    .single();
  if (error || !payment) return { ok: false, error: "Could not start checkout. Please try again." };

  try {
    const tx = await initializeTransaction({
      email: user.email,
      amount: course.price_amount,
      currency: course.currency,
      reference,
      callbackUrl: `${publicEnv.siteUrl}/api/payments/paystack/callback`,
      metadata: { course_id: course.id, payment_id: payment.id, cancel_action: `${publicEnv.siteUrl}/dashboard/courses/${course.id}` },
    });
    return { ok: true, data: { url: tx.authorization_url } };
  } catch (e) {
    console.error("[checkout]", e);
    await db.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return { ok: false, error: e instanceof Error ? e.message : "Could not start checkout." };
  }
}

/* -------------------------------------------------------------------------- */
/* Creator: sharing & pricing                                                  */
/* -------------------------------------------------------------------------- */

const Pricing = z.object({
  isPublic: z.boolean(),
  paid: z.boolean(),
  price: z.number().nonnegative().finite(),
  currency: z.enum(CURRENCIES),
});

export async function updateCourseSharingAction(courseId: string, input: z.input<typeof Pricing>): Promise<Result<null>> {
  const user = await authed();
  const parsed = Pricing.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid price." };
  const { isPublic, paid, price, currency } = parsed.data;

  const { db, course } = await loadSellableCourse(courseId);
  if (!course || (course.user_id !== user.id && user.role !== "admin")) return { ok: false, error: "Course not found." };
  if (isPublic && !READY.includes(course.status)) return { ok: false, error: "Only finished courses can be shared." };

  let amount = 0;
  if (paid) {
    if (!paystackConfigured()) return { ok: false, error: "Paid courses need payments to be configured by the platform admin." };
    if (price < MIN_PRICE[currency] || price > MAX_PRICE[currency]) {
      return {
        ok: false,
        error: `Price must be between ${formatMoney(toMinor(MIN_PRICE[currency]), currency)} and ${formatMoney(toMinor(MAX_PRICE[currency]), currency)}.`,
      };
    }
    amount = toMinor(price);
  }

  const { error } = await db
    .from("courses")
    .update({ is_public: isPublic, price_amount: amount, currency })
    .eq("id", courseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dashboard/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}`);
  updateTag(`course-${courseId}`);
  revalidatePath("/dashboard/explore");
  return { ok: true, data: null };
}

/* -------------------------------------------------------------------------- */
/* Admin: record creator payouts                                               */
/* -------------------------------------------------------------------------- */

/** Settles a creator's unpaid sales in one currency, up to `upTo` (the moment the admin viewed the balance). */
export async function adminMarkPaidOutAction(creatorId: string, currency: string, upTo: string): Promise<Result<{ count: number }>> {
  const user = await authed();
  if (user.role !== "admin") return { ok: false, error: "Forbidden" };
  if (Number.isNaN(Date.parse(upTo))) return { ok: false, error: "Invalid cutoff." };
  const db = createAdminClient();
  const { data, error } = await db
    .from("payments")
    .update({ payout_status: "paid_out", paid_out_at: new Date().toISOString() })
    .eq("creator_id", creatorId)
    .eq("currency", currency)
    .eq("status", "success")
    .eq("payout_status", "unpaid")
    .lte("paid_at", upTo)
    .select("id");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/payments");
  return { ok: true, data: { count: data?.length ?? 0 } };
}
