import { useEffect, useState } from "react";
import { Overlay } from "./Overlay";
import { pickFile, useStore } from "@/stores/useStore";
import { IS_MAC } from "@/core/commands/shortcuts";
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

type RestoreCapableStore = ReturnType<typeof useStore.getState> & {
  importWorkspaceJSON: (text: string) => Promise<{ name: string } | null>;
};

export function SettingsModal() {
  const open = useStore((s) => s.overlays.settings);
  const close = () => useStore.getState().closeOverlay("settings");
  const workspace = useStore((s) => s.workspace);
  const collections = useStore((s) => s.collections);
  const requests = useStore((s) => s.requests);
  const environments = useStore((s) => s.environments);
  const exportActiveWorkspace = useStore((s) => s.exportActiveWorkspace);
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  // SettingsModal stays mounted (Overlay only hides it), and the theme can also
  // change via the command palette while this is closed — resync on every open.
  useEffect(() => {
    if (open) setTheme(getStoredTheme());
  }, [open]);

  return (
    <Overlay open={open} onClose={close} title="Settings" subtitle="Reqlo workspace preferences">
      <div className="space-y-5 text-xs">
        <Section label="Appearance">
          <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setTheme(option.value);
                  setStoredTheme(option.value);
                  applyTheme(option.value);
                }}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-2xs font-medium transition-colors",
                  theme === option.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Section>

        <Section label="Workspace">
          <Row k="Name" v={workspace?.name ?? "—"} />
          <Row k="Collections" v={String(collections.length)} />
          <Row k="Requests" v={String(requests.length)} />
          <Row k="Environments" v={String(environments.length)} />
        </Section>

        <Section label="Platform">
          <Row k="Storage" v="IndexedDB (local-first)" />
          <Row k="OS Modifier" v={IS_MAC ? "⌘ Command" : "Ctrl"} />
        </Section>

        <Section label="Backup & restore">
          <div className="space-y-2">
            <button
              onClick={() => void exportActiveWorkspace()}
              className="rounded-lg border border-border px-3 py-1.5 text-2xs font-medium text-foreground hover:bg-accent"
            >
              Export workspace backup
            </button>
            <button
              onClick={async () => {
                const confirmed = window.confirm(
                  "Restore a workspace backup? This will replace the current local workspace.",
                );
                if (!confirmed) return;

                const text = await pickFile("application/json,.json");
                if (!text) return;

                let workspace: { name: string } | null;
                try {
                  workspace = await (
                    useStore.getState() as RestoreCapableStore
                  ).importWorkspaceJSON(text);
                } catch {
                  toast.error("Restore failed", {
                    description: "Nothing was changed — your current workspace is still intact.",
                  });
                  return;
                }
                if (!workspace) {
                  toast.error("Restore failed", {
                    description: "The selected file is not a valid Reqlo workspace export.",
                  });
                  return;
                }

                const state = useStore.getState();
                toast.success("Workspace restored", {
                  description: `${workspace.name} · ${state.requests.length} requests · ${state.history.length} history entries`,
                });
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-2xs font-medium text-foreground hover:bg-accent"
            >
              Restore workspace backup
            </button>
            <p className="text-2xs leading-5 text-muted-foreground">
              Export creates a full local backup. Restore replaces the current workspace, including
              requests, environments, and history.
            </p>
          </div>
        </Section>

        <Section label="Danger zone">
          <button
            onClick={() => {
              if (!confirm("Erase all local data? This cannot be undone.")) return;
              indexedDB.deleteDatabase("reqlo");
              localStorage.removeItem("reqlo:session");
              localStorage.removeItem("reqlo:recent-commands");
              window.location.reload();
            }}
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-2xs font-medium text-destructive hover:bg-destructive/10"
          >
            Reset local workspace
          </button>
        </Section>
      </div>
    </Overlay>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-3xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="space-y-1 rounded-lg border border-border bg-[var(--surface)] p-3">
        {children}
      </div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}
