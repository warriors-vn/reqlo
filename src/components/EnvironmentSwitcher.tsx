import { Overlay } from "./Overlay";
import { useStore } from "@/stores/useStore";
import { Check, Globe, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function EnvironmentSwitcher() {
  const open = useStore(s => s.overlays["env-switcher"]);
  const close = () => useStore.getState().closeOverlay("env-switcher");
  const envs = useStore(s => s.environments);
  const active = useStore(s => s.activeEnvId);
  const setActive = useStore(s => s.setActiveEnv);
  const create = useStore(s => s.createEnvironment);

  return (
    <Overlay open={open} onClose={close} title="Switch Environment" maxW="max-w-md">
      <div className="space-y-1">
        {envs.map(e => (
          <button
            key={e.id}
            onClick={() => { setActive(e.id); close(); }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs transition",
              active === e.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
            )}
          >
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{e.name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{e.variables.length} vars</span>
            {active === e.id && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
        ))}
        {envs.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">No environments yet.</div>
        )}
        <button
          onClick={async () => {
            const n = prompt("Environment name");
            if (n) { const e = await create(n); setActive(e.id); close(); }
          }}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2.5 py-2 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> New environment
        </button>
      </div>
    </Overlay>
  );
}
