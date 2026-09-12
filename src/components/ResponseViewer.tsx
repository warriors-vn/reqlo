import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/features/code-snippets/utils/clipboard";
import { Check, Copy, Download, ExternalLink, Save } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/stores/useStore";
import { createDefaultMock, type ApiRequest } from "@/services/db";
import {
  formatBytes,
  formatResponseKindLabel,
  isTextualResponse,
  type ExecutionResult,
} from "@/services/execution";
import {
  MAX_RESPONSE_RENDER_LENGTH,
  buildPrettyBody,
  isTooLargeToParse,
  truncateForRender,
} from "@/lib/response-body-view";
import { buildMockFromResponse } from "@/services/mock-from-response";
import { LazyConfirmDeleteDialog as ConfirmDeleteDialog } from "@/components/LazyConfirmDeleteDialog";
import { MetaPill } from "./response-viewer/MetaPill";
import { ResponsePreview } from "./response-viewer/ResponsePreview";
import { SseEventList } from "./response-viewer/SseEventList";
import { downloadResponse } from "./response-viewer/download-response";
import { getDefaultBodyView, renderBodyViewTabs } from "./response-viewer/body-views";
import { useObjectUrl } from "./response-viewer/useObjectUrl";
import type { BodyView } from "./response-viewer/types";

type PrimaryTab = "body" | "headers";

/** Live progress for an in-flight send, before a final `ExecutionResult`
 * exists — see `ExecuteRequestOptions.onStreamChunk`. `contentType` decides
 * whether the partial text renders as parsed SSE frames or plain text. */
export interface StreamingProgress {
  text: string;
  contentType: string;
}

