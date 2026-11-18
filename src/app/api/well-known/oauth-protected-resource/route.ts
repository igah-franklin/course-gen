import { protectedResourceMetadata } from "@/lib/oauth/server";
import { json, preflight } from "@/lib/oauth/http";

/** RFC 9728 — served at /.well-known/oauth-protected-resource[/api/mcp] via rewrites. */
export async function GET() {
  return json(protectedResourceMetadata());
}

export const OPTIONS = preflight;
