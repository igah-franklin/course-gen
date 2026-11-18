import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";

/* ============================================================================
 * Minimal OAuth 2.1 authorization server for MCP connectors (Claude, ChatGPT).
 *  - Dynamic Client Registration (RFC 7591)
 *  - Authorization Code + PKCE (S256 only)
 *  - Opaque bearer tokens; refresh tokens rotate on use
 *  - Everything secret is stored as a SHA-256 hash
 * ==========================================================================*/

export const SCOPE = "courses";
export const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days
export const CODE_TTL = 60 * 5; // 5 minutes

export const issuer = () => publicEnv.siteUrl;
export const mcpResource = () => `${publicEnv.siteUrl}/api/mcp`;

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const token = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [SCOPE],
    service_documentation: `${base}/dashboard/connect`,
  };
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: `${publicEnv.appName} course builder`,
    resource_documentation: `${issuer()}/dashboard/connect`,
  };
}

/* ------------------------------ clients ---------------------------------- */

export type OAuthClient = {
  client_id: string;
  client_secret_hash: string | null;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none" | "client_secret_post" | "client_secret_basic";
  client_uri: string | null;
};

/** https everywhere, http only for loopback (desktop/CLI clients). */
export function validRedirectUri(uri: string) {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    return false;
  } catch {
    return false;
  }
}

export async function registerClient(body: Record<string, unknown>) {
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!redirectUris.length || redirectUris.length > 10 || !redirectUris.every(validRedirectUri)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris must be https URLs (or http loopback URLs).");
  }
  const grantTypes = Array.isArray(body.grant_types) ? body.grant_types.map(String) : ["authorization_code", "refresh_token"];
  if (grantTypes.some((g) => !["authorization_code", "refresh_token"].includes(g))) {
    throw new OAuthError("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported.");
  }
  const method = String(body.token_endpoint_auth_method ?? "none");
  if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) {
    throw new OAuthError("invalid_client_metadata", "Unsupported token_endpoint_auth_method.");
  }
  const clientName = String(body.client_name ?? "MCP client").slice(0, 100) || "MCP client";
  const clientUri = typeof body.client_uri === "string" && /^https:\/\//.test(body.client_uri) ? body.client_uri.slice(0, 300) : null;
  const clientId = `mcp_${token(16)}`;
  const secret = method === "none" ? null : token(32);

  const { error } = await createAdminClient()
    .from("oauth_clients")
    .insert({
      client_id: clientId,
      client_secret_hash: secret ? sha256(secret) : null,
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: method,
      client_uri: clientUri,
    });
  if (error) throw new OAuthError("server_error", "Could not register client.", 500);

  return {
    client_id: clientId,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: method,
    scope: SCOPE,
  };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (!clientId || clientId.length > 100) return null;
  const { data } = await createAdminClient().from("oauth_clients").select("*").eq("client_id", clientId).maybeSingle();
  return (data as OAuthClient) ?? null;
}

/* ---------------------------- authorization ------------------------------- */

export type AuthorizeParams = {
  responseType: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string | null;
  scope: string;
  resource: string | null;
};

export function readAuthorizeParams(get: (k: string) => string | null | undefined): AuthorizeParams {
  return {
    responseType: get("response_type") ?? "",
    clientId: get("client_id") ?? "",
    redirectUri: get("redirect_uri") ?? "",
    codeChallenge: get("code_challenge") ?? "",
    codeChallengeMethod: get("code_challenge_method") ?? "",
    state: get("state") ?? null,
    scope: get("scope") || SCOPE,
    resource: get("resource") || null,
  };
}

/**
 * Validates an authorization request. Errors about the client or redirect URI
 * must be shown to the user (never redirected); others are redirected back.
 */
export async function validateAuthorize(p: AuthorizeParams): Promise<
  { ok: true; client: OAuthClient } | { ok: false; showToUser: true; error: string } | { ok: false; showToUser: false; redirectTo: string }
