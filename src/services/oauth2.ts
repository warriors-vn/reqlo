import type { Environment, OAuth2CachedToken, OAuth2Config } from "@/services/db";
import {
  createEnvironmentMap,
  resolveTemplate,
} from "@/features/code-snippets/utils/request-resolver";

const CALLBACK_PATH = "/oauth/callback";
const POPUP_MESSAGE_SOURCE = "reqlo-oauth";

export function getOAuth2RedirectUri(): string {
  return `${window.location.origin}${CALLBACK_PATH}`;
}

interface ResolvedOAuth2Config {
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
}

function resolveOAuth2Config(
  config: OAuth2Config,
  environment?: Environment | null,
): ResolvedOAuth2Config {
  const envMap = createEnvironmentMap(environment);
  return {
    authUrl: resolveTemplate(config.authUrl ?? "", envMap),
    tokenUrl: resolveTemplate(config.tokenUrl ?? "", envMap),
    clientId: resolveTemplate(config.clientId ?? "", envMap),
    clientSecret: resolveTemplate(config.clientSecret ?? "", envMap),
    scope: resolveTemplate(config.scope ?? "", envMap),
  };
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let binary = "";
  arr.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return base64UrlEncode(bytes.buffer).slice(0, length);
}

async function createPkcePair() {
  const verifier = randomString(64);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64UrlEncode(digest) };
}

function capitalizeTokenType(tokenType: string): string {
  return tokenType.length
    ? tokenType[0].toUpperCase() + tokenType.slice(1).toLowerCase()
    : "Bearer";
}

function tokenFromResponse(
  json: Record<string, unknown>,
  environmentId: string | null,
): OAuth2CachedToken {
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : null;
  const tokenType =
    typeof json.token_type === "string" && json.token_type ? json.token_type : "Bearer";
  return {
    accessToken: json.access_token as string,
    tokenType: capitalizeTokenType(tokenType),
    expiresAt: expiresIn !== null ? Date.now() + expiresIn * 1000 : null,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    environmentId,
    fetchedAt: Date.now(),
  };
}

async function requestToken(
  tokenUrl: string,
  body: URLSearchParams,
  environment: Environment | null | undefined,
): Promise<OAuth2CachedToken> {
  let res: Response;
  try {
    res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Token request failed: ${msg}. Check the Token URL and CORS.`);
  }

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // Non-JSON error bodies fall through to the !res.ok branch, reported as raw text.
  }

  if (!res.ok) {
    const description = typeof json.error_description === "string" ? json.error_description : text;
    throw new Error(`Token endpoint returned ${res.status}: ${description || res.statusText}`);
  }
  if (typeof json.access_token !== "string") {
    throw new Error("Token endpoint response is missing access_token.");
  }

  return tokenFromResponse(json, environment?.id ?? null);
}

export async function fetchClientCredentialsToken(
  config: OAuth2Config,
  environment: Environment | null | undefined,
): Promise<OAuth2CachedToken> {
  const resolved = resolveOAuth2Config(config, environment);
  if (!resolved.tokenUrl) throw new Error("Token URL is required.");
  if (!resolved.clientId) throw new Error("Client ID is required.");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: resolved.clientId,
  });
  if (resolved.clientSecret) body.set("client_secret", resolved.clientSecret);
  if (resolved.scope) body.set("scope", resolved.scope);

  return requestToken(resolved.tokenUrl, body, environment);
}

/**
 * Opens a popup to the provider's authorize URL, waits for `oauth.callback`'s
 * postMessage, then exchanges the returned code for a token. Rejects if the popup
 * is blocked, closed early, or the callback reports an error/state mismatch.
 */
export async function beginAuthorizationCodeFlow(
  config: OAuth2Config,
  environment: Environment | null | undefined,
): Promise<OAuth2CachedToken> {
  const resolved = resolveOAuth2Config(config, environment);
  if (!resolved.authUrl) throw new Error("Auth URL is required for the Authorization Code grant.");
  if (!resolved.tokenUrl) throw new Error("Token URL is required.");
  if (!resolved.clientId) throw new Error("Client ID is required.");

  const { verifier, challenge } = await createPkcePair();
  const state = randomString(24);
  const redirectUri = getOAuth2RedirectUri();

  const authorizeUrl = new URL(resolved.authUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", resolved.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  if (resolved.scope) authorizeUrl.searchParams.set("scope", resolved.scope);

  // Deliberately no "noopener" — the callback route needs window.opener to post the code back.
  const popup = window.open(authorizeUrl.toString(), "reqlo-oauth2", "width=520,height=680");
  if (!popup) throw new Error("Popup blocked — allow popups for this site and try again.");

  const code = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as
        | { source?: string; code?: string; state?: string; error?: string }
        | null
        | undefined;
      if (!data || data.source !== POPUP_MESSAGE_SOURCE) return;
      settled = true;
      cleanup();
      popup.close();
      if (data.error) {
        reject(new Error(`Authorization failed: ${data.error}`));
      } else if (data.state !== state) {
        reject(new Error("Authorization state mismatch — aborted."));
      } else if (!data.code) {
        reject(new Error("Authorization response was missing a code."));
      } else {
        resolve(data.code);
      }
    };
    window.addEventListener("message", onMessage);
    const poll = window.setInterval(() => {
      if (popup.closed && !settled) {
        cleanup();
        reject(new Error("Authorization window was closed before completing sign-in."));
      }
    }, 500);
  });

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: resolved.clientId,
    code_verifier: verifier,
  });
  if (resolved.clientSecret) body.set("client_secret", resolved.clientSecret);

  return requestToken(resolved.tokenUrl, body, environment);
}

export async function refreshOAuth2Token(
  config: OAuth2Config,
  environment: Environment | null | undefined,
): Promise<OAuth2CachedToken> {
  const refreshToken = config.cachedToken?.refreshToken;
  if (!refreshToken)
    throw new Error("No refresh token available — get a new access token instead.");

  const resolved = resolveOAuth2Config(config, environment);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: resolved.clientId,
  });
  if (resolved.clientSecret) body.set("client_secret", resolved.clientSecret);
  if (resolved.scope) body.set("scope", resolved.scope);

  return requestToken(resolved.tokenUrl, body, environment);
}
