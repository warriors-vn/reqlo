import { useMemo } from "react";
import { useStore } from "@/stores/useStore";
import { buildResolvedRequestArtifacts } from "@/features/code-snippets/utils/request-resolver";
import type { ApiRequest, RequestAuth } from "@/services/db";
import { cn } from "@/lib/utils";

interface Props {
  request: ApiRequest;
}

const AUTH_TYPES: Array<{ value: RequestAuth["type"]; label: string; description: string }> = [
  { value: "none", label: "No Auth", description: "Send the request without authentication" },
  { value: "basic", label: "Basic", description: "Base64 encoded username and password" },
  { value: "bearer", label: "Bearer", description: "Authorization header with a token" },
  { value: "api-key", label: "API Key", description: "Attach a custom header or query parameter" },
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
            : { type: "none" };
    void updateRequest(request.id, { auth: next });
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
              <div className="mt-1 text-[11px] text-muted-foreground">{authType.description}</div>
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
            <input
              value={request.auth.username ?? ""}
              onChange={(event) => setAuth({ username: event.target.value })}
              placeholder="demo"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 text-sm outline-none transition focus:border-foreground/15"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={request.auth.password ?? ""}
              onChange={(event) => setAuth({ password: event.target.value })}
              placeholder="••••••••"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 text-sm outline-none transition focus:border-foreground/15"
            />
          </Field>
        </div>
      )}

      {request.auth.type === "bearer" && (
        <Field label="Token" hint="Supports environment variables like {{API_TOKEN}}">
          <input
            type="password"
            value={request.auth.token ?? ""}
            onChange={(event) => setAuth({ token: event.target.value })}
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
            <input
              value={request.auth.key ?? ""}
              onChange={(event) => setAuth({ key: event.target.value })}
              placeholder="X-API-Key"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
            />
          </Field>
          <Field label="Value" hint="Resolved before sending and snippet generation">
            <input
              type="password"
              value={request.auth.value ?? ""}
              onChange={(event) => setAuth({ value: event.target.value })}
              placeholder="{{API_KEY}}"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-border/80 bg-background/80 px-3 font-mono text-sm outline-none transition focus:border-foreground/15"
            />
          </Field>
        </div>
      )}

      <div className="rounded-[24px] border border-border/80 bg-background/70 p-4 shadow-[0_10px_32px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold tracking-tight">Resolved auth preview</div>
            <div className="text-[11px] text-muted-foreground">
              {environment ? `Environment: ${environment.name}` : "No environment selected"}
            </div>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {request.auth.type}
          </span>
        </div>

        <div className="mt-3 space-y-2 text-[11px]">
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
      <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
        <span>{label}</span>
        {hint ? (
          <span className="text-[10px] font-normal text-muted-foreground/70">{hint}</span>
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

function maskPreview(value: string) {
  if (!value) return "(empty)";
  if (value.length <= 6) return "•".repeat(value.length);
  return `${value.slice(0, 3)}${"•".repeat(Math.min(8, value.length - 5))}${value.slice(-2)}`;
}