> {
  const client = await getClient(p.clientId);
  if (!client) return { ok: false, showToUser: true, error: "Unknown application. Remove the connector and add it again." };
  if (!client.redirect_uris.includes(p.redirectUri)) {
    return { ok: false, showToUser: true, error: "The application's redirect address is not registered." };
  }
  const back = (error: string, description: string) => {
    const u = new URL(p.redirectUri);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", description);
    if (p.state) u.searchParams.set("state", p.state);
    return { ok: false as const, showToUser: false as const, redirectTo: u.toString() };
  };
  if (p.responseType !== "code") return back("unsupported_response_type", "Only response_type=code is supported.");
  if (!p.codeChallenge || p.codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(p.codeChallenge)) {
    return back("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  if (!p.scope.split(" ").every((s) => s === SCOPE || s === "")) return back("invalid_scope", `Supported scope: ${SCOPE}`);
  if (p.resource && p.resource.replace(/\/$/, "") !== mcpResource()) {
    return back("invalid_target", "Unknown resource.");
  }
  return { ok: true, client };
}

export async function createAuthorizationCode(p: AuthorizeParams, userId: string) {
  const code = token(32);
  const { error } = await createAdminClient()
    .from("oauth_authorization_codes")
    .insert({
      code_hash: sha256(code),
      client_id: p.clientId,
      user_id: userId,
      redirect_uri: p.redirectUri,
      code_challenge: p.codeChallenge,
      scope: SCOPE,
      resource: p.resource,
      expires_at: new Date(Date.now() + CODE_TTL * 1000).toISOString(),
    });
  if (error) throw new Error("Could not create authorization code");
  const u = new URL(p.redirectUri);
  u.searchParams.set("code", code);
  if (p.state) u.searchParams.set("state", p.state);
  u.searchParams.set("iss", issuer());
  return u.toString();
}

export function denyRedirect(p: AuthorizeParams) {
  const u = new URL(p.redirectUri);
  u.searchParams.set("error", "access_denied");
  u.searchParams.set("error_description", "The user declined access.");
  if (p.state) u.searchParams.set("state", p.state);
  return u.toString();
}

/* -------------------------------- tokens ---------------------------------- */

async function issueTokens(clientId: string, userId: string, resource: string | null, codeHash: string | null) {
  const access = token(32);
  const refresh = token(48);
  const now = Date.now();
  const rows = [
    { kind: "access", token_hash: sha256(access), expires_at: new Date(now + ACCESS_TOKEN_TTL * 1000).toISOString() },
    { kind: "refresh", token_hash: sha256(refresh), expires_at: new Date(now + REFRESH_TOKEN_TTL * 1000).toISOString() },
  ].map((r) => ({ ...r, client_id: clientId, user_id: userId, scope: SCOPE, resource, code_hash: codeHash }));
  const { error } = await createAdminClient().from("oauth_tokens").insert(rows);
  if (error) throw new OAuthError("server_error", "Could not issue tokens.", 500);
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refresh,
    scope: SCOPE,
  };
}

/** Authenticates the client at the token endpoint. */
export async function authenticateClient(
  clientId: string | null,
  clientSecret: string | null,
): Promise<OAuthClient> {
  const client = clientId ? await getClient(clientId) : null;
  if (!client) throw new OAuthError("invalid_client", "Unknown client.", 401);
  if (client.token_endpoint_auth_method !== "none") {
    if (!clientSecret || !client.client_secret_hash || !safeEqual(sha256(clientSecret), client.client_secret_hash)) {
      throw new OAuthError("invalid_client", "Client authentication failed.", 401);
    }
  }
  return client;
}

export async function exchangeCode(client: OAuthClient, form: URLSearchParams) {
  const code = form.get("code") ?? "";
  const verifier = form.get("code_verifier") ?? "";
  const redirectUri = form.get("redirect_uri") ?? "";
  if (!code || !verifier) throw new OAuthError("invalid_request", "code and code_verifier are required.");
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new OAuthError("invalid_grant", "Malformed code_verifier.");
  const db = createAdminClient();
  const codeHash = sha256(code);

  // Single use: atomically mark the code used.
  const { data: row } = await db
    .from("oauth_authorization_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("*")
    .maybeSingle();
  if (!row) {
    // A replayed code: revoke anything it already issued (RFC 6749 §4.1.2).
    await db.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("code_hash", codeHash).is("revoked_at", null);
    throw new OAuthError("invalid_grant", "Authorization code is invalid, expired or already used.");
  }
  if (row.client_id !== client.client_id) throw new OAuthError("invalid_grant", "Code was issued to another client.");
  if (redirectUri && redirectUri !== row.redirect_uri) throw new OAuthError("invalid_grant", "redirect_uri mismatch.");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  if (!safeEqual(challenge, row.code_challenge)) throw new OAuthError("invalid_grant", "PKCE verification failed.");
  return issueTokens(client.client_id, row.user_id, row.resource, codeHash);
}

export async function refresh(client: OAuthClient, form: URLSearchParams) {
  const rt = form.get("refresh_token") ?? "";
  if (!rt) throw new OAuthError("invalid_request", "refresh_token is required.");
  const db = createAdminClient();
  const now = new Date().toISOString();
  // Rotate: revoke the presented refresh token atomically.
  const { data: row } = await db
    .from("oauth_tokens")
    .update({ revoked_at: now })
    .eq("token_hash", sha256(rt))
    .eq("kind", "refresh")
    .is("revoked_at", null)
    .gt("expires_at", now)
    .select("*")
    .maybeSingle();
  if (!row) throw new OAuthError("invalid_grant", "Refresh token is invalid or expired.");
  if (row.client_id !== client.client_id) throw new OAuthError("invalid_grant", "Token was issued to another client.");
  return issueTokens(client.client_id, row.user_id, row.resource, row.code_hash);
}

export async function revokeToken(client: OAuthClient, value: string) {
  await createAdminClient()
    .from("oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", sha256(value))
    .eq("client_id", client.client_id)
    .is("revoked_at", null);
}

export type VerifiedToken = { userId: string; clientId: string; scopes: string[]; expiresAt: number; token: string };

/** Verifies an MCP bearer token. */
export async function verifyAccessToken(value: string): Promise<VerifiedToken | null> {
  if (!value || value.length > 200) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("oauth_tokens")
    .select("id, user_id, client_id, scope, resource, expires_at, revoked_at, last_used_at")
    .eq("token_hash", sha256(value))
    .eq("kind", "access")
    .maybeSingle();
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() < Date.now()) return null;
  if (data.resource && data.resource.replace(/\/$/, "") !== mcpResource()) return null;
  if (!data.last_used_at || Date.now() - new Date(data.last_used_at).getTime() > 60_000) {
    await db.from("oauth_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  return {
    userId: data.user_id,
    clientId: data.client_id,
    scopes: data.scope.split(" "),
    expiresAt: Math.floor(new Date(data.expires_at).getTime() / 1000),
    token: value,
  };
}

/** Connected apps for the settings page. */
export async function listConnections(userId: string) {
  const { data } = await createAdminClient()
    .from("oauth_tokens")
    .select("client_id, kind, created_at, last_used_at, expires_at, oauth_clients(client_name, client_uri)")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());
  const byClient = new Map<string, { clientId: string; name: string; connectedAt: string; lastUsedAt: string | null }>();
  for (const t of data ?? []) {
    const c = t.oauth_clients as unknown as { client_name: string } | null;
    const cur = byClient.get(t.client_id);
    const lastUsed = [cur?.lastUsedAt, t.last_used_at].filter(Boolean).sort().at(-1) ?? null;
    byClient.set(t.client_id, {
      clientId: t.client_id,
      name: c?.client_name ?? "MCP client",
      connectedAt: cur && cur.connectedAt < t.created_at ? cur.connectedAt : t.created_at,
      lastUsedAt: lastUsed,
    });
  }
  return [...byClient.values()].sort((a, b) => (b.lastUsedAt ?? b.connectedAt).localeCompare(a.lastUsedAt ?? a.connectedAt));
}

export async function revokeConnection(userId: string, clientId: string) {
  await createAdminClient()
    .from("oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .is("revoked_at", null);
}
