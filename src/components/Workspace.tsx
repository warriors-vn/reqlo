import { useEffect, useState } from "react";
import { useStore } from "@/stores/useStore";
import { Sidebar } from "@/components/Sidebar";
import { TabBar } from "@/components/TabBar";
import { RequestBuilder } from "@/components/RequestBuilder";
import { ResponseViewer, type ExecutionResult } from "@/components/ResponseViewer";
import { CommandPalette } from "@/components/CommandPalette";
import { executeRequest } from "@/services/executor";
import { uid } from "@/services/db";
import { motion, AnimatePresence } from "framer-motion";

export function Workspace() {
  const { ready, init, tabs, activeTabId, requests, workspace, addHistory } = useStore();
  const [results, setResults] = useState<Record<string, ExecutionResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  useEffect(() => { init(); }, [init]);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeRequest = activeTab ? requests.find(r => r.id === activeTab.requestId) : null;
  const result = activeRequest ? results[activeRequest.id] : null;
  const isLoading = activeRequest ? !!loading[activeRequest.id] : false;

  const send = async () => {
    if (!activeRequest || !workspace) return;
    setLoading(s => ({ ...s, [activeRequest.id]: true }));
    const res = await executeRequest(activeRequest);
    setResults(s => ({ ...s, [activeRequest.id]: res }));
    setLoading(s => ({ ...s, [activeRequest.id]: false }));
    await addHistory({
      id: uid(),
      workspaceId: workspace.id,
      requestId: activeRequest.id,
      method: activeRequest.method,
      url: activeRequest.url,
      status: res.status,
      ok: res.ok,
      durationMs: res.durationMs,
      sizeBytes: res.sizeBytes,
      executedAt: Date.now(),
      errorMessage: res.error,
      responseExcerpt: res.body?.slice(0, 200),
    });
  };

  // Keyboard: ⌘Enter to send
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        send();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      <Sidebar />
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
      <CommandPalette />
    </div>
  );
}

function EmptyState() {
  const { createRequest, collections, setPalette } = useStore();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-1 flex-col items-center justify-center gap-6 text-center"
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">R</div>
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
          onClick={() => setPalette(true)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          Search <kbd className="ml-1 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
        </button>
      </div>
    </motion.div>
  );
}
