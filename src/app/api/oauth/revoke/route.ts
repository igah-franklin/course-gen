import { authenticateClient, revokeToken } from "@/lib/oauth/server";
import { oauthError, preflight, readTokenRequest, CORS_HEADERS } from "@/lib/oauth/http";

/** Token revocation (RFC 7009). Always 200 for unknown tokens. */
export async function POST(req: Request) {
  try {
    const { form, clientId, clientSecret } = await readTokenRequest(req);
    const client = await authenticateClient(clientId, clientSecret);
    const value = form.get("token");
    if (value) await revokeToken(client, value);
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    return oauthError(err);
  }
}

export const OPTIONS = preflight;
