import { Overlay } from "./Overlay";
import { useStore } from "@/stores/useStore";
import { IS_MAC } from "@/core/commands/shortcuts";

export function SettingsModal() {
  const open = useStore(s => s.overlays.settings);
  const close = () => useStore.getState().closeOverlay("settings");
  const workspace = useStore(s => s.workspace);
  const collections = useStore(s => s.collections);
  const requests = useStore(s => s.requests);
  const environments = useStore(s => s.environments);

  return (
    <Overlay open={open} onClose={close} title="Settings" subtitle="Reqlo workspace preferences">
      <div className="space-y-5 text-xs">
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

        <Section label="Danger zone">
          <button
            onClick={() => {
              if (!confirm("Erase all local data? This cannot be undone.")) return;
              indexedDB.deleteDatabase("reqlo");
              localStorage.removeItem("reqlo:session");
              localStorage.removeItem("reqlo:recent-commands");
              window.location.reload();
            }}
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[11px] font-medium text-destructive hover:bg-destructive/10"
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
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="space-y-1 rounded-lg border border-border bg-[var(--surface)] p-3">{children}</div>
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
