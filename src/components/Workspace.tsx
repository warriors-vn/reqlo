import { useEffect, useRef, useState } from "react";
import { useStore } from "@/stores/useStore";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";
import { RequestBuilder } from "@/components/RequestBuilder";
import { ResponseViewer } from "@/components/ResponseViewer";
import { CommandPalette } from "@/components/CommandPalette";
import { ImportCurlModal } from "@/components/ImportCurlModal";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { SettingsModal } from "@/components/SettingsModal";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
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
    sendPing,
    environments,
    activeEnvId,
  } = useStore();
  const [results, setResults] = useState<Record<string, ExecutionResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const lastPing = useRef(0);

  useEffect(() => {
    init();
  }, [init]);

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

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {!sidebarCollapsed && <Sidebar />}
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
                  <RequestBuilder request={activeRequest} onSend={send} sending={isLoading} />
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

      {/* Overlays */}
      <CommandPalette />
      <ImportCurlModal />
      <HistoryDrawer />
      <SettingsModal />
      <AIAssistantPanel />
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
          Search <kbd className="ml-1 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
        </button>
      </div>
    </motion.div>
  );
}
