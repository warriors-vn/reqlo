import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Overlay } from "@/components/Overlay";
import { KeyValueGrid } from "@/features/request-body/components/KeyValueGrid";
import { TemplateInput } from "@/components/TemplateInput";
import { useStore } from "@/stores/useStore";
import {
  createDefaultRequestDefaults,
  type KV,
  type RequestAuth,
  type RequestDefaults,
} from "@/services/db";
import { cn } from "@/lib/utils";

type Tab = "auth" | "headers" | "params" | "variables";

const TABS: { id: Tab; label: string }[] = [
  { id: "auth", label: "Auth" },
  { id: "headers", label: "Headers" },
  { id: "params", label: "Query params" },
  { id: "variables", label: "Variables" },
];

/**
 * OAuth 2.0 is deliberately absent. Its whole lifecycle is request-scoped —
 * "Get New Access Token" writes a cached token back onto the request, and
 * executor.ts refreshes an expired one from `request.auth.oauth2` before a
 * send. Offering it here would present a control that stores a config nothing
 * can obtain or refresh a token for, which is worse than not offering it.
 */
const AUTH_TYPES: { value: RequestAuth["type"]; label: string; description: string }[] = [
  { value: "none", label: "None", description: "This level adds no auth of its own" },
  { value: "basic", label: "Basic", description: "Base64 encoded username and password" },
  { value: "bearer", label: "Bearer", description: "Authorization header with a token" },
  { value: "api-key", label: "API Key", description: "A custom header or query parameter" },
];

