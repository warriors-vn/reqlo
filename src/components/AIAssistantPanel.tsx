import { Overlay } from "./Overlay";
import { useStore } from "@/stores/useStore";
import { Sparkles } from "lucide-react";

export function AIAssistantPanel() {
  const open = useStore(s => s.overlays.ai);
  const close = () => useStore.getState().closeOverlay("ai");
  const active = useStore(s => s.getActiveRequest());

  return (
    <Overlay open={open} onClose={close} title="AI Assistant" subtitle="Generate, explain, test" maxW="max-w-xl">
      <div className="space-y-4 text-xs">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-[var(--surface)] p-3">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">Ready when you are</div>
            <p className="mt-0.5 text-muted-foreground">
              Connect an AI provider to generate test scripts, draft documentation, and explain responses.
              {active && <> Current context: <span className="font-mono">{active.method} {active.url || "(no url)"}</span>.</>}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {["Explain response", "Generate test script", "Suggest headers", "Convert to fetch()"].map(label => (
            <button
              key={label}
              disabled
              className="rounded-lg border border-dashed border-border bg-background px-3 py-2 text-left text-[11px] text-muted-foreground opacity-70"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </Overlay>
  );
}
