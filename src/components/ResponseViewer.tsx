import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Copy, Download, ExternalLink, Eye, FileJson2, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatBytes,
  formatResponseKindLabel,
  isTextualResponse,
  type ExecutionResult,
} from "@/services/execution";

type PrimaryTab = "body" | "headers";
type BodyView = "pretty" | "raw" | "preview";

export function ResponseViewer({
  result,
  loading,
}: {
  result: ExecutionResult | null;
  loading: boolean;
}) {
  const [tab, setTab] = useState<PrimaryTab>("body");
  const [bodyView, setBodyView] = useState<BodyView>("pretty");
  const [copied, setCopied] = useState(false);
  const previewUrl = useObjectUrl(result?.blob ?? null);

  const prettyBody = useMemo(() => {
    if (!result) return "";
    if (result.contentType.includes("json")) {
      try {
        return JSON.stringify(JSON.parse(result.body), null, 2);
      } catch {
        return result.body;
      }
    }
    return result.body;
  }, [result]);
  const currentBodyView = useMemo(() => getDefaultBodyView(result), [result]);

  useEffect(() => {
    setBodyView(currentBodyView);
  }, [currentBodyView, result]);

  if (loading && !result) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Sending request…
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        <div className="text-xs font-medium text-foreground/70">No response yet</div>
        <div className="text-[11px] text-muted-foreground">
          Press{" "}
          <kbd className="rounded border border-border bg-[var(--surface)] px-1 font-mono">⌘ ↵</kbd>{" "}
          to send
        </div>
      </div>
    );
  }

  const statusColor = result.error
    ? "text-destructive"
    : result.status && result.status >= 200 && result.status < 300
      ? "text-[var(--status-success)]"
      : result.status && result.status >= 400
        ? "text-destructive"
        : "text-[var(--status-warn)]";
  const headerCount = Object.keys(result.headers).length;
  const copyValue =
    tab === "headers"
      ? JSON.stringify(result.headers, null, 2)
      : bodyView === "pretty"
        ? prettyBody
        : isTextualResponse(result.responseKind)
          ? result.body
          : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-[var(--surface)] px-4 py-3 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <MetaPill
            label="Status"
            value={result.error ? "ERROR" : `${result.status} ${result.statusText}`}
            tone={statusColor}
          />
          <MetaPill label="Time" value={`${result.durationMs.toFixed(0)} ms`} />
          <MetaPill label="Size" value={formatBytes(result.sizeBytes)} />
          <MetaPill
            label="Type"
            value={result.contentType || formatResponseKindLabel(result.responseKind)}
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {result.fileName && (
            <span className="rounded-full border border-border/80 bg-background/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
              {result.fileName}
            </span>
          )}

          <div className="flex items-center gap-1">
            {(["body", "headers"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={cn(
                  "rounded-xl px-2.5 py-1.5 font-medium transition",
                  tab === item
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                {item === "body" ? "Body" : `Headers (${headerCount})`}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={!copyValue}
            onClick={() => {
              if (!copyValue) return;
              void navigator.clipboard.writeText(copyValue);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title={copyValue ? "Copy current view" : "Nothing to copy in this view"}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--status-success)]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => downloadResponse(result)}
            className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
            title="Download response"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          {(result.responseKind === "image" || result.responseKind === "pdf") && previewUrl && (
            <button
              type="button"
              onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
              className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground"
              title="Open preview in a new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as PrimaryTab)}
        className="flex min-h-0 flex-1 flex-col bg-[var(--surface-elevated)]"
      >
        <TabsContent value="body" className="mt-0 flex min-h-0 flex-1 flex-col">
          {result.error ? (
            <div className="p-4">
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {result.error}
              </div>
            </div>
          ) : (
            <>
              {renderBodyViewTabs(result, bodyView, setBodyView)}
              <div className="min-h-0 flex-1">
                {bodyView === "preview" ? (
                  <ResponsePreview result={result} previewUrl={previewUrl} />
                ) : (
                  <ScrollArea className="h-full">
                    <pre className="p-4 font-mono text-[12px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                      {bodyView === "pretty"
                        ? prettyBody || "(empty body)"
                        : result.body || "(empty body)"}
                    </pre>
                  </ScrollArea>
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="headers" className="mt-0 flex min-h-0 flex-1 flex-col">
          <ScrollArea className="h-full">
            {headerCount ? (
              <div className="divide-y divide-border/70">
                {Object.entries(result.headers).map(([key, value]) => (
                  <div
                    key={key}
                    className="grid gap-2 px-4 py-3 font-mono text-[11px] md:grid-cols-[220px_1fr]"
                  >
                    <span className="truncate text-muted-foreground">{key}</span>
                    <span className="break-all text-foreground/90">{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid h-full min-h-[220px] place-items-center p-6 text-center text-sm text-muted-foreground">
                No response headers were captured for this request.
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetaPill({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-2.5 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono font-medium text-foreground/90", tone)}>{value}</span>
    </div>
  );
}

function renderBodyViewTabs(
  result: ExecutionResult,
  bodyView: BodyView,
  setBodyView: (value: BodyView) => void,
) {
  const views = getBodyViews(result);
  if (views.length <= 1) return null;

  return (
    <div className="border-b border-border/70 px-4 py-3">
      <Tabs value={bodyView} onValueChange={(value) => setBodyView(value as BodyView)}>
        <TabsList className="h-10 rounded-xl bg-background/80">
          {views.map((view) => (
            <TabsTrigger key={view.id} value={view.id} className="gap-1 rounded-lg px-3 text-xs">
              {view.icon}
              {view.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

function ResponsePreview({
  result,
  previewUrl,
}: {
  result: ExecutionResult;
  previewUrl: string | null;
}) {
  if (result.responseKind === "html") {
    return (
      <iframe
        title="HTML preview"
        srcDoc={result.body}
        className="h-full w-full border-0 bg-white"
        sandbox="allow-same-origin"
      />
    );
  }

  if (result.responseKind === "image" && previewUrl) {
    return (
      <ScrollArea className="h-full">
        <div className="flex min-h-full items-start justify-center p-6">
          <img
            src={previewUrl}
            alt="Response preview"
            className="max-h-[70vh] max-w-full rounded-2xl border border-border/70 bg-background shadow-sm"
          />
        </div>
      </ScrollArea>
    );
  }

  if (result.responseKind === "pdf" && previewUrl) {
    return (
      <iframe
        title="PDF preview"
        src={previewUrl}
        className="h-full w-full border-0 bg-background"
      />
    );
  }

  return (
    <div className="grid h-full min-h-[260px] place-items-center p-6">
      <div className="max-w-md rounded-[24px] border border-dashed border-border bg-background/70 px-5 py-6 text-center">
        <div className="text-sm font-semibold tracking-tight">Preview unavailable</div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This response type does not support inline preview yet. Use download to inspect the full
          payload.
        </p>
        <div className="mt-3 text-[11px] font-mono text-muted-foreground">
          {formatResponseKindLabel(result.responseKind)} · {formatBytes(result.sizeBytes)}
        </div>
      </div>
    </div>
  );
}

function getBodyViews(result: ExecutionResult) {
  const views: Array<{ id: BodyView; label: string; icon: React.ReactNode }> = [];

  if (result.responseKind === "json") {
    views.push({ id: "pretty", label: "Pretty", icon: <FileJson2 className="h-3.5 w-3.5" /> });
    views.push({ id: "raw", label: "Raw", icon: <FileText className="h-3.5 w-3.5" /> });
    return views;
  }

  if (result.responseKind === "html") {
    views.push({ id: "preview", label: "Preview", icon: <Eye className="h-3.5 w-3.5" /> });
    views.push({ id: "raw", label: "Raw", icon: <FileText className="h-3.5 w-3.5" /> });
    return views;
  }

  if (result.responseKind === "image" || result.responseKind === "pdf") {
    views.push({ id: "preview", label: "Preview", icon: <Eye className="h-3.5 w-3.5" /> });
    return views;
  }

  if (result.responseKind === "binary") {
    views.push({ id: "preview", label: "Summary", icon: <Eye className="h-3.5 w-3.5" /> });
    return views;
  }

  views.push({ id: "raw", label: "Raw", icon: <FileText className="h-3.5 w-3.5" /> });
  return views;
}

function getDefaultBodyView(result: ExecutionResult | null): BodyView {
  if (!result) return "pretty";
  if (result.responseKind === "json") return "pretty";
  if (result.responseKind === "text") return "raw";
  return "preview";
}

function downloadResponse(result: ExecutionResult) {
  const blob = result.blob ?? new Blob([result.body], { type: result.contentType || "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName ?? buildFallbackFilename(result);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildFallbackFilename(result: ExecutionResult) {
  const extension =
    result.responseKind === "json"
      ? "json"
      : result.responseKind === "html"
        ? "html"
        : result.responseKind === "text"
          ? "txt"
          : result.responseKind === "image"
            ? inferImageExtension(result.contentType)
            : result.responseKind === "pdf"
              ? "pdf"
              : "bin";
  return `response.${extension}`;
}

function inferImageExtension(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("svg")) return "svg";
  return "img";
}

function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return url;
}
