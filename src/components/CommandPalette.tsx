import { Command } from "cmdk";
import { useEffect } from "react";
import { useStore } from "@/stores/useStore";
import { MethodBadge } from "./MethodBadge";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, FolderPlus, Search } from "lucide-react";

export function CommandPalette() {
  const { paletteOpen, setPalette, requests, openRequest, createRequest, collections, createCollection } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(!useStore.getState().paletteOpen);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        createRequest(collections[0]?.id ?? null);
      }
      if (e.key === "Escape" && useStore.getState().paletteOpen) {
        setPalette(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPalette, createRequest, collections]);

  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/10 backdrop-blur-sm pt-[15vh]"
          onClick={() => setPalette(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-[var(--surface-elevated)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Command className="flex flex-col" loop>
              <div className="flex items-center gap-2 border-b border-border px-4">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Command.Input
                  autoFocus
                  placeholder="Search requests, actions…"
                  className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <kbd className="rounded border border-border bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
              </div>
              <Command.List className="max-h-[400px] overflow-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-xs text-muted-foreground">No matches.</Command.Empty>

                <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
                  <PaletteItem
                    icon={<Plus className="h-3.5 w-3.5" />}
                    label="New request"
                    shortcut="⌘T"
                    onSelect={() => { createRequest(collections[0]?.id ?? null); setPalette(false); }}
                  />
                  <PaletteItem
                    icon={<FolderPlus className="h-3.5 w-3.5" />}
                    label="New collection"
                    onSelect={() => { const n = prompt("Collection name"); if (n) createCollection(n); setPalette(false); }}
                  />
                </Command.Group>

                <Command.Group heading="Requests" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
                  {requests.map(r => (
                    <Command.Item
                      key={r.id}
                      value={`${r.name} ${r.url} ${r.method}`}
                      onSelect={() => { openRequest(r.id); setPalette(false); }}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-xs aria-selected:bg-accent aria-selected:text-accent-foreground"
                    >
                      <MethodBadge method={r.method} className="w-10 text-right" />
                      <span className="truncate">{r.name}</span>
                      <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">{r.url}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
              <div className="flex items-center gap-3 border-t border-border bg-[var(--surface)] px-3 py-1.5 text-[10px] text-muted-foreground">
                <span>↑↓ navigate</span>
                <span>↵ select</span>
                <span className="ml-auto">Reqlo</span>
              </div>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PaletteItem({ icon, label, shortcut, onSelect }: { icon: React.ReactNode; label: string; shortcut?: string; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-xs aria-selected:bg-accent aria-selected:text-accent-foreground"
    >
      <span className="grid h-5 w-5 place-items-center rounded text-muted-foreground">{icon}</span>
      <span>{label}</span>
      {shortcut && <span className="ml-auto font-mono text-[10px] text-muted-foreground">{shortcut}</span>}
    </Command.Item>
  );
}
