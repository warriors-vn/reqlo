import { useStore } from "@/stores/useStore";
import { type ApiRequest, type HttpMethod } from "@/services/db";
import type { ExecutionResult } from "@/services/execution";
import { parseCurl } from "@/services/curl";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AdvancedBodyEditor } from "@/features/request-body/components/AdvancedBodyEditor";
import { RequestAuthEditor } from "@/components/RequestAuthEditor";
import { useRequestAncestors } from "@/hooks/useRequestAncestors";
import { inheritedContributions } from "@/services/inheritance";
import { RequestExtractEditor } from "@/components/RequestExtractEditor";
import { RequestAssertionEditor } from "@/components/RequestAssertionEditor";
import { RequestMockEditor } from "@/components/RequestMockEditor";
import { RequestScriptEditor } from "@/components/RequestScriptEditor";
import { RequestWebSocketEditor } from "@/components/RequestWebSocketEditor";
import { TemplateInput } from "@/components/TemplateInput";
import { evaluateAssertions } from "@/services/assertions";
import { hasBodyContent } from "@/features/request-body/utils/body";
import { Send, Square, ChevronDown, Plug, Unplug } from "lucide-react";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TimeoutControl } from "@/components/request-builder/TimeoutControl";
import {
  WebSocketHeadersNotice,
  WebSocketAuthNotice,
} from "@/components/request-builder/WebSocketNotices";
import { InheritedRows } from "@/components/request-builder/InheritedRows";
import { KVEditor } from "@/components/request-builder/KVEditor";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const METHOD_BG: Record<HttpMethod, string> = {
  GET: "bg-[var(--method-get)]",
  POST: "bg-[var(--method-post)]",
  PUT: "bg-[var(--method-put)]",
  PATCH: "bg-[var(--method-patch)]",
  DELETE: "bg-[var(--method-delete)]",
  HEAD: "bg-muted-foreground",
  OPTIONS: "bg-muted-foreground",
};

interface Props {
  request: ApiRequest;
  onSend: () => void;
  onCancel: () => void;
  sending: boolean;
  result?: ExecutionResult | null;
}