export function CollectionSettingsModal() {
  const open = useStore((s) => s.overlays["collection-settings"]);
  const target = useStore((s) => s.defaultsTarget);
  const closeOverlay = useStore((s) => s.closeOverlay);
  const collections = useStore((s) => s.collections);
  const folders = useStore((s) => s.folders);
  const updateCollectionDefaults = useStore((s) => s.updateCollectionDefaults);
  const updateFolderDefaults = useStore((s) => s.updateFolderDefaults);
  const requests = useStore((s) => s.requests);
  const [tab, setTab] = useState<Tab>("auth");

  const node = useMemo(() => {
    if (!target) return null;
    return target.type === "collection"
      ? (collections.find((item) => item.id === target.id) ?? null)
      : (folders.find((item) => item.id === target.id) ?? null);
  }, [target, collections, folders]);

  const defaults = node?.defaults ?? createDefaultRequestDefaults();

  // How many requests this actually affects, so the consequence of a change is
  // visible before it's made rather than discovered on the next send.
  const inheritingCount = useMemo(() => {
    if (!target || !node) return 0;
    const descendantFolderIds = new Set<string>();
    if (target.type === "folder") {
      const walk = (id: string) => {
        descendantFolderIds.add(id);
        folders.filter((f) => f.parentFolderId === id).forEach((f) => walk(f.id));
      };
      walk(target.id);
    }
    return requests.filter((request) => {
      if (request.auth.type !== "inherit") return false;
      return target.type === "collection"
        ? request.collectionId === target.id
        : !!request.folderId && descendantFolderIds.has(request.folderId);
    }).length;
  }, [target, node, folders, requests]);

  const save = (patch: Partial<RequestDefaults>) => {
    if (!target) return;
    const next: RequestDefaults = { ...defaults, ...patch };
    const write =
      target.type === "collection"
        ? updateCollectionDefaults(target.id, next)
        : updateFolderDefaults(target.id, next);
    void write.catch(() => {});
  };

  const setAuth = (patch: Partial<RequestAuth>) => save({ auth: { ...defaults.auth, ...patch } });

  const setAuthType = (type: RequestAuth["type"]) => {
    const next: RequestAuth =
      type === "api-key"
        ? {
            type,
            key: defaults.auth.key ?? "",
            value: defaults.auth.value ?? "",
            addTo: defaults.auth.addTo ?? "header",
          }
        : { ...defaults.auth, type };
    save({ auth: next });
  };

  if (!open) return null;

  const label = target?.type === "folder" ? "folder" : "collection";

  return (
    <Overlay
      open={open}
      onClose={() => closeOverlay("collection-settings")}
      title={node ? `${node.name} settings` : "Settings"}
      subtitle={`Auth, headers, query params and variables every request in this ${label} inherits`}
      maxW="max-w-3xl"
    >
      {!node ? (
        <p className="p-6 text-sm text-muted-foreground">
          This {label} no longer exists — it may have been deleted in another tab.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label={`${node.name} settings sections`}
              className="flex flex-wrap gap-1 rounded-full border border-border/70 bg-muted/40 p-1"
            >
              {TABS.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition",
                    tab === item.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {inheritingCount === 0
                ? "No request here is set to inherit yet"
                : `${inheritingCount} request${inheritingCount === 1 ? "" : "s"} inheriting`}
            </span>
          </div>

          {tab === "auth" && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-4">
                {AUTH_TYPES.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setAuthType(item.value)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition",
                      defaults.auth.type === item.value
                        ? "border-primary bg-primary/5"
                        : "border-border/70 hover:border-border",
                    )}
                  >
                    <div className="text-sm font-medium text-foreground">{item.label}</div>
                    <div className="mt-1 text-3xs text-muted-foreground">{item.description}</div>
                  </button>
                ))}
              </div>

              {defaults.auth.type === "basic" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <LabeledInput
                    label="Username"
                    value={defaults.auth.username ?? ""}
                    onChange={(username) => setAuth({ username })}
                  />
                  <LabeledInput
                    label="Password"
                    value={defaults.auth.password ?? ""}
                    onChange={(password) => setAuth({ password })}
                  />
                </div>
              )}

              {defaults.auth.type === "bearer" && (
                <LabeledInput
                  label="Token"
                  value={defaults.auth.token ?? ""}
                  onChange={(token) => setAuth({ token })}
                />
              )}

              {defaults.auth.type === "api-key" && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <LabeledInput
                    label="Key"
                    value={defaults.auth.key ?? ""}
                    onChange={(key) => setAuth({ key })}
                  />
                  <LabeledInput
                    label="Value"
                    value={defaults.auth.value ?? ""}
                    onChange={(value) => setAuth({ value })}
                  />
                  <label className="space-y-1">
                    <span className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
                      Add to
                    </span>
                    <select
                      value={defaults.auth.addTo ?? "header"}
                      onChange={(event) =>
                        setAuth({ addTo: event.target.value as "header" | "query" })
                      }
                      className="h-9 w-full rounded-lg border border-border/70 bg-background px-2 text-sm"
                    >
                      <option value="header">Header</option>
                      <option value="query">Query param</option>
                    </select>
                  </label>
                </div>
              )}

              <Note>
                A request uses this only while its own Auth tab is set to{" "}
                <strong className="font-medium text-foreground">Inherit</strong>. Requests created
                before collection auth existed are set to <em>None</em> — an explicit “send nothing”
                — so adding a token here never silently changes what they already send. OAuth 2.0
                stays per-request: its token has to be fetched and refreshed against a specific
                request.
              </Note>
            </div>
          )}

          {tab === "headers" && (
            <div className="space-y-3">
              <KeyValueGrid
                rows={defaults.headers}
                onChange={(headers: KV[]) => save({ headers })}
                keyLabel="Header"
                valueLabel="Value"
              />
              <Note>
                Merged under each request’s own headers. A request header with the same name wins —
                including when it’s unchecked, which turns the inherited one off rather than handing
                control back to this level.
              </Note>
            </div>
          )}

          {tab === "params" && (
            <div className="space-y-3">
              <KeyValueGrid
                rows={defaults.queryParams}
                onChange={(queryParams: KV[]) => save({ queryParams })}
                keyLabel="Parameter"
                valueLabel="Value"
              />
              <Note>
                Appended to every request’s query string. Unlike headers these are case-sensitive,
                so <code className="font-mono">page</code> and{" "}
                <code className="font-mono">Page</code> are different parameters.
              </Note>
            </div>
          )}

          {tab === "variables" && (
            <div className="space-y-3">
              <KeyValueGrid
                rows={defaults.variables}
                onChange={(variables: KV[]) => save({ variables })}
                keyLabel="Variable"
                valueLabel="Value"
                supportsSecret
                templatable={false}
              />
              <Note>
                Resolved above workspace globals and below the active environment, so an environment
                of the same name still wins. Useful for a value that belongs to this {label} rather
                than to one deployment of it.
              </Note>
            </div>
          )}
        </div>
      )}
    </Overlay>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <TemplateInput
        value={value}
        onChange={onChange}
        className="h-9 w-full rounded-lg border border-border/70 bg-background px-2 text-sm"
      />
    </label>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
