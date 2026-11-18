import { NextResponse, type NextRequest } from "next/server";
import { fulfillPayment } from "@/lib/payments/paystack";

/**
 * Paystack redirects the learner here after checkout. The payment is verified
 * server-to-server before access is granted; query parameters are not trusted.
 */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference") ?? request.nextUrl.searchParams.get("trxref");
  const to = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));
  if (!reference || !/^[A-Za-z0-9_-]{6,100}$/.test(reference)) return to("/dashboard/courses");

  try {
    const result = await fulfillPayment(reference);
    if (result.status === "unknown") return to("/dashboard/courses");
    const base = result.courseId ? `/dashboard/courses/${result.courseId}` : "/dashboard/courses";
    return to(`${base}?payment=${result.status}`);
  } catch (e) {
    console.error("[paystack callback]", e);
    return to("/dashboard/courses?payment=pending");
  }
}
