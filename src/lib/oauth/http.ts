import "server-only";
import { OAuthError } from "./server";

/** OAuth/MCP endpoints are called cross-origin by browser-based MCP clients. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store", Pragma: "no-cache", ...extra } });
}

export function oauthError(err: unknown) {
  if (err instanceof OAuthError) {
    return json({ error: err.code, error_description: err.message }, err.status);
  }
  console.error("[oauth]", err);
  return json({ error: "server_error", error_description: "Unexpected error." }, 500);
}

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });

/** Reads application/x-www-form-urlencoded (spec) or JSON bodies, plus HTTP Basic client auth. */
export async function readTokenRequest(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  let form: URLSearchParams;
  if (type.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    form = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  } else {
    form = new URLSearchParams(await req.text());
  }
  let clientId = form.get("client_id");
  let clientSecret = form.get("client_secret");
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(auth.slice(6), "base64").toString().split(":");
    clientId = decodeURIComponent(id ?? "");
    clientSecret = decodeURIComponent(secret ?? "");
  }
  return { form, clientId, clientSecret };
}
