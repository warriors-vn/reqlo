import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/stores/useStore";
import { Sidebar } from "@/components/Sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { TabBar } from "@/components/TabBar";
import { RequestBuilder } from "@/components/RequestBuilder";
import { ResponseViewer } from "@/components/ResponseViewer";
import { CommandPalette } from "@/components/CommandPalette";
import { ImportCurlModal } from "@/components/ImportCurlModal";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { SettingsModal } from "@/components/SettingsModal";
import { EnvironmentSwitcher } from "@/components/EnvironmentSwitcher";
import { executeRequest } from "@/services/executor";
import { createRequestSnapshot, uid } from "@/services/db";
import { motion, AnimatePresence } from "framer-motion";
import { useCommandSystem } from "@/hooks/useCommandSystem";
import { CodeSnippetPanel } from "@/features/code-snippets/components/CodeSnippetPanel";
import {
  getExecutionResultExcerpt,
  isTextualResponse,
  type ExecutionResult,
} from "@/services/execution";
import { resolveExtractPath, stringifyExtractedValue } from "@/services/extract";
import { evaluateAssertions } from "@/services/assertions";
import type { ApiRequest, Environment } from "@/services/db";
import { toast } from "sonner";

const MAX_HISTORY_RESPONSE_BODY = 40_000;

export function Workspace() {
  const {
    ready,
    init,
    tabs,
    activeTabId,
    requests,
    workspace,
    addHistory,
    sidebarCollapsed,
    toggleSidebar,
    sidebarWidth,
    sendPing,
    environments,
    activeEnvId,
    updateEnvironment,
  } = useStore();
  const [results, setResults] = useState<Record<string, ExecutionResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const lastPing = useRef(0);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const forcedMobileCollapse = useRef(false);
  const sidebarObserverCleanup = useRef<() => void>(() => {});

  // Persist the sidebar's resized width by watching the panel's real box directly.
  // A callback ref (rather than a useEffect keyed on render-time state) fires exactly
  // when React attaches/detaches the panel's DOM node — including the mount that
  // happens once `ready` flips true, which a dependency-array effect would miss.
  const sidebarPanelElRef = useCallback((el: HTMLDivElement | null) => {
    sidebarObserverCleanup.current();
    sidebarObserverCleanup.current = () => {};
    if (!el || typeof ResizeObserver === "undefined") return;
    let timeout: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      clearTimeout(timeout);
      timeout = setTimeout(() => useStore.getState().setSidebarWidth(width), 300);
    });
    observer.observe(el);
    sidebarObserverCleanup.current = () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    init();
  }, [init]);

  // The sidebar's persisted desktop preference shouldn't auto-open an overlay
  // drawer on a phone-sized viewport the first time it's seen.
  useEffect(() => {
    if (isMobile && !sidebarCollapsed && !forcedMobileCollapse.current) {
      forcedMobileCollapse.current = true;
      toggleSidebar();
    }
  }, [isMobile, sidebarCollapsed, toggleSidebar]);

  // Install global command + shortcut system.
  useCommandSystem();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeRequest = activeTab ? requests.find((r) => r.id === activeTab.requestId) : null;
  const activeEnvironment = environments.find((env) => env.id === activeEnvId) ?? null;
  const result = activeRequest ? results[activeRequest.id] : null;
  const isLoading = activeRequest ? loading[activeRequest.id] : false;

  const send = async () => {
    if (!activeRequest || !workspace) return;
    setLoading((s) => ({ ...s, [activeRequest.id]: true }));
    const res = await executeRequest(activeRequest, activeEnvironment);
    const responseExcerpt = getExecutionResultExcerpt(res);
    const responseBody =
      isTextualResponse(res.responseKind) && res.body.length > MAX_HISTORY_RESPONSE_BODY
        ? res.body.slice(0, MAX_HISTORY_RESPONSE_BODY)
        : isTextualResponse(res.responseKind)
          ? res.body
          : "";
    setResults((s) => ({ ...s, [activeRequest.id]: res }));
    setLoading((s) => ({ ...s, [activeRequest.id]: false }));

    if (res.responseKind === "json" && res.body) {
      await applyExtractRules(activeRequest, res.body, activeEnvironment, updateEnvironment);
    }
    reportFailedAssertions(activeRequest, res);
    await addHistory({
      id: uid(),
      workspaceId: workspace.id,
      requestId: activeRequest.id,
      requestName: activeRequest.name,
      method: activeRequest.method,
      url: activeRequest.url,
      status: res.status,
      ok: res.ok,
      durationMs: res.durationMs,
      sizeBytes: res.sizeBytes,
      executedAt: Date.now(),
      environmentId: activeEnvironment?.id ?? null,
      environmentName: activeEnvironment?.name ?? null,
      favorite: false,
      pinned: false,
      snapshot: createRequestSnapshot(activeRequest),
      responseKind: res.responseKind,
      responseContentType: res.contentType,
      responseHeaders: { ...res.headers },
      responseBody,
      responseBodyTruncated:
        isTextualResponse(res.responseKind) && res.body.length > MAX_HISTORY_RESPONSE_BODY,
      searchText: [
        activeRequest.name,
        activeRequest.method,
        activeRequest.url,
        res.status,
        activeEnvironment?.name,
        responseExcerpt,
        res.error,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      errorMessage: res.error,
      responseExcerpt,
    });
  };

  // The "request.send" command bumps sendPing — execute here so we own response state.
  useEffect(() => {
    if (sendPing && sendPing !== lastPing.current) {
      lastPing.current = sendPing;
      void send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendPing]);

  if (!ready) {
    return (
      <div className="grid h-screen place-items-center">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Hydrating local workspace…
        </div>
      </div>
    );
  }

  const mainContent = (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <TabBar />
        <div className="flex min-h-0 flex-1 flex-col">
          <AnimatePresence mode="wait">
            {activeRequest ? (
              <motion.div
                key={activeRequest.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <RequestBuilder
                  request={activeRequest}
                  onSend={send}
                  sending={isLoading}
                  result={result}
                />
                <div className="flex min-h-0 flex-1 flex-col">
                  <ResponseViewer result={result ?? null} loading={isLoading} />
                </div>
              </motion.div>
            ) : (
              <EmptyState key="empty" />
            )}
          </AnimatePresence>
        </div>
      </div>
      <CodeSnippetPanel request={activeRequest} environment={activeEnvironment} />
    </div>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {isMobile && (
        <Sheet open={!sidebarCollapsed} onOpenChange={() => toggleSidebar()}>
          <SheetContent side="left" className="w-72 max-w-[85vw] p-0 sm:max-w-[85vw]">
            <SheetTitle className="sr-only">Sidebar</SheetTitle>
            <Sidebar />
          </SheetContent>
        </Sheet>
      )}
      {!isMobile && !sidebarCollapsed ? (
        <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
          <ResizablePanel
            id="sidebar"
            defaultSize={`${sidebarWidth}px`}
            minSize="220px"
            maxSize="480px"
            elementRef={sidebarPanelElRef}
            className="flex h-full"
          >
            <Sidebar />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="main" minSize="30%" className="flex min-w-0 flex-1">
            {mainContent}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        mainContent
      )}

      {/* Overlays */}
      <CommandPalette />
      <ImportCurlModal />
      <HistoryDrawer />
      <SettingsModal />
      <EnvironmentSwitcher />
    </div>
  );
}

function EmptyState() {
  const { createRequest, collections, openOverlay } = useStore();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
        R
      </div>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Welcome to Reqlo</h1>
        <p className="mt-1 text-xs text-muted-foreground">The modern local-first API workspace.</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => createRequest(collections[0]?.id ?? null)}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
        >
          New request
        </button>
        <button
          onClick={() => openOverlay("palette")}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          Search <kbd className="ml-1 font-mono text-3xs text-muted-foreground">⌘K</kbd>
        </button>
      </div>
    </motion.div>
  );
}

