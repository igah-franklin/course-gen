import { OAuthError, authenticateClient, exchangeCode, refresh } from "@/lib/oauth/server";
import { json, oauthError, preflight, readTokenRequest } from "@/lib/oauth/http";

/** Token endpoint: authorization_code (+PKCE) and refresh_token grants. */
export async function POST(req: Request) {
  try {
    const { form, clientId, clientSecret } = await readTokenRequest(req);
    const client = await authenticateClient(clientId, clientSecret);
    const grant = form.get("grant_type");
    if (grant === "authorization_code") return json(await exchangeCode(client, form));
    if (grant === "refresh_token") return json(await refresh(client, form));
    throw new OAuthError("unsupported_grant_type", "Supported grants: authorization_code, refresh_token.");
  } catch (err) {
    return oauthError(err);
  }
}

export const OPTIONS = preflight;