export function RequestBuilder({ request, onSend, onCancel, sending, result = null }: Props) {
  const updateRequest = useStore((s) => s.updateRequest);
  const renameRequest = useStore((s) => s.renameRequest);
  const applyCurlToRequest = useStore((s) => s.applyCurlToRequest);
  const [tab, setTab] = useState<
    "params" | "headers" | "body" | "auth" | "script" | "extract" | "tests" | "mock" | "message"
  >("params");
  const [nameEdit, setNameEdit] = useState(false);
  // Lives in the store (persisted, like sidebarCollapsed) rather than local
  // state: this component remounts on every request switch (Workspace.tsx
  // keys it by activeRequest.id), so local state would forget the collapsed
  // choice the moment the user opened a different request.
  const panelCollapsed = useStore((s) => s.requestPanelCollapsed);
  const toggleRequestPanel = useStore((s) => s.toggleRequestPanel);
  const setRequestPanelCollapsed = useStore((s) => s.setRequestPanelCollapsed);

  const isWebSocket = request.protocol === "websocket";
  const wsStatus = useStore((s) => s.wsSessions[request.id]?.status) ?? "idle";
  const connectWebSocket = useStore((s) => s.connectWebSocket);
  const disconnectWebSocket = useStore((s) => s.disconnectWebSocket);
  const wsConnected = wsStatus === "open" || wsStatus === "connecting";

  const ancestors = useRequestAncestors(request);
  const inherited = inheritedContributions(ancestors);
  // The badge counts both kinds of check together — a declarative rule and a
  // script test both answer "did this response pass?", and splitting them into
  // two numbers would just make the tab harder to read.
  const assertionOutcomes = evaluateAssertions(request.assertions, result);
  const scriptTests = result?.scriptTests ?? [];
  const ranTotal = assertionOutcomes.length + scriptTests.length;
  const ranPassed =
    assertionOutcomes.filter((o) => o.passed).length + scriptTests.filter((t) => t.passed).length;
  const testsCount =
    request.assertions.filter((rule) => rule.enabled).length +
    (request.postResponseScript.enabled && request.postResponseScript.source.trim() ? 1 : 0);
  const testsBadge = ranTotal ? (`${ranPassed}/${ranTotal}` as const) : testsCount || undefined;

  const allTabs = [
    {
      id: "params" as const,
      label: "Params",
      count: request.queryParams.filter((p) => p.enabled).length || undefined,
    },
    {
      id: "headers" as const,
      label: "Headers",
      count: request.headers.filter((h) => h.enabled).length || undefined,
    },
    {
      id: "body" as const,
      label: "Body",
      count: hasBodyContent(request) ? ("•" as const) : undefined,
    },
    {
      id: "auth" as const,
      label: "Auth",
      count: request.auth.type !== "none" ? request.auth.type.toUpperCase() : undefined,
    },
    {
      id: "script" as const,
      label: "Script",
      count: request.preRequestScript.enabled ? ("ON" as const) : undefined,
    },
    {
      id: "extract" as const,
      label: "Extract",
      count: request.extracts.filter((rule) => rule.enabled).length || undefined,
    },
    {
      id: "tests" as const,
      label: "Tests",
      count: testsBadge,
    },
    {
      id: "mock" as const,
      label: "Mock",
      count: request.mock.enabled ? ("ON" as const) : undefined,
    },
    {
      id: "message" as const,
      label: "Message",
      count: request.websocket.messageDrafts.length || undefined,
    },
  ];

  // A WebSocket has no request body, nothing to extract from or assert against
  // a single response, and no mock — those tabs would be controls that do
  // nothing. Headers stays, because what it has to say (a browser won't let a
  // page set them on a handshake) is exactly what someone looking for it needs
  // to read.
  const WEBSOCKET_TABS = ["params", "message", "auth", "headers"];
  const tabs = isWebSocket
    ? WEBSOCKET_TABS.map((id) => allTabs.find((item) => item.id === id)!)
    : allTabs.filter((item) => item.id !== "message");

  // Switching a request's protocol can strand the open tab on one that no
  // longer exists, which renders an empty panel with the strip still
  // highlighting it.
  const activeTab = tabs.some((item) => item.id === tab) ? tab : "params";

  return (
    <div className="flex flex-col border-b border-border bg-[var(--surface-elevated)]">
      {/* Title row */}
      <div className="flex items-center gap-2 px-4 pt-3">
        {nameEdit ? (
          <input
            autoFocus
            defaultValue={request.name}
            onBlur={(e) => {
              renameRequest(request.id, e.target.value || "Untitled");
              setNameEdit(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setNameEdit(false);
            }}
            className="w-full max-w-md rounded-md border border-border bg-background px-2 py-0.5 text-sm font-medium focus-ring outline-none"
          />
        ) : (
          // min-w-0 + truncate + text-left: a long name would otherwise span
          // the full width, wrap to two centre-aligned lines (button's own
          // default alignment) and push the URL row down — the sidebar, tab
          // bar and snippet header all truncate the same name instead.
          <button
            onClick={() => setNameEdit(true)}
            title={request.name || "Untitled request"}
            className="min-w-0 max-w-full truncate rounded px-1 py-0.5 text-left text-sm font-medium hover:bg-accent"
          >
            {request.name || "Untitled request"}
          </button>
        )}
      </div>

      {/* URL row */}
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex flex-1 items-stretch overflow-hidden rounded-lg border border-border bg-background shadow-sm focus-within:border-foreground/20 focus-within:shadow">
          {isWebSocket ? (
            // No method selector: a WebSocket handshake is always a GET, so a
            // dropdown here would offer choices that change nothing.
            <div className="relative flex items-center">
              <span
                className="h-9 select-none px-3 pt-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary"
                title="WebSocket — the handshake is always a GET"
              >
                WS
              </span>
              <div className="pointer-events-none absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary opacity-80" />
            </div>
          ) : (
            <div className="relative">
              <select
                value={request.method}
                onChange={(e) =>
                  updateRequest(request.id, { method: e.target.value as HttpMethod })
                }
                aria-label="HTTP method"
                className="h-9 cursor-pointer appearance-none bg-transparent pl-3 pr-7 font-mono text-xs font-semibold uppercase tracking-wider outline-none"
                style={{ color: `var(--method-${request.method.toLowerCase()})` }}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <div
                className={cn(
                  "pointer-events-none absolute bottom-0 left-2 right-2 h-[2px] rounded-full opacity-80",
                  METHOD_BG[request.method],
                )}
              />
            </div>
          )}
          <div className="w-px bg-border" />
          <TemplateInput
            type="text"
            value={request.url}
            onChange={(url) => updateRequest(request.id, { url })}
            placeholder={
              isWebSocket ? "wss://example.com/socket" : "https://api.example.com/endpoint"
            }
            aria-label="Request URL"
            spellCheck={false}
            onKeyDown={(e) => {
              if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return;
              if (!isWebSocket) {
                onSend();
              } else if (wsConnected) {
                disconnectWebSocket(request.id);
              } else {
                connectWebSocket(request.id);
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              // Same gate ImportCurlModal already uses to decide whether to
              // show its own preview — a plain URL paste falls through to
              // the input's normal default behavior untouched.
              if (!text.trim().toLowerCase().startsWith("curl")) return;
              const parsed = parseCurl(text, request.workspaceId, request.collectionId);
              if (!parsed.url) return;
              e.preventDefault();
              void applyCurlToRequest(request.id, text);
            }}
            className="h-9 flex-1 bg-transparent px-3 font-mono text-xs outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        {!isWebSocket && request.mock.enabled && (
          <span
            className="flex h-9 shrink-0 items-center rounded-lg border border-[var(--status-warn)]/40 bg-[var(--status-warn)]/10 px-2.5 text-2xs font-semibold uppercase tracking-wide text-[var(--status-warn)]"
            title="Send returns the saved mock response instead of calling the network"
          >
            Mocked
          </span>
        )}
        {/* A WebSocket connection stays open until it's closed — there is no
            single exchange for a send timeout to bound. */}
        {!isWebSocket && (
          <TimeoutControl
            timeoutMs={request.timeoutMs}
            onChange={(timeoutMs) => void updateRequest(request.id, { timeoutMs })}
          />
        )}
        {isWebSocket ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() =>
              wsConnected ? disconnectWebSocket(request.id) : connectWebSocket(request.id)
            }
            disabled={!wsConnected && !request.url}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold shadow-sm transition disabled:opacity-50 focus-ring",
              wsConnected
                ? "bg-destructive text-destructive-foreground hover:opacity-90"
                : "bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            {wsConnected ? <Unplug className="h-3.5 w-3.5" /> : <Plug className="h-3.5 w-3.5" />}
            {wsStatus === "connecting" ? "Connecting…" : wsConnected ? "Disconnect" : "Connect"}
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={sending ? onCancel : onSend}
            disabled={!sending && !request.url}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold shadow-sm transition disabled:opacity-50 focus-ring",
              sending
                ? "bg-destructive text-destructive-foreground hover:opacity-90"
                : "bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            {sending ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {sending ? "Cancel" : "Send"}
          </motion.button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setTab(value as typeof tab)}>
        {/* Tab strip */}
        <div className="flex items-center gap-1 border-b border-border px-3">
          <TabsList
            className="h-9 gap-1 rounded-none bg-transparent p-0"
            // Clicking a tab is a request to see its content — if the panel
            // is collapsed, expand it too, rather than just moving the
            // underline over a panel that stays hidden. Handled here (not in
            // onValueChange above) so re-clicking the tab that's already
            // active still expands it, since Radix only fires onValueChange
            // on an actual value change.
            onClick={() => {
              if (panelCollapsed) setRequestPanelCollapsed(false);
            }}
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="relative h-9 rounded-none bg-transparent px-2.5 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="ml-1 text-3xs text-muted-foreground">{t.count}</span>
                )}
                {activeTab === t.id && (
                  <motion.div
                    layoutId="reqtab"
                    className="absolute -bottom-px left-1 right-1 h-[2px] rounded-full bg-primary"
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <button
            onClick={toggleRequestPanel}
            aria-expanded={!panelCollapsed}
            className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-ring"
            title={
              panelCollapsed
                ? "Expand request panel"
                : "Collapse request panel — more room for the response"
            }
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", panelCollapsed && "-rotate-180")}
            />
          </button>
        </div>

        {/* Panel */}
        {!panelCollapsed && (
          <div className="max-h-[40vh] min-h-[140px] overflow-auto px-4 py-3">
            <TabsContent value="params" className="mt-0 space-y-2">
              <InheritedRows rows={inherited.queryParams} kind="query param" />
              <KVEditor
                list={request.queryParams}
                onChange={(queryParams) => updateRequest(request.id, { queryParams })}
                placeholder={["key", "value"]}
              />
            </TabsContent>
            <TabsContent value="headers" className="mt-0 space-y-2">
              {isWebSocket ? (
                <WebSocketHeadersNotice />
              ) : (
                <>
                  <InheritedRows rows={inherited.headers} kind="header" />
                  <KVEditor
                    list={request.headers}
                    onChange={(headers) => updateRequest(request.id, { headers })}
                    placeholder={["Header", "Value"]}
                  />
                </>
              )}
            </TabsContent>
            <TabsContent value="message" className="mt-0">
              <RequestWebSocketEditor request={request} />
            </TabsContent>
            <TabsContent value="body" className="mt-0">
              <AdvancedBodyEditor request={request} />
            </TabsContent>
            <TabsContent value="auth" className="mt-0 space-y-2">
              {isWebSocket && <WebSocketAuthNotice />}
              <RequestAuthEditor request={request} />
            </TabsContent>
            <TabsContent value="script" className="mt-0">
              <RequestScriptEditor request={request} />
            </TabsContent>
            <TabsContent value="extract" className="mt-0">
              <RequestExtractEditor request={request} result={result} />
            </TabsContent>
            <TabsContent value="tests" className="mt-0">
              <RequestAssertionEditor request={request} result={result} />
            </TabsContent>
            <TabsContent value="mock" className="mt-0">
              <RequestMockEditor request={request} />
            </TabsContent>
          </div>
        )}
      </Tabs>
    </div>
  );
}
