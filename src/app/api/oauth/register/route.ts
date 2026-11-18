import { registerClient } from "@/lib/oauth/server";
import { json, oauthError, preflight } from "@/lib/oauth/http";

/** Dynamic Client Registration (RFC 7591), used by Claude / ChatGPT connectors. */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 20_000) return json({ error: "invalid_client_metadata", error_description: "Body too large." }, 400);
    const body = JSON.parse(raw || "{}") as Record<string, unknown>;
    return json(await registerClient(body), 201);
  } catch (err) {
    if (err instanceof SyntaxError) return json({ error: "invalid_client_metadata", error_description: "Body must be JSON." }, 400);
    return oauthError(err);
  }
}

export const OPTIONS = preflight;
