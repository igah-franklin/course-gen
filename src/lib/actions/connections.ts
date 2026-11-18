"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { revokeConnection } from "@/lib/oauth/server";

export async function revokeConnectionAction(clientId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };
  await revokeConnection(user.id, clientId);
  revalidatePath("/dashboard/connect");
  return { ok: true };
}