export function ResponseViewer({
  result,
  loading,
  request = null,
  streaming = null,
}: {
  result: ExecutionResult | null;
  loading: boolean;
  /** The request this response belongs to — enables "Save as mock". Omitted
   * (or null) simply hides that action, e.g. if this viewer is ever reused
   * somewhere without an owning request. */
  request?: ApiRequest | null;
  /** Live progress for the current send, whenever `loading` is true —
   * whether or not `result` still holds an older, unrelated response from
   * this same request's *previous* send. Fresh incoming data always wins
   * over a stale old result once there's any to show. */
  streaming?: StreamingProgress | null;
}) {
  const updateRequest = useStore((state) => state.updateRequest);
  const [tab, setTab] = useState<PrimaryTab>("body");
  const [bodyView, setBodyView] = useState<BodyView>("pretty");
  const [copied, setCopied] = useState(false);
  const [pendingMockOverwrite, setPendingMockOverwrite] = useState(false);
  const previewUrl = useObjectUrl(result?.blob ?? null);

  const prettyBody = useMemo(
    () => (result ? buildPrettyBody(result.body, result.contentType) : ""),
    [result],
  );
  const currentBodyView = useMemo(() => getDefaultBodyView(result), [result]);
  const renderableBody = useMemo(() => {
    if (bodyView === "preview") return { text: "", truncated: false, totalLength: 0 };
    return truncateForRender(bodyView === "pretty" ? prettyBody : (result?.body ?? ""));
  }, [bodyView, prettyBody, result]);

  useEffect(() => {
    setBodyView(currentBodyView);
  }, [currentBodyView, result]);

  if (loading) {
    if (streaming?.text) {
      const isEventStream = streaming.contentType.toLowerCase().includes("text/event-stream");
      const live = truncateForRender(streaming.text);
      return (
        <div className="flex h-full flex-col">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 border-b border-border bg-[var(--surface)] px-4 py-2 text-2xs text-muted-foreground"
          >
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Streaming… {live.totalLength.toLocaleString()} characters so far
          </div>
          <ScrollArea className="h-full">
            {isEventStream ? (
              <SseEventList text={live.text} />
            ) : (
              <pre className="p-4 font-mono text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                {live.text}
              </pre>
            )}
          </ScrollArea>
        </div>
      );
    }
    // No streaming data yet — for a request's very first send there's
    // nothing else to show, so say so. A *re*-send of the same request
    // instead falls through and keeps showing its previous result below,
    // rather than blanking to a spinner over data the user was just
    // looking at, right up until either streaming data or the new result
    // itself is ready to replace it.
    if (!result) {
      return (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-1 items-center justify-center text-xs text-muted-foreground"
        >
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Sending request…
          </div>
        </div>
      );
    }
  }

  if (!result) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        <div className="text-xs font-medium text-foreground/70">No response yet</div>
        <div className="text-2xs text-muted-foreground">
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

  const mockEligibility = request
    ? buildMockFromResponse({
        status: result.status,
        contentType: result.contentType,
        body: result.body,
        responseKind: result.responseKind,
        truncated: isTooLargeToParse(result.body),
        hasError: Boolean(result.error),
      })
    : { ok: false as const, reason: "No active request to save this response into." };

  const applyMockSave = () => {
    if (!request || !mockEligibility.ok) return;
    void updateRequest(request.id, { mock: { ...request.mock, ...mockEligibility.mock } });
    toast.success(`Saved as mock for "${request.name || "this request"}"`, {
      description: request.mock.enabled
        ? "Mock is already on — Send will return this."
        : "Open the Mock tab to turn mocking on.",
    });
  };

  const saveAsMock = () => {
    if (!request || !mockEligibility.ok) return;
    // Every request starts with a placeholder mock body ("{\n  \n}",
    // createDefaultMock's default) whether or not anyone ever opened the
    // Mock tab — comparing against just "is it non-empty" would confirm on
    // literally every request's very first save, which isn't a real
    // overwrite. Only prompt once there's an actual saved mock to lose.
    const hasCustomMockBody =
      request.mock.body.trim() && request.mock.body !== createDefaultMock().body;
    if (hasCustomMockBody) {
      setPendingMockOverwrite(true);
      return;
    }
    applyMockSave();
  };

  return (
    <div className="flex h-full flex-col">
      {/* A re-send with no streaming data (yet, or ever — e.g. a binary
          response never populates `streaming`) would otherwise show zero
          indication a new request is in flight, since the block above keeps
          the previous result on screen rather than blanking to a spinner. */}
      {loading && !streaming?.text && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 border-b border-border bg-[var(--surface)] px-4 py-1.5 text-2xs text-muted-foreground"
        >
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Sending…
        </div>
      )}
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as PrimaryTab)}
        className="flex h-full min-h-0 flex-1 flex-col"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-[var(--surface)] px-4 py-3 text-2xs">
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
            {result.mocked && (
              <span className="inline-flex items-center rounded-full border border-[var(--status-warn)]/40 bg-[var(--status-warn)]/10 px-2.5 py-1 font-semibold uppercase tracking-wide text-[var(--status-warn)]">
                Mocked
              </span>
            )}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {result.fileName && (
              <span className="rounded-full border border-border/80 bg-background/60 px-2.5 py-1 font-mono text-3xs text-muted-foreground">
                {result.fileName}
              </span>
            )}

            <TabsList className="h-auto gap-1 rounded-xl bg-transparent p-0">
              {(["body", "headers"] as const).map((item) => (
                <TabsTrigger
                  key={item}
                  value={item}
                  className="rounded-xl bg-transparent px-2.5 py-1.5 font-medium text-muted-foreground shadow-none data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {item === "body" ? "Body" : `Headers (${headerCount})`}
                </TabsTrigger>
              ))}
            </TabsList>

            <button
              type="button"
              disabled={!copyValue}
              onClick={() => {
                if (!copyValue) return;
                void copyTextToClipboard(copyValue);
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
            <button
              type="button"
              disabled={!mockEligibility.ok}
              onClick={saveAsMock}
              className="grid h-8 w-8 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title={
                mockEligibility.ok
                  ? "Save this response as the request's mock"
                  : mockEligibility.reason
              }
            >
              <Save className="h-3.5 w-3.5" />
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

        <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface-elevated)]">
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
                      {renderableBody.truncated && (
                        <div className="border-b border-border/70 bg-[var(--status-warn)]/10 px-4 py-2 text-2xs text-muted-foreground">
                          Showing the first {MAX_RESPONSE_RENDER_LENGTH.toLocaleString()} of{" "}
                          {renderableBody.totalLength.toLocaleString()} characters — download the
                          response to see the rest.
                        </div>
                      )}
                      {bodyView === "pretty" && result.responseKind === "stream" ? (
                        <SseEventList text={renderableBody.text} />
                      ) : (
                        <pre className="p-4 font-mono text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                          {renderableBody.text || "(empty body)"}
                        </pre>
                      )}
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
                      className="grid gap-2 px-4 py-3 font-mono text-2xs md:grid-cols-[220px_1fr]"
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
        </div>
      </Tabs>

      <ConfirmDeleteDialog
        open={pendingMockOverwrite}
        onOpenChange={setPendingMockOverwrite}
        title="Replace mock body?"
        description={`"${request?.name || "This request"}"'s current mock body will be replaced with this response. This can't be undone.`}
        confirmLabel="Replace"
        onConfirm={() => {
          applyMockSave();
          setPendingMockOverwrite(false);
        }}
      />
    </div>
  );
}
