import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/stores/useStore";
import { Sidebar } from "@/components/Sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { TabBar } from "@/components/TabBar";
import { RequestBuilder } from "@/components/RequestBuilder";
import { ResponseViewer } from "@/components/ResponseViewer";
import { LazyCommandPalette } from "@/components/LazyCommandPalette";
import { LazyImportCurlModal } from "@/components/LazyImportCurlModal";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { LazySettingsModal } from "@/components/LazySettingsModal";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { LazyEnvironmentSwitcher } from "@/components/LazyEnvironmentSwitcher";
import { LazyCollectionRunnerModal } from "@/components/LazyCollectionRunnerModal";
import { runSingleRequest } from "@/services/runner";
import { motion, AnimatePresence } from "framer-motion";
import { useCommandSystem } from "@/hooks/useCommandSystem";
import { CodeSnippetPanel } from "@/features/code-snippets/components/CodeSnippetPanel";
import type { ExecutionResult } from "@/services/execution";
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
  } = useStore();
  const [results, setResults] = useState<Record<string, ExecutionResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
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
    const requestId = activeRequest.id;
    const controller = new AbortController();
    controllersRef.current[requestId] = controller;
    setLoading((s) => ({ ...s, [requestId]: true }));
    const outcome = await runSingleRequest(
      activeRequest,
      activeEnvironment,
      { workspaceId: workspace.id, addHistory, updateEnvironment },
      { signal: controller.signal },
    );
    delete controllersRef.current[requestId];
    setResults((s) => ({ ...s, [requestId]: outcome.result }));
    setLoading((s) => ({ ...s, [requestId]: false }));

    if (outcome.result.scriptError) {
      toast.warning("Pre-request script failed", { description: outcome.result.scriptError });
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

    const failedAssertions = outcome.assertionOutcomes.filter((o) => !o.passed);
    if (failedAssertions.length) {
      toast.warning(
        `${failedAssertions.length} of ${outcome.assertionOutcomes.length} test${outcome.assertionOutcomes.length > 1 ? "s" : ""} failed`,
        {
          description: failedAssertions
            .slice(0, 3)
            .map((o) => o.message)
            .join(" · "),
        },
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
