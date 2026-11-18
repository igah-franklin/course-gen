import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { mcpResource, verifyAccessToken } from "@/lib/oauth/server";
import { CORS_HEADERS, preflight } from "@/lib/oauth/http";
import { isSupabaseConfigured, publicEnv, serverEnv } from "@/lib/env";

// create_course fetches metadata + transcript before answering.
export const maxDuration = 120;

function withCors(res: Response) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function unauthorized(description = "Sign in to connect your account") {
  return new Response(JSON.stringify({ error: "invalid_token", error_description: description }), {
    status: 401,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      // Tells MCP clients where to start OAuth (RFC 9728).
      "WWW-Authenticate": `Bearer resource_metadata="${publicEnv.siteUrl}/.well-known/oauth-protected-resource", error="invalid_token", error_description="${description}"`,
    },
  });
}

async function handle(req: Request) {
  if (!isSupabaseConfigured() || !serverEnv.supabaseServiceRoleKey) {
    return withCors(Response.json({ error: "Server not configured" }, { status: 503 }));
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return unauthorized();
  const auth = await verifyAccessToken(token);
  if (!auth) return unauthorized("The access token is invalid or expired");

  const server = createMcpServer(auth.userId);
  // Stateless: a fresh server + transport per request; all state lives in Postgres.
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req, {
      authInfo: { token: auth.token, clientId: auth.clientId, scopes: auth.scopes, expiresAt: auth.expiresAt, resource: new URL(mcpResource()) },
    });
    return withCors(res);
  } finally {
    // JSON-response mode has fully produced the body by now.
    void server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = preflight;