async function applyExtractRules(
  request: ApiRequest,
  responseBody: string,
  environment: Environment | null,
  updateEnvironment: (id: string, patch: { variables: Environment["variables"] }) => Promise<void>,
) {
  const rules = request.extracts.filter(
    (rule) => rule.enabled && rule.path.trim() && rule.variableName.trim(),
  );
  if (!rules.length) return;

  if (!environment) {
    toast.warning("Couldn't save extracted variables", {
      description: "No active environment is selected.",
    });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return;
  }

  const updates: { key: string; value: string }[] = [];
  const failed: string[] = [];
  for (const rule of rules) {
    const result = resolveExtractPath(parsed, rule.path);
    if (result.ok)
      updates.push({ key: rule.variableName.trim(), value: stringifyExtractedValue(result.value) });
    else failed.push(rule.variableName.trim() || rule.path);
  }

  if (updates.length) {
    const nextVariables = [...environment.variables];
    for (const { key, value } of updates) {
      const index = nextVariables.findIndex((item) => item.key === key);
      if (index >= 0) nextVariables[index] = { ...nextVariables[index], value, enabled: true };
      else nextVariables.push({ id: uid(), key, value, enabled: true });
    }
    await updateEnvironment(environment.id, { variables: nextVariables });
  }

  if (failed.length) {
    toast.warning(`Couldn't extract ${failed.length} variable${failed.length > 1 ? "s" : ""}`, {
      description: failed.join(", "),
    });
  }
}

function reportFailedAssertions(request: ApiRequest, result: ExecutionResult) {
  const outcomes = evaluateAssertions(request.assertions, result);
  const failed = outcomes.filter((outcome) => !outcome.passed);
  if (!failed.length) return;

  toast.warning(
    `${failed.length} of ${outcomes.length} test${outcomes.length > 1 ? "s" : ""} failed`,
    {
      description: failed
        .slice(0, 3)
        .map((outcome) => outcome.message)
        .join(" · "),
    },
  );
}
