import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useStore } from "@/stores/useStore";
import { Sidebar } from "@/components/Sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { TabBar } from "@/components/TabBar";
import { RequestBuilder } from "@/components/RequestBuilder";
import { ResponseViewer, type StreamingProgress } from "@/components/ResponseViewer";
import { LazyCommandPalette } from "@/components/LazyCommandPalette";
import { LazyImportCurlModal } from "@/components/LazyImportCurlModal";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { LazySettingsModal } from "@/components/LazySettingsModal";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { LazyEnvironmentSwitcher } from "@/components/LazyEnvironmentSwitcher";
import { LazyCollectionRunnerModal } from "@/components/LazyCollectionRunnerModal";
import { LazyCollectionSettingsModal } from "@/components/LazyCollectionSettingsModal";
import { LazyPromptDialog } from "@/components/LazyPromptDialog";
import { LazyGlobalConfirmDialog } from "@/components/LazyGlobalConfirmDialog";
import { runSingleRequest } from "@/services/runner";
import { motion, AnimatePresence } from "framer-motion";
import { useCommandSystem } from "@/hooks/useCommandSystem";
import { CodeSnippetPanel } from "@/features/code-snippets/components/CodeSnippetPanel";
import { mergeGlobalsIntoEnvironment } from "@/features/code-snippets/utils/request-resolver";
import type { ExecutionResult } from "@/services/execution";
import { pruneStaleKeys } from "@/lib/prune-stale-keys";
import { toast } from "sonner";

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
    updateRequest,
    getRequestAncestors,
  } = useStore();
  const [results, setResults] = useState<Record<string, ExecutionResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [streamingByRequest, setStreamingByRequest] = useState<Record<string, StreamingProgress>>(
    {},
  );
  const controllersRef = useRef<Record<string, AbortController>>({});
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

  // Drop results/loading entries once their tab closes — deleteRequest
  // already closes any tab pointing at the deleted request, so `tabs` alone
  // covers both cases the fix asked for. Nothing ever reads a result for a
  // request with no open tab, so this is a pure memory bound, not a behavior
  // change — each result (and its response Blob) would otherwise be held for
  // the rest of the session.
  useEffect(() => {
    const openIds = new Set(tabs.map((t) => t.requestId));
    setResults((prev) => pruneStaleKeys(prev, openIds));
    setStreamingByRequest((prev) => pruneStaleKeys(prev, openIds));
    setLoading((prev) => {
      // Don't drop a request that's still actively sending just because its
      // tab closed — send()'s own completion handler is what cleans that up
      // (and skips writing the result back in if the tab is still gone by
      // then). Clearing the flag early here would hide an in-flight send
      // from `isLoading`, so reopening the same request mid-flight would
      // show "Send" instead of "Cancel" and let a second, uncancellable send
      // race the first.
      const keepIds = new Set(openIds);
      for (const [id, isLoading] of Object.entries(prev)) {
        if (isLoading) keepIds.add(id);
      }
      return pruneStaleKeys(prev, keepIds);
    });
  }, [tabs]);

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
  const rawActiveEnvironment = environments.find((env) => env.id === activeEnvId) ?? null;
  const activeEnvironment = mergeGlobalsIntoEnvironment(
    rawActiveEnvironment,
    workspace?.globals ?? [],
  );
  const result = activeRequest ? results[activeRequest.id] : null;
  const isLoading = activeRequest ? loading[activeRequest.id] : false;

  const send = async () => {
    if (!activeRequest || !workspace) return;
    const requestId = activeRequest.id;
    // The Send/Cancel button already swaps itself once `sending` is true,
    // but the Cmd/Ctrl+Enter shortcut (RequestBuilder.tsx) calls onSend()
    // unconditionally — without this, a second rapid press overwrites the
    // first send's AbortController (making it uncancellable) and both
    // sends' onStreamChunk callbacks race to write the same streaming key.
    if (loading[requestId]) return;
    const controller = new AbortController();
    controllersRef.current[requestId] = controller;
    setLoading((s) => ({ ...s, [requestId]: true }));
    clearStreaming(requestId, setStreamingByRequest);

    // A write inside runSingleRequest (history/environment/request updates)
    // can now throw on failure instead of failing silently — reportDbWriteFailure
    // already toasts, but without this try/finally the throw would skip
    // everything below, leaving `loading[requestId]` stuck true forever and
    // the Send button spinning until the page reloads.
    let outcome: Awaited<ReturnType<typeof runSingleRequest>>;
    try {
      outcome = await runSingleRequest(
        activeRequest,
        activeEnvironment,
        getRequestAncestors(activeRequest.id),
        { workspaceId: workspace.id, addHistory, updateEnvironment, updateRequest },
        {
          signal: controller.signal,
          onStreamChunk: (text, contentType) =>
            setStreamingByRequest((s) => ({ ...s, [requestId]: { text, contentType } })),
        },
      );
    } finally {
      delete controllersRef.current[requestId];
      // The result now carries everything the live view was standing in for.
      clearStreaming(requestId, setStreamingByRequest);

      // The tab (or the request itself) may have closed while this was in
      // flight. The prune effect above deliberately leaves a loading entry
      // alone until its send finishes — don't undo that here on a tab that's
      // gone; just let the entry go.
      const stillOpenAtFinish = useStore.getState().tabs.some((t) => t.requestId === requestId);
      setLoading((s) => {
        if (stillOpenAtFinish) return { ...s, [requestId]: false };
        if (!(requestId in s)) return s;
        const next = { ...s };
        delete next[requestId];
        return next;
      });
    }

    const stillOpen = useStore.getState().tabs.some((t) => t.requestId === requestId);
    setResults((s) => (stillOpen ? { ...s, [requestId]: outcome.result } : s));

    // Ahead of the script/extract warnings below: an unresolved variable means
    // the request that actually went out isn't the one on screen (an empty URL
    // segment, a blank auth token), and a 200 back from a half-built URL looks
    // like success until you read the response closely.
    if (outcome.result.unresolvedVariables?.length) {
      const names = outcome.result.unresolvedVariables;
      const plural = names.length > 1;
      toast.warning(
        `${names.length} variable${plural ? "s" : ""} had no value and ${plural ? "were" : "was"} sent empty`,
        { description: names.map((name) => `{{${name}}}`).join(", ") },
      );
    }

    if (outcome.result.oauth2RefreshError) {
      toast.error("OAuth2 token refresh failed", {
        description: outcome.result.oauth2RefreshError,
      });
    } else if (outcome.result.scriptError) {
      toast.warning("Pre-request script failed", { description: outcome.result.scriptError });
    } else if (outcome.result.postScriptError) {
      toast.warning("Post-response script failed", {
        description: outcome.result.postScriptError,
      });
    } else if (outcome.scriptEnvironmentDropped) {
      toast.warning("Couldn't save the script's environment variable(s)", {
        description: "No active environment is selected.",
      });
    }

    if (outcome.noActiveEnvironment) {
      toast.warning("Couldn't save extracted variables", {
        description: "No active environment is selected.",
      });
    } else if (outcome.extractFailures.length) {
      toast.warning(
        `Couldn't extract ${outcome.extractFailures.length} variable${outcome.extractFailures.length > 1 ? "s" : ""}`,
        { description: outcome.extractFailures.join(", ") },
      );
    }

    // Declarative rules and script tests are one set of checks to the user, so
    // one toast covers both rather than two that have to be read together.
    const scriptTests = outcome.result.scriptTests ?? [];
    const failedChecks = [
      ...outcome.assertionOutcomes.filter((o) => !o.passed).map((o) => o.message),
      ...scriptTests.filter((test) => !test.passed).map((test) => `${test.name}: ${test.message}`),
    ];
    const totalChecks = outcome.assertionOutcomes.length + scriptTests.length;
    if (failedChecks.length) {
      toast.warning(
        `${failedChecks.length} of ${totalChecks} test${totalChecks > 1 ? "s" : ""} failed`,
        { description: failedChecks.slice(0, 3).join(" · ") },
      );
    }
  };

  const cancel = () => {
    if (!activeRequest) return;
    controllersRef.current[activeRequest.id]?.abort();
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
    <main
      id="main-content"
      tabIndex={-1}
      aria-label="Request workspace"
      className="flex min-w-0 flex-1 overflow-hidden outline-none"
    >
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
                  onCancel={cancel}
                  sending={isLoading}
                  result={result}
                />
                <div className="flex min-h-0 flex-1 flex-col">
                  <ResponseViewer
                    result={result ?? null}
                    loading={isLoading}
                    request={activeRequest}
                    streaming={streamingByRequest[activeRequest.id] ?? null}
                  />
                </div>
              </motion.div>
            ) : (
              <EmptyState key="empty" />
            )}
          </AnimatePresence>
        </div>
      </div>
      <CodeSnippetPanel request={activeRequest} environment={activeEnvironment} />
    </main>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to content
      </a>
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
      <LazyCommandPalette />
      <LazyImportCurlModal />
      <HistoryDrawer />
      <LazySettingsModal />
      <KeyboardShortcutsModal />
      <LazyEnvironmentSwitcher />
      <LazyCollectionRunnerModal />
      <LazyCollectionSettingsModal />
      <LazyPromptDialog />
      <LazyGlobalConfirmDialog />
    </div>
  );
}

function clearStreaming(
  requestId: string,
  setStreamingByRequest: Dispatch<SetStateAction<Record<string, StreamingProgress>>>,
) {
  setStreamingByRequest((s) => {
    if (!(requestId in s)) return s;
    const next = { ...s };
    delete next[requestId];
    return next;
  });
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
