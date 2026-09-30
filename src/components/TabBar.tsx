import { useState } from "react";
import { useStore } from "@/stores/useStore";
import { useShallow } from "zustand/react/shallow";
import { MethodBadge } from "./MethodBadge";
import {
  X,
  Plus,
  Code2,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  XCircle,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCodeSnippetPanelStore } from "@/features/code-snippets/stores/useCodeSnippetPanelStore";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

export function TabBar() {
  const {
    tabs,
    activeTabId,
    requests,
    setActiveTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    createRequest,
    duplicateRequest,
    openRequest,
    sidebarCollapsed,
    toggleSidebar,
    activateAdjacentTab,
    reorderTabs,
  } = useStore(
    useShallow((state) => ({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      requests: state.requests,
      setActiveTab: state.setActiveTab,
      closeTab: state.closeTab,
      closeOtherTabs: state.closeOtherTabs,
      closeTabsToRight: state.closeTabsToRight,
      createRequest: state.createRequest,
      duplicateRequest: state.duplicateRequest,
      openRequest: state.openRequest,
      sidebarCollapsed: state.sidebarCollapsed,
      toggleSidebar: state.toggleSidebar,
      activateAdjacentTab: state.activateAdjacentTab,
      reorderTabs: state.reorderTabs,
    })),
  );
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const activeRequestId = tabs.find((tab) => tab.id === activeTabId)?.requestId;
  const activeRequestObj = requests.find((request) => request.id === activeRequestId);
  const activeCollectionId = activeRequestObj?.collectionId ?? null;
  const activeFolderId = activeRequestObj?.folderId ?? null;
  const collapsed = useCodeSnippetPanelStore((state) => state.collapsed);
  const toggleCollapsed = useCodeSnippetPanelStore((state) => state.toggleCollapsed);
  const selectedLanguage = useCodeSnippetPanelStore((state) => state.selectedLanguage);

  return (
    <div className="flex h-10 items-center gap-0.5 border-b border-border bg-[var(--surface)] px-2">
      <div className="mr-1 flex items-center gap-1">
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
            title="Show sidebar (⌘B)"
          >
            <PanelLeftOpen className="h-3.5 w-3.5" />
          </button>
        )}
        {tabs.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => activateAdjacentTab("prev")}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              title="Previous tab"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => activateAdjacentTab("next")}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              title="Next tab"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {tabs.map((tab, index) => {
            const req = requests.find((r) => r.id === tab.requestId);
            if (!req) return null;
            const active = tab.id === activeTabId;
            const isLast = index === tabs.length - 1;
            return (
              <ContextMenu key={tab.id}>
                <ContextMenuTrigger asChild>
                  <div
                    draggable
                    onClick={() => setActiveTab(tab.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      setDraggedTabId(tab.id);
                    }}
                    onDragEnd={() => {
                      setDraggedTabId(null);
                      setDragOverTabId(null);
                    }}
                    onDragOver={(event) => {
                      if (!draggedTabId || draggedTabId === tab.id) return;
                      event.preventDefault();
                      setDragOverTabId(tab.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggedTabId || draggedTabId === tab.id) return;
                      reorderTabs(draggedTabId, tab.id);
                      setDraggedTabId(null);
                      setDragOverTabId(null);
                    }}
                    className={cn(
                      "group flex h-8 shrink-0 cursor-grab items-center gap-2 rounded-md border px-2.5 text-xs transition active:cursor-grabbing",
                      active
                        ? "border-border bg-[var(--surface-elevated)] text-foreground shadow-sm"
                        : "border-transparent text-muted-foreground hover:bg-accent/60",
                      draggedTabId === tab.id && "opacity-50",
                      dragOverTabId === tab.id && "ring-1 ring-primary/40",
                    )}
                  >
                    <MethodBadge
                      method={req.method}
                      protocol={req.protocol}
                      className="w-9 text-right"
                    />
                    <span className="max-w-[140px] truncate">{req.name || "Untitled"}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      aria-label={`Close ${req.name || "Untitled"}`}
                      className="grid h-4 w-4 place-items-center rounded text-muted-foreground opacity-0 hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => closeTab(tab.id)}>
                    <X className="h-3.5 w-3.5" /> Close
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={tabs.length < 2}
                    onSelect={() => closeOtherTabs(tab.id)}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Close others
                  </ContextMenuItem>
                  <ContextMenuItem disabled={isLast} onSelect={() => closeTabsToRight(tab.id)}>
                    <ChevronsRight className="h-3.5 w-3.5" /> Close to the right
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => {
                      void duplicateRequest(tab.requestId).then((duplicate) => {
                        if (duplicate) openRequest(duplicate.id);
                      });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplicate tab
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          <button
            onClick={() => createRequest(activeCollectionId, activeFolderId)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
            title="New tab (⌘T)"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {tabs.length > 1 && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[var(--surface)] to-transparent" />
        )}
      </div>
      <div className="ml-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-xl border px-2.5 text-2xs font-medium shadow-sm transition",
            collapsed
              ? "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
              : "border-border bg-[var(--surface-elevated)] text-foreground",
          )}
          title="Toggle code snippets (⌘⇧C)"
        >
          <Code2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{collapsed ? "Show snippets" : selectedLanguage}</span>
        </button>
      </div>
    </div>
  );
}
