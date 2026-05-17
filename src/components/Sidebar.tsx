import { useState } from "react";
import { Plus, Search, FolderClosed, ChevronRight, ChevronDown, Trash2 } from "lucide-react";
import { useStore } from "@/stores/useStore";
import { MethodBadge } from "./MethodBadge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function Sidebar() {
  const { collections, requests, openRequest, activeTabId, tabs, createRequest, createCollection, deleteRequest, setPalette } = useStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const activeRequestId = tabs.find(t => t.id === activeTabId)?.requestId;
  const q = query.trim().toLowerCase();

  const filterReq = (cid: string | null) =>
    requests
      .filter(r => r.collectionId === cid)
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q));

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-[var(--surface)]">
      {/* Brand */}
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">R</div>
          <span className="text-sm font-semibold tracking-tight">Reqlo</span>
        </div>
        <button
          onClick={() => createRequest(collections[0]?.id ?? null)}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-ring"
          title="New request"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <button
          onClick={() => setPalette(true)}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-[var(--surface-elevated)] px-2.5 py-1.5 text-left text-xs text-muted-foreground transition hover:border-foreground/15 focus-ring"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search…</span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">⌘K</span>
        </button>
      </div>

      {/* Tree */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {collections.map(col => {
          const isOpen = open[col.id] ?? true;
          const list = filterReq(col.id);
          return (
            <div key={col.id} className="mb-1">
              <button
                onClick={() => setOpen(o => ({ ...o, [col.id]: !isOpen }))}
                className="group flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-foreground/70 transition hover:bg-accent focus-ring"
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <FolderClosed className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{col.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/70">{list.length}</span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="ml-2 mt-0.5 border-l border-border pl-1">
                      {list.map(r => (
                        <div
                          key={r.id}
                          className={cn(
                            "group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition",
                            activeRequestId === r.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                          )}
                          onClick={() => openRequest(r.id)}
                        >
                          <MethodBadge method={r.method} className="w-10 shrink-0 text-right" />
                          <span className="truncate text-xs">{r.name || "Untitled"}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${r.name}"?`)) deleteRequest(r.id); }}
                            className="ml-auto hidden h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:grid"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {list.length === 0 && (
                        <div className="px-2 py-1 text-[11px] text-muted-foreground/60">No requests</div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        <button
          onClick={async () => {
            const name = prompt("Collection name");
            if (name) await createCollection(name);
          }}
          className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> New collection
        </button>
      </div>

      <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground/70">
        Local-first · {requests.length} requests
      </div>
    </aside>
  );
}
