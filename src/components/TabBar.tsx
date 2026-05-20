import { useStore } from "@/stores/useStore";
import { MethodBadge } from "./MethodBadge";
import { X, Plus, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCodeSnippetPanelStore } from "@/features/code-snippets/stores/useCodeSnippetPanelStore";

export function TabBar() {
  const { tabs, activeTabId, requests, setActiveTab, closeTab, createRequest, collections } =
    useStore();
  const collapsed = useCodeSnippetPanelStore((state) => state.collapsed);
  const toggleCollapsed = useCodeSnippetPanelStore((state) => state.toggleCollapsed);
  const selectedLanguage = useCodeSnippetPanelStore((state) => state.selectedLanguage);

  return (
    <div className="flex h-10 items-center gap-0.5 border-b border-border bg-[var(--surface)] px-2">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab) => {
          const req = requests.find((r) => r.id === tab.requestId);
          if (!req) return null;
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "group flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs transition",
                active
                  ? "border-border bg-[var(--surface-elevated)] text-foreground shadow-sm"
                  : "border-transparent text-muted-foreground hover:bg-accent/60",
              )}
            >
              <MethodBadge method={req.method} className="w-9 text-right" />
              <span className="max-w-[140px] truncate">{req.name || "Untitled"}</span>
              {tab.dirty && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="grid h-4 w-4 place-items-center rounded text-muted-foreground opacity-0 hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        <button
          onClick={() => createRequest(collections[0]?.id ?? null)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title="New tab (⌘T)"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="ml-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-xl border px-2.5 text-[11px] font-medium shadow-sm transition",
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
