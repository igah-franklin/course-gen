import { authorizationServerMetadata } from "@/lib/oauth/server";
import { json, preflight } from "@/lib/oauth/http";

/** RFC 8414 — served at /.well-known/oauth-authorization-server and /.well-known/openid-configuration via rewrites. */
export async function GET() {
  return json(authorizationServerMetadata());
}

export const OPTIONS = preflight;
