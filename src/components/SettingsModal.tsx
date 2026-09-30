import { useEffect, useState } from "react";
import { Overlay } from "./Overlay";
import { pickFile, useStore } from "@/stores/useStore";
import { IS_MAC } from "@/core/commands/shortcuts";
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { getStorageStatus, type StorageStatus } from "@/services/db";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function SettingsModal() {
  const open = useStore((s) => s.overlays.settings);
  const close = () => useStore.getState().closeOverlay("settings");
  const workspace = useStore((s) => s.workspace);
  const collections = useStore((s) => s.collections);
  const requests = useStore((s) => s.requests);
  const environments = useStore((s) => s.environments);
  const exportActiveWorkspace = useStore((s) => s.exportActiveWorkspace);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  // SettingsModal stays mounted (Overlay only hides it), and the theme can also
  // change via the command palette while this is closed — resync on every open.
  useEffect(() => {
    if (open) setTheme(getStoredTheme());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getStorageStatus().then((status) => {
      if (!cancelled) setStorage(status);
    });
    return () => {
      cancelled = true;
    };
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
          <Row k="Persistence" v={describeStorage(storage)} />
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
              onClick={() => void useStore.getState().restoreWorkspaceBackup()}
              className="rounded-lg border border-border px-3 py-1.5 text-2xs font-medium text-foreground hover:bg-accent"
            >
              Restore workspace backup
            </button>
            <p className="text-2xs leading-5 text-muted-foreground">
              Export creates a backup file, leaving out tokens, passwords and keys typed directly
              into requests. Restore replaces the current workspace, including requests,
              environments, and history, and keeps a copy you can undo.
            </p>
            {storage?.persistent === false && (
              <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-2xs leading-5 text-muted-foreground">
                Your browser hasn't promised to keep this data. Export a backup now and then — it's
                the only copy until you do.
              </p>
            )}
          </div>
        </Section>

        <Section label="Danger zone">
          <button
            onClick={async () => {
              const confirmed = await useStore.getState().requestConfirm({
                title: "Erase all local data?",
                description:
                  "Every collection, request, environment and history entry on this device is deleted. This cannot be undone.",
                confirmLabel: "Erase everything",
              });
              if (!confirmed) return;
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
function describeStorage(status: StorageStatus | null): string {
  if (!status) return "Checking…";
  if (status.persistent === true) return "Protected from eviction";
  if (status.persistent === false) return "Browser may clear it";
  return "Unknown";
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}
