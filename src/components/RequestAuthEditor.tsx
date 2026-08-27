import { useMemo, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/stores/useStore";
import { buildResolvedRequestArtifacts } from "@/features/code-snippets/utils/request-resolver";
import { copyTextToClipboard } from "@/features/code-snippets/utils/clipboard";
import {
  beginAuthorizationCodeFlow,
  fetchClientCredentialsToken,
  getOAuth2RedirectUri,
} from "@/services/oauth2";
import {
  createDefaultOAuth2Config,
  type ApiRequest,
  type OAuth2CachedToken,
  type OAuth2Config,
  type RequestAuth,
} from "@/services/db";
import { cn } from "@/lib/utils";
import { maskPreview } from "@/lib/mask";
import { TemplateInput } from "@/components/TemplateInput";

interface Props {
  request: ApiRequest;
}

const AUTH_TYPES: Array<{ value: RequestAuth["type"]; label: string; description: string }> = [
  { value: "none", label: "No Auth", description: "Send the request without authentication" },
  { value: "basic", label: "Basic", description: "Base64 encoded username and password" },
  { value: "bearer", label: "Bearer", description: "Authorization header with a token" },
  { value: "api-key", label: "API Key", description: "Attach a custom header or query parameter" },
  { value: "oauth2", label: "OAuth 2.0", description: "Fetch and cache an access token" },
];

export function RequestAuthEditor({ request }: Props) {
  const updateRequest = useStore((state) => state.updateRequest);
  const environments = useStore((state) => state.environments);
  const activeEnvId = useStore((state) => state.activeEnvId);
  const environment = environments.find((item) => item.id === activeEnvId) ?? null;

  const setAuth = (patch: Partial<RequestAuth>) => {
    void updateRequest(request.id, { auth: { ...request.auth, ...patch } });
  };

  const setType = (type: RequestAuth["type"]) => {
    const next: RequestAuth =
      type === "api-key"
        ? {
            type,
            key: request.auth.key ?? "",
            value: request.auth.value ?? "",
            addTo: request.auth.addTo ?? "header",
          }
        : type === "basic"
          ? { type, username: request.auth.username ?? "", password: request.auth.password ?? "" }
          : type === "bearer"
            ? { type, token: request.auth.token ?? "" }
            : type === "oauth2"
              ? { type, oauth2: request.auth.oauth2 ?? createDefaultOAuth2Config() }
              : { type: "none" };
    void updateRequest(request.id, { auth: next });
  };

  const oauth2 = request.auth.oauth2 ?? createDefaultOAuth2Config();
  const setOAuth2 = (patch: Partial<OAuth2Config>) => {
    setAuth({ oauth2: { ...oauth2, ...patch } });
  };
  const [isFetchingToken, setIsFetchingToken] = useState(false);

  const handleGetToken = async () => {
    setIsFetchingToken(true);
    try {
      const token =
        oauth2.grantType === "client_credentials"
          ? await fetchClientCredentialsToken(oauth2, environment)
          : await beginAuthorizationCodeFlow(oauth2, environment);
      setOAuth2({ cachedToken: token });
      toast.success("Access token fetched", {
        description: token.expiresAt
          ? `Expires ${new Date(token.expiresAt).toLocaleTimeString()}`
          : "No expiry reported by the provider",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error("Couldn't get access token", { description: message });
    } finally {
      setIsFetchingToken(false);
    }
  };

  const preview = useMemo(
    () => buildResolvedRequestArtifacts(request, environment),
    [environment, request],
  );
  const authHeader = Object.entries(preview.resolvedHeaders).find(
    ([key]) => key.toLowerCase() === "authorization" || key === request.auth.key,
  );
  const injectedQuery =
    request.auth.type === "api-key" && request.auth.addTo === "query"
      ? preview.resolvedQueryParams.find((item) => item.key === request.auth.key)
      : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 lg:grid-cols-4">
        {AUTH_TYPES.map((authType) => {
          const active = request.auth.type === authType.value;
          return (
            <button
              key={authType.value}
              type="button"
              onClick={() => setType(authType.value)}
              className={cn(
                "rounded-2xl border px-3 py-3 text-left transition",
                active
                  ? "border-primary/25 bg-primary/8 shadow-[0_10px_24px_rgba(99,102,241,0.08)]"
                  : "border-border/80 bg-background/70 hover:border-foreground/15 hover:bg-accent/30",
              )}
            >
              <div className="text-sm font-semibold tracking-tight">{authType.label}</div>
              <div className="mt-1 text-2xs text-muted-foreground">{authType.description}</div>
            </button>
          );
        })}
      </div>

      {request.auth.type === "none" && (
        <div className="rounded-[24px] border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
          This request will be sent without any auth headers or auth query parameters.
        </div>
      )}

      {request.auth.type === "basic" && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Username">
            <TemplateInput
              value={request.auth.username ?? ""}
              onChange={(username) => setAuth({ username })}
              placeholder="demo"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 text-sm outline-none transition focus:border-foreground/15"
            />
          </Field>
          <Field label="Password">
            <TemplateInput
              type="password"
              value={request.auth.password ?? ""}
              onChange={(password) => setAuth({ password })}
              placeholder="••••••••"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 text-sm outline-none transition focus:border-foreground/15"
            />
          </Field>
        </div>
      )}

      {request.auth.type === "bearer" && (
        <Field label="Token" hint="Supports environment variables like {{API_TOKEN}}">
          <TemplateInput
            type="password"
            value={request.auth.token ?? ""}
            onChange={(token) => setAuth({ token })}
            placeholder="Bearer token"
            autoComplete="off"
            className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
          />
        </Field>
      )}

      {request.auth.type === "api-key" && (
        <div className="grid gap-3 lg:grid-cols-[160px_1fr_1fr]">
          <Field label="Add to">
            <select
              value={request.auth.addTo ?? "header"}
              onChange={(event) => setAuth({ addTo: event.target.value as "header" | "query" })}
              className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 text-sm outline-none transition focus:border-foreground/15"
            >
              <option value="header">Header</option>
              <option value="query">Query Param</option>
            </select>
          </Field>
          <Field label="Key">
            <TemplateInput
              value={request.auth.key ?? ""}
              onChange={(key) => setAuth({ key })}
              placeholder="X-API-Key"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
            />
          </Field>
          <Field label="Value" hint="Resolved before sending and snippet generation">
            <TemplateInput
              type="password"
              value={request.auth.value ?? ""}
              onChange={(value) => setAuth({ value })}
              placeholder="{{API_KEY}}"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
            />
          </Field>
        </div>
      )}

      {request.auth.type === "oauth2" && (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Grant Type">
              <select
                value={oauth2.grantType}
                onChange={(event) =>
                  setOAuth2({ grantType: event.target.value as OAuth2Config["grantType"] })
                }
                className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 text-sm outline-none transition focus:border-foreground/15"
              >
                <option value="authorization_code">Authorization Code (PKCE)</option>
                <option value="client_credentials">Client Credentials</option>
              </select>
            </Field>
            <Field label="Redirect URI" hint="Register this with your OAuth provider">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={getOAuth2RedirectUri()}
                  className="h-10 w-full rounded-xl border border-border/80 bg-muted/30 px-3 font-mono text-sm text-muted-foreground outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    void copyTextToClipboard(getOAuth2RedirectUri());
                    toast.success("Redirect URI copied");
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-background/80 text-muted-foreground transition hover:border-foreground/15 hover:text-foreground"
                  aria-label="Copy redirect URI"
                >
                  <Copy className="size-4" />
                </button>
              </div>
            </Field>
          </div>

          {oauth2.grantType === "authorization_code" && (
            <Field label="Auth URL">
              <TemplateInput
                value={oauth2.authUrl ?? ""}
                onChange={(authUrl) => setOAuth2({ authUrl })}
                placeholder="https://provider.example.com/oauth/authorize"
                autoComplete="off"
                className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
              />
            </Field>
          )}

          <Field label="Token URL">
            <TemplateInput
              value={oauth2.tokenUrl}
              onChange={(tokenUrl) => setOAuth2({ tokenUrl })}
              placeholder="https://provider.example.com/oauth/token"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
            />
          </Field>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Client ID">
              <TemplateInput
                value={oauth2.clientId}
                onChange={(clientId) => setOAuth2({ clientId })}
                placeholder="{{CLIENT_ID}}"
                autoComplete="off"
                className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
              />
            </Field>
            <Field label="Client Secret" hint="Optional for public clients">
              <TemplateInput
                type="password"
                value={oauth2.clientSecret ?? ""}
                onChange={(clientSecret) => setOAuth2({ clientSecret })}
                placeholder="{{CLIENT_SECRET}}"
                autoComplete="off"
                className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
              />
            </Field>
          </div>

          <Field label="Scope" hint="Space-separated, optional">
            <TemplateInput
              value={oauth2.scope ?? ""}
              onChange={(scope) => setOAuth2({ scope })}
              placeholder="read write"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
            />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-muted/10 px-4 py-3">
            <TokenStatus token={oauth2.cachedToken} environmentId={environment?.id ?? null} />
            <button
              type="button"
              onClick={() => void handleGetToken()}
              disabled={isFetchingToken}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {isFetchingToken && <Loader2 className="size-4 animate-spin" />}
              Get New Access Token
            </button>
          </div>
        </div>
      )}

      <div className="rounded-[24px] border border-border/80 bg-background/70 p-4 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold tracking-tight">Resolved auth preview</div>
            <div className="text-2xs text-muted-foreground">
              {environment ? `Environment: ${environment.name}` : "No environment selected"}
            </div>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {request.auth.type}
          </span>
        </div>

        <div className="mt-3 space-y-2 text-2xs">
          {authHeader ? (
            <PreviewRow label="Header" value={`${authHeader[0]}: ${maskPreview(authHeader[1])}`} />
          ) : null}
          {injectedQuery ? (
            <PreviewRow
              label="Query"
              value={`${injectedQuery.key}=${maskPreview(injectedQuery.value)}`}
            />
          ) : null}
          {!authHeader && !injectedQuery && (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2 text-muted-foreground">
              No auth data will be injected for this request yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between gap-2 text-2xs font-medium text-muted-foreground">
        <span>{label}</span>
        {hint ? (
          <span className="text-3xs font-normal text-muted-foreground/70">{hint}</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2 md:grid-cols-[72px_1fr]">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-foreground/90">{value}</span>
    </div>
  );
}

function TokenStatus({
  token,
  environmentId,
}: {
  token: OAuth2CachedToken | undefined;
  environmentId: string | null;
}) {
  if (!token) {
    return <span className="text-2xs text-muted-foreground">No access token yet.</span>;
  }
  if (token.expiresAt !== null && token.expiresAt <= Date.now()) {
    return (
      <span className="text-2xs font-medium text-[var(--status-warn)]">
        Token expired — fetch a new one.
      </span>
    );
  }
  if (token.environmentId !== environmentId) {
    return (
      <span className="text-2xs font-medium text-[var(--status-warn)]">
        Fetched under a different environment — fetch again to use it here.
      </span>
    );
  }
  return (
    <span className="text-2xs font-medium text-[var(--status-success)]">
      Valid token
      {token.expiresAt
        ? ` · expires ${new Date(token.expiresAt).toLocaleTimeString()}`
        : " · no expiry reported"}
    </span>
  );
}
