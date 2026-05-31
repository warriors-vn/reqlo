import { useEffect, useMemo, useState } from "react";
import { Check, CopyPlus, Globe, Plus, Trash2 } from "lucide-react";
import { Overlay } from "./Overlay";
import { KeyValueGrid } from "@/features/request-body/components/KeyValueGrid";
import { buildResolvedRequestArtifacts } from "@/features/code-snippets/utils/request-resolver";
import { cn } from "@/lib/utils";
import type { ApiRequest } from "@/services/db";
import { useStore } from "@/stores/useStore";

export function EnvironmentSwitcher() {
  const open = useStore((state) => state.overlays["env-switcher"]);
  const close = () => useStore.getState().closeOverlay("env-switcher");
  const environments = useStore((state) => state.environments);
  const activeEnvId = useStore((state) => state.activeEnvId);
  const setActiveEnv = useStore((state) => state.setActiveEnv);
  const createEnvironment = useStore((state) => state.createEnvironment);
  const updateEnvironment = useStore((state) => state.updateEnvironment);
  const duplicateEnvironment = useStore((state) => state.duplicateEnvironment);
  const deleteEnvironment = useStore((state) => state.deleteEnvironment);
  const activeRequest = useStore((state) => state.getActiveRequest());

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [deleteArmId, setDeleteArmId] = useState<string | null>(null);

  const selectedEnvironment = useMemo(
    () => environments.find((environment) => environment.id === selectedEnvId) ?? null,
    [environments, selectedEnvId],
  );

  const preview = useMemo(
    () =>
      activeRequest && selectedEnvironment
        ? buildResolvedRequestArtifacts(activeRequest, selectedEnvironment)
        : null,
    [activeRequest, selectedEnvironment],
  );
  const templateTokens = useMemo(() => extractTemplateTokens(activeRequest), [activeRequest]);

  useEffect(() => {
    if (!open) {
      setDeleteArmId(null);
      return;
    }

    setSelectedEnvId((current) => {
      if (current && environments.some((environment) => environment.id === current)) return current;
      return activeEnvId ?? environments[0]?.id ?? null;
    });
  }, [activeEnvId, environments, open]);

  useEffect(() => {
    setNameDraft(selectedEnvironment?.name ?? "");
    setDeleteArmId(null);
  }, [selectedEnvId, selectedEnvironment?.name]);

  const commitName = () => {
    if (!selectedEnvironment) return;
    const nextName = nameDraft.trim();
    if (!nextName) {
      setNameDraft(selectedEnvironment.name);
      return;
    }
    if (nextName !== selectedEnvironment.name) {
      void updateEnvironment(selectedEnvironment.id, { name: nextName });
    }
  };

  const handleCreate = async () => {
    const environment = await createEnvironment(newName);
    setActiveEnv(environment.id);
    setSelectedEnvId(environment.id);
    setNewName("");
    setDeleteArmId(null);
  };

  const handleDuplicate = async () => {
    if (!selectedEnvironment) return;
    const copy = await duplicateEnvironment(selectedEnvironment.id);
    if (!copy) return;
    setActiveEnv(copy.id);
    setSelectedEnvId(copy.id);
  };

  const handleDelete = async () => {
    if (!selectedEnvironment) return;
    await deleteEnvironment(selectedEnvironment.id);
    setDeleteArmId(null);
  };

  const activeAuthPreview =
    activeRequest && preview
      ? formatResolvedAuth(activeRequest, preview.resolvedHeaders, preview.resolvedQueryParams)
      : null;

  return (
    <Overlay
      open={open}
      onClose={close}
      title="Manage Environments"
      subtitle="Switch contexts, edit variables, and preview how templates resolve"
      maxW="max-w-6xl"
    >
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-[28px] border border-border/80 bg-background/55 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold tracking-tight">Workspace environments</div>
              <div className="text-[11px] text-muted-foreground">
                {environments.length} total · {activeEnvId ? "1 active" : "No active env"}
              </div>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Globe className="h-4 w-4" />
            </div>
          </div>

          <div className="space-y-2">
            {environments.map((environment) => {
              const selected = environment.id === selectedEnvId;
              const active = environment.id === activeEnvId;
              const enabledCount = environment.variables.filter(
                (item) => item.enabled && item.key.trim(),
              ).length;

              return (
                <div
                  key={environment.id}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl border p-2 transition",
                    selected
                      ? "border-primary/25 bg-primary/8 shadow-[0_10px_24px_rgba(99,102,241,0.08)]"
                      : "border-border/70 bg-background/60 hover:border-foreground/10 hover:bg-accent/20",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedEnvId(environment.id)}
                    className="min-w-0 flex-1 rounded-xl px-2 py-2 text-left"
                  >
                    <div className="truncate text-sm font-medium tracking-tight">
                      {environment.name}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {enabledCount} enabled variable{enabledCount === 1 ? "" : "s"}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveEnv(environment.id)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-medium transition",
                      active
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                    title={active ? "Active environment" : "Set active environment"}
                  >
                    {active ? <Check className="h-3.5 w-3.5" /> : null}
                    {active ? "Active" : "Use"}
                  </button>
                </div>
              );
            })}

            {environments.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-xs text-muted-foreground">
                No environments yet. Create one to start resolving templates like {"{{BASE_URL}}"}.
              </div>
            )}
          </div>

          <div className="rounded-[24px] border border-dashed border-border bg-background/65 p-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              New environment
            </div>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="Environment name"
              className="mt-2 h-10 w-full rounded-2xl border border-border/80 bg-background/80 px-3 text-sm outline-none transition focus:border-foreground/15"
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Create environment
            </button>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              Variables resolve in URLs, auth, headers, query params, request bodies, and code
              snippets.
            </p>
          </div>
        </aside>

        <section className="space-y-4">
          {selectedEnvironment ? (
            <>
              <div className="rounded-[28px] border border-border/80 bg-background/70 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        {selectedEnvironment.id === activeEnvId ? "Active" : "Inactive"}
                      </span>
                      <span className="rounded-full bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                        {selectedEnvironment.variables.length} variable
                        {selectedEnvironment.variables.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Environment name
                      </span>
                      <input
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        onBlur={commitName}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitName();
                            (event.currentTarget as HTMLInputElement).blur();
                          }
                          if (event.key === "Escape") {
                            setNameDraft(selectedEnvironment.name);
                            (event.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        className="h-11 w-full rounded-2xl border border-border/80 bg-background/80 px-3 text-sm outline-none transition focus:border-foreground/15"
                      />
                    </label>
                    <p className="text-[11px] leading-5 text-muted-foreground">
                      Use short, memorable names like Local, Staging, or Production. Templates
                      resolve against the active environment across send, snippets, and auth
                      preview.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    {selectedEnvironment.id !== activeEnvId && (
                      <button
                        type="button"
                        onClick={() => setActiveEnv(selectedEnvironment.id)}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:opacity-90"
                      >
                        <Check className="h-3.5 w-3.5" /> Set active
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDuplicate()}
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-border px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    >
                      <CopyPlus className="h-3.5 w-3.5" /> Duplicate
                    </button>
                    {deleteArmId === selectedEnvironment.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setDeleteArmId(null)}
                          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-border px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete()}
                          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 text-xs font-medium text-destructive transition hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Confirm delete
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteArmId(selectedEnvironment.id)}
                        className="inline-flex h-10 items-center gap-2 rounded-2xl border border-border px-3 text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-border/80 bg-background/70 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold tracking-tight">Variables</div>
                    <div className="text-[11px] text-muted-foreground">
                      Enabled keys are available to template expressions like {"{{API_TOKEN}}"}.
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {`${selectedEnvironment.variables.filter((item) => item.enabled && item.key.trim()).length} active`}
                  </span>
                </div>
                <KeyValueGrid
                  rows={selectedEnvironment.variables}
                  onChange={(variables) =>
                    void updateEnvironment(selectedEnvironment.id, { variables })
                  }
                  keyLabel="Variable"
                  valueLabel="Value"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-[28px] border border-border/80 bg-background/70 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold tracking-tight">
                        Active request preview
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        See how the selected environment resolves the current request.
                      </div>
                    </div>
                    <span className="rounded-full bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                      {activeRequest
                        ? activeRequest.name || "Untitled request"
                        : "No request selected"}
                    </span>
                  </div>

                  {activeRequest && preview ? (
                    <div className="mt-4 space-y-3">
                      <PreviewRow label="Resolved URL" value={preview.url || "—"} />
                      <PreviewRow
                        label="Auth"
                        value={activeAuthPreview ?? "No auth data injected for this request"}
                      />
                      <PreviewRow
                        label="Headers"
                        value={`${Object.keys(preview.resolvedHeaders).length} resolved header${Object.keys(preview.resolvedHeaders).length === 1 ? "" : "s"}`}
                      />
                      <PreviewRow
                        label="Query"
                        value={`${preview.resolvedQueryParams.length} query param${preview.resolvedQueryParams.length === 1 ? "" : "s"}`}
                      />
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                      Open a request tab to preview how environment variables affect the final URL,
                      auth, headers, and query params.
                    </div>
                  )}
                </div>

                <div className="rounded-[28px] border border-border/80 bg-background/70 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
                  <div>
                    <div className="text-sm font-semibold tracking-tight">
                      Detected template keys
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Tokens referenced by the active request.
                    </div>
                  </div>

                  {templateTokens.length > 0 && preview ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {templateTokens.map((token) => {
                        const resolved = preview.envMap.has(token);
                        return (
                          <span
                            key={token}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]",
                              resolved
                                ? "border-primary/20 bg-primary/10 text-primary"
                                : "border-border bg-muted/40 text-muted-foreground",
                            )}
                          >
                            {token}
                            <span className="ml-1 normal-case tracking-normal">
                              {resolved ? "resolved" : "missing"}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                      {activeRequest
                        ? "The active request does not reference any {{TEMPLATE_KEYS}} yet."
                        : "No active request selected."}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-[28px] border border-dashed border-border bg-background/55 px-6 py-14 text-center">
              <div className="text-lg font-semibold tracking-tight">No environment selected</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Create an environment on the left to start managing variables and switching context.
              </p>
            </div>
          )}
        </section>
      </div>
    </Overlay>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-border/70 bg-background/70 px-3 py-2 md:grid-cols-[96px_1fr]">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-[11px] text-foreground/90">{value}</span>
    </div>
  );
}

