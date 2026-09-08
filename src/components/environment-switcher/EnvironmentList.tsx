import { Check, Globe, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Environment, KV } from "@/services/db";

interface Props {
  environments: Environment[];
  activeEnvId: string | null;
  selectedEnvId: string | null;
  viewingGlobals: boolean;
  globals: KV[];
  newName: string;
  onNewNameChange: (value: string) => void;
  onCreate: () => void;
  onSelectGlobals: () => void;
  onSelectEnvironment: (id: string) => void;
  onSetActive: (id: string) => void;
}

/** The left-hand rail: the Globals entry, every environment, and the "New environment" form. */
export function EnvironmentList({
  environments,
  activeEnvId,
  selectedEnvId,
  viewingGlobals,
  globals,
  newName,
  onNewNameChange,
  onCreate,
  onSelectGlobals,
  onSelectEnvironment,
  onSetActive,
}: Props) {
  const globalsEnabledCount = globals.filter((item) => item.enabled && item.key.trim()).length;

  return (
    <aside className="space-y-4 rounded-[28px] border border-border/80 bg-background/55 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">Workspace environments</div>
          <div className="text-2xs text-muted-foreground">
            {environments.length} total · {activeEnvId ? "1 active" : "No active env"}
          </div>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Globe className="h-4 w-4" />
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={onSelectGlobals}
          className={cn(
            "flex w-full items-center gap-2 rounded-2xl border p-2 text-left transition",
            viewingGlobals
              ? "border-primary/25 bg-primary/8 shadow-[0_10px_24px_rgba(99,102,241,0.08)]"
              : "border-border/70 bg-background/60 hover:border-foreground/10 hover:bg-accent/20",
          )}
        >
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Globe className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1 rounded-xl px-1 py-1">
            <div className="truncate text-sm font-medium tracking-tight">Globals</div>
            <div className="mt-1 text-2xs text-muted-foreground">
              {globalsEnabledCount} enabled variable{globalsEnabledCount === 1 ? "" : "s"} · always
              active
            </div>
          </div>
        </button>
        {environments.map((environment) => {
          const selected = !viewingGlobals && environment.id === selectedEnvId;
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
                onClick={() => onSelectEnvironment(environment.id)}
                className="min-w-0 flex-1 rounded-xl px-2 py-2 text-left"
              >
                <div className="truncate text-sm font-medium tracking-tight">
                  {environment.name}
                </div>
                <div className="mt-1 text-2xs text-muted-foreground">
                  {enabledCount} enabled variable{enabledCount === 1 ? "" : "s"}
                </div>
              </button>
              <button
                type="button"
                onClick={() => onSetActive(environment.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-1 rounded-xl border px-2.5 text-2xs font-medium transition",
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
        <div className="text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          New environment
        </div>
        <input
          value={newName}
          onChange={(event) => onNewNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCreate();
            }
          }}
          placeholder="Environment name"
          aria-label="New environment name"
          className="mt-2 h-10 w-full rounded-2xl border border-border/80 bg-background/80 px-3 text-sm outline-none transition focus:border-foreground/15"
        />
        <button
          type="button"
          onClick={onCreate}
          className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Create environment
        </button>
        <p className="mt-2 text-2xs leading-5 text-muted-foreground">
          Variables resolve in URLs, auth, headers, query params, request bodies, and code snippets.
        </p>
      </div>
    </aside>
  );
}
