"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAuthorizationCode, denyRedirect, readAuthorizeParams, validateAuthorize } from "@/lib/oauth/server";

/** Re-validates every parameter server-side; hidden form fields are never trusted. */
export async function decideAuthorization(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const p = readAuthorizeParams((k) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : null;
  });
  const check = await validateAuthorize(p);
  if (!check.ok) {
    if (check.showToUser) throw new Error(check.error);
    redirect(check.redirectTo);
  }
  if (formData.get("decision") !== "approve") redirect(denyRedirect(p));
  redirect(await createAuthorizationCode(p, user.id));
}
