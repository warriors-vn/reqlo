import { cn } from "@/lib/utils";
import type { ApiRequest } from "@/services/db";
import type { ResolvedRequestArtifacts } from "@/features/code-snippets/utils/request-resolver";

interface Props {
  viewingGlobals: boolean;
  activeRequest: ApiRequest | null;
  preview: ResolvedRequestArtifacts | null;
  activeAuthPreview: string | null;
  redactedResolvedUrl: string;
  templateTokens: string[];
}

/** The right-hand half: how the active request resolves under the current selection, and which {{TEMPLATE_KEYS}} it references. */
export function RequestPreviewPanel({
  viewingGlobals,
  activeRequest,
  preview,
  activeAuthPreview,
  redactedResolvedUrl,
  templateTokens,
}: Props) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-[28px] border border-border/80 bg-background/70 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold tracking-tight">Active request preview</div>
            <div className="text-2xs text-muted-foreground">
              {viewingGlobals
                ? "See how globals alone resolve the current request."
                : "See how the selected environment (plus globals) resolves the current request."}
            </div>
          </div>
          <span className="rounded-full bg-background px-2.5 py-1 text-3xs font-medium text-muted-foreground">
            {activeRequest ? activeRequest.name || "Untitled request" : "No request selected"}
          </span>
        </div>

        {activeRequest && preview ? (
          <div className="mt-4 space-y-3">
            <PreviewRow label="Resolved URL" value={redactedResolvedUrl || "—"} />
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
            Open a request tab to preview how environment variables affect the final URL, auth,
            headers, and query params.
          </div>
        )}
      </div>

      <div className="rounded-[28px] border border-border/80 bg-background/70 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
        <div>
          <div className="text-sm font-semibold tracking-tight">Detected template keys</div>
          <div className="text-2xs text-muted-foreground">
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
                    "rounded-full border px-2.5 py-1 text-3xs font-medium uppercase tracking-[0.14em]",
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
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-border/70 bg-background/70 px-3 py-2 md:grid-cols-[96px_1fr]">
      <span className="text-2xs font-medium text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-2xs text-foreground/90">{value}</span>
    </div>
  );
}
