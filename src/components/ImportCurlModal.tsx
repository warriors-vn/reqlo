import { useState } from "react";
import { Overlay } from "./Overlay";
import { useStore } from "@/stores/useStore";
import { parseCurl } from "@/services/curl";
import { MethodBadge } from "./MethodBadge";

const PLACEHOLDER = `curl -X POST https://api.example.com/v1/items \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer TOKEN' \\
  -d '{"name":"Reqlo"}'`;

export function ImportCurlModal() {
  const open = useStore(s => s.overlays["import-curl"]);
  const close = () => useStore.getState().closeOverlay("import-curl");
  const workspace = useStore(s => s.workspace);
  const importCurl = useStore(s => s.importCurl);

  const [text, setText] = useState("");
  const preview = workspace && text.trim().toLowerCase().startsWith("curl")
    ? parseCurl(text, workspace.id, null)
    : null;

  const submit = async () => {
    const r = await importCurl(text);
    if (r) { setText(""); close(); }
  };

  return (
    <Overlay open={open} onClose={close} title="Import cURL" subtitle="Paste a cURL command" maxW="max-w-2xl">
      <div className="space-y-3">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          className="block h-40 w-full resize-none rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:border-foreground/20"
        />

        {preview && preview.url && (
          <div className="rounded-lg border border-border bg-[var(--surface)] p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Preview</div>
            <div className="flex items-center gap-2 text-xs">
              <MethodBadge method={preview.method} className="w-12 text-right" />
              <span className="truncate font-mono">{preview.url}</span>
            </div>
            {(preview.headers.length > 0 || preview.body) && (
              <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {preview.headers.length > 0 && <div>{preview.headers.length} header{preview.headers.length === 1 ? "" : "s"}</div>}
                {preview.body && <div>Body: {preview.body.length} bytes ({preview.bodyType})</div>}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={close}
            className="rounded-lg border border-border bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!preview?.url}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            Import
          </button>
        </div>
      </div>
    </Overlay>
  );
}
