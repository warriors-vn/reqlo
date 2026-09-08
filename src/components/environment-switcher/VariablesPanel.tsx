import { Check, CopyPlus, Globe, Trash2 } from "lucide-react";
import { KeyValueGrid } from "@/features/request-body/components/KeyValueGrid";
import type { Environment, KV } from "@/services/db";

interface Props {
  viewingGlobals: boolean;
  selectedEnvironment: Environment | null;
  activeEnvId: string | null;
  globals: KV[];
  onGlobalsChange: (next: KV[]) => void;
  nameDraft: string;
  onNameDraftChange: (value: string) => void;
  onCommitName: () => void;
  onNameEnter: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onNameEscape: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSetActive: (id: string) => void;
  onDuplicate: () => void;
  deleteArmId: string | null;
  onArmDelete: (id: string) => void;
  onCancelDeleteArm: () => void;
  onConfirmDelete: () => void;
  onEnvironmentVariablesChange: (variables: KV[]) => void;
}

/** The middle panel: either the Globals variables grid, or the selected environment's name/actions/variables grid. */
export function VariablesPanel({
  viewingGlobals,
  selectedEnvironment,
  activeEnvId,
  globals,
  onGlobalsChange,
  nameDraft,
  onNameDraftChange,
  onCommitName,
  onNameEnter,
  onNameEscape,
  onSetActive,
  onDuplicate,
  deleteArmId,
  onArmDelete,
  onCancelDeleteArm,
  onConfirmDelete,
  onEnvironmentVariablesChange,
}: Props) {
  if (viewingGlobals) {
    return (
      <>
        <div className="rounded-[28px] border border-border/80 bg-background/70 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">Globals</div>
              <p className="text-2xs leading-5 text-muted-foreground">
                Always merged into template resolution, regardless of which environment is active.
                An environment variable with the same key takes precedence.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-border/80 bg-background/70 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold tracking-tight">Variables</div>
              <div className="text-2xs text-muted-foreground">
                Available to every environment via template expressions like {"{{API_VERSION}}"}.
              </div>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {`${globals.filter((item) => item.enabled && item.key.trim()).length} active`}
            </span>
          </div>
          <KeyValueGrid
            rows={globals}
            onChange={onGlobalsChange}
            keyLabel="Variable"
            valueLabel="Value"
            supportsSecret
            templatable={false}
          />
        </div>
      </>
    );
  }

  if (!selectedEnvironment) {
    return (
      <div className="rounded-[28px] border border-dashed border-border bg-background/55 px-6 py-14 text-center">
        <div className="text-lg font-semibold tracking-tight">No environment selected</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Create an environment on the left to start managing variables and switching context.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-[28px] border border-border/80 bg-background/70 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {selectedEnvironment.id === activeEnvId ? "Active" : "Inactive"}
              </span>
              <span className="rounded-full bg-background px-2.5 py-1 text-3xs font-medium text-muted-foreground">
                {selectedEnvironment.variables.length} variable
                {selectedEnvironment.variables.length === 1 ? "" : "s"}
              </span>
            </div>
            <label className="block space-y-1.5">
              <span className="text-2xs font-medium text-muted-foreground">Environment name</span>
              <input
                value={nameDraft}
                onChange={(event) => onNameDraftChange(event.target.value)}
                onBlur={onCommitName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onNameEnter(event);
                  if (event.key === "Escape") onNameEscape(event);
                }}
                className="h-11 w-full rounded-2xl border border-border/80 bg-background/80 px-3 text-sm outline-none transition focus:border-foreground/15"
              />
            </label>
            <p className="text-2xs leading-5 text-muted-foreground">
              Use short, memorable names like Local, Staging, or Production. Templates resolve
              against the active environment across send, snippets, and auth preview.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {selectedEnvironment.id !== activeEnvId && (
              <button
                type="button"
                onClick={() => onSetActive(selectedEnvironment.id)}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:opacity-90"
              >
                <Check className="h-3.5 w-3.5" /> Set active
              </button>
            )}
            <button
              type="button"
              onClick={onDuplicate}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-border px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <CopyPlus className="h-3.5 w-3.5" /> Duplicate
            </button>
            {deleteArmId === selectedEnvironment.id ? (
              <>
                <button
                  type="button"
                  onClick={onCancelDeleteArm}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-border px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-3 text-xs font-medium text-destructive transition hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Confirm delete
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onArmDelete(selectedEnvironment.id)}
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
            <div className="text-2xs text-muted-foreground">
              Enabled keys are available to template expressions like {"{{API_TOKEN}}"}.
            </div>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {`${selectedEnvironment.variables.filter((item) => item.enabled && item.key.trim()).length} active`}
          </span>
        </div>
        <KeyValueGrid
          rows={selectedEnvironment.variables}
          onChange={onEnvironmentVariablesChange}
          keyLabel="Variable"
          valueLabel="Value"
          supportsSecret
          templatable={false}
        />
      </div>
    </>
  );
}