function extractTemplateTokens(request: ApiRequest | null) {
  if (!request) return [];

  const tokens = new Set<string>();
  const collect = (value?: string) => {
    if (!value) return;
    const matches = value.matchAll(/\{\{\s*([\w.-]+)\s*}}/g);
    for (const match of matches) {
      if (match[1]) tokens.add(match[1]);
    }
  };

  collect(request.url);
  request.headers.forEach((item) => {
    collect(item.key);
    collect(item.value);
  });
  request.queryParams.forEach((item) => {
    collect(item.key);
    collect(item.value);
  });
  collect(request.body);
  collect(request.bodyDrafts.json);
  collect(request.bodyDrafts.raw);
  collect(request.bodyDrafts.xml);
  request.bodyDrafts.urlEncoded.forEach((item) => {
    collect(item.key);
    collect(item.value);
  });
  request.bodyDrafts.formData.forEach((item) => {
    collect(item.key);
    collect(item.value);
  });
  collect(request.bodyDrafts.graphql.query);
  collect(request.bodyDrafts.graphql.variables);
  collect(request.bodyDrafts.graphql.operationName);
  collect(request.auth.username);
  collect(request.auth.password);
  collect(request.auth.token);
  collect(request.auth.key);
  collect(request.auth.value);

  return [...tokens].sort((left, right) => left.localeCompare(right));
}

function formatResolvedAuth(
  request: ApiRequest,
  headers: Record<string, string>,
  queryParams: Array<{ key: string; value: string }>,
) {
  const authorization = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "authorization",
  );

  if (authorization) {
    return `${authorization[0]}: ${maskPreview(authorization[1])}`;
  }

  if (request.auth.type === "api-key") {
    const key = request.auth.key ?? "";
    const queryMatch = queryParams.find((item) => item.key === key);
    if (queryMatch) return `${queryMatch.key}=${maskPreview(queryMatch.value)}`;
    if (key && headers[key] !== undefined) return `${key}: ${maskPreview(headers[key])}`;
  }

  return null;
}

function maskPreview(value: string) {
  if (!value) return "(empty)";
  if (value.length <= 6) return "•".repeat(value.length);
  return `${value.slice(0, 3)}${"•".repeat(Math.min(8, value.length - 5))}${value.slice(-2)}`;
}
