import { useEffect, useState } from "react";
import { Overlay } from "./Overlay";
import { useStore } from "@/stores/useStore";

/** Renders text-input prompts requested imperatively via requestPrompt() — the
 * styled replacement for window.prompt() used by command-palette actions that
 * have no owning component of their own to hold dialog state. */
export function PromptDialog() {
  const request = useStore((s) => s.promptRequest);
  const resolvePrompt = useStore((s) => s.resolvePrompt);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (request) setValue(request.defaultValue);
  }, [request]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    resolvePrompt(trimmed);
  };

  return (
    <Overlay
      open={request !== null}
      onClose={() => resolvePrompt(null)}
      title={request?.title ?? ""}
    >
      <div className="space-y-3">
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/20"
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => resolvePrompt(null)}
            className="rounded-lg border border-border bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {request?.confirmLabel ?? "Save"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
