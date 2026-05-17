import { Command } from "cmdk";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import { useStore } from "@/stores/useStore";
import { MethodBadge } from "./MethodBadge";
import { useCommands, useCommandContext, runCommand } from "@/hooks/useCommandSystem";
import { CATEGORIES } from "@/core/commands/categories";
import { formatShortcut } from "@/core/commands/shortcuts";
import { getRecent } from "@/core/commands/recent";
import { scoreCommand } from "@/core/commands/fuzzy";
import type { CommandCategory, CommandDescriptor } from "@/core/commands/types";

export function CommandPalette() {
  const open = useStore(s => s.overlays.palette);
  const closeOverlay = useStore(s => s.closeOverlay);
  const requests = useStore(s => s.requests);
  const openRequest = useStore(s => s.openRequest);

  const commands = useCommands();
  const ctx = useCommandContext();
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => commands.filter(c => !c.when || c.when(ctx)),
    [commands, ctx],
  );

  const ranked = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    return visible
      .map(c => ({ c, score: scoreCommand(c, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.c);
  }, [visible, query]);

  const recentIds = useMemo(getRecent, [open]);
  const recent = useMemo(
    () => recentIds.map(id => visible.find(c => c.id === id)).filter(Boolean) as CommandDescriptor[],
    [recentIds, visible],
  );

  const groups = useMemo(() => groupByCategory(ranked ?? visible), [ranked, visible]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/10 backdrop-blur-sm pt-[12vh]"
          onClick={() => closeOverlay("palette")}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="glass w-full max-w-xl overflow-hidden rounded-2xl border border-border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Command className="flex flex-col" loop shouldFilter={false}>
              <div className="flex items-center gap-2 border-b border-border px-4">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search commands, requests…"
                  className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <kbd className="rounded border border-border bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
              </div>

              <Command.List className="max-h-[440px] overflow-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-xs text-muted-foreground">No matches.</Command.Empty>

                {!query && recent.length > 0 && (
                  <Group heading="Recent">
                    {recent.map(c => <CommandRow key={`r-${c.id}`} cmd={c} onRun={() => { runCommand(c.id); closeOverlay("palette"); }} />)}
                  </Group>
                )}

                {Object.entries(groups)
                  .sort(([a], [b]) => CATEGORIES[a as CommandCategory].order - CATEGORIES[b as CommandCategory].order)
                  .map(([cat, list]) => (
                    <Group key={cat} heading={CATEGORIES[cat as CommandCategory].label}>
                      {list.map(c => (
                        <CommandRow
                          key={c.id} cmd={c}
                          onRun={() => { runCommand(c.id); closeOverlay("palette"); }}
                        />
                      ))}
                    </Group>
                  ))}

                {!query && (
                  <Group heading="Requests">
                    {requests.slice(0, 20).map(r => (
                      <Command.Item
                        key={r.id}
                        value={`request-${r.id} ${r.name} ${r.url}`}
                        onSelect={() => { openRequest(r.id); closeOverlay("palette"); }}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-xs aria-selected:bg-accent aria-selected:text-accent-foreground"
                      >
                        <MethodBadge method={r.method} className="w-10 text-right" />
                        <span className="truncate">{r.name}</span>
                        <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">{r.url}</span>
                      </Command.Item>
                    ))}
                  </Group>
                )}
              </Command.List>

              <div className="flex items-center gap-3 border-t border-border bg-[var(--surface)]/80 px-3 py-1.5 text-[10px] text-muted-foreground">
                <span>↑↓ navigate</span>
                <span>↵ select</span>
                <span className="ml-auto">{commands.length} commands</span>
              </div>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
    >
      {children}
    </Command.Group>
  );
}

function CommandRow({ cmd, onRun }: { cmd: CommandDescriptor; onRun: () => void }) {
  const Icon = cmd.icon;
  return (
    <Command.Item
      value={`${cmd.id} ${cmd.title} ${(cmd.keywords ?? []).join(" ")}`}
      onSelect={onRun}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-xs aria-selected:bg-accent aria-selected:text-accent-foreground"
    >
      <span className="grid h-5 w-5 place-items-center rounded text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      </span>
      <span className="truncate">{cmd.title}</span>
      {cmd.description && <span className="ml-2 truncate text-[10px] text-muted-foreground/80">{cmd.description}</span>}
      {cmd.shortcut && (
        <kbd className="ml-auto rounded border border-border bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {formatShortcut(cmd.shortcut)}
        </kbd>
      )}
    </Command.Item>
  );
}

function groupByCategory(list: CommandDescriptor[]): Record<string, CommandDescriptor[]> {
  const out: Record<string, CommandDescriptor[]> = {};
  for (const c of list) {
    (out[c.category] ??= []).push(c);
  }
  return out;
}
