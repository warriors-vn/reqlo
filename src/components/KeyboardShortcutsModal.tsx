import { useMemo } from "react";
import { Overlay } from "./Overlay";
import { useStore } from "@/stores/useStore";
import { commandRegistry } from "@/core/commands/registry";
import { CATEGORIES } from "@/core/commands/categories";
import { formatShortcut } from "@/core/commands/shortcuts";
import type { CommandCategory, CommandDescriptor } from "@/core/commands/types";

export function KeyboardShortcutsModal() {
  const open = useStore((s) => s.overlays.shortcuts);
  const close = () => useStore.getState().closeOverlay("shortcuts");

  const commands = useMemo(() => {
    return commandRegistry
      .all()
      .filter((cmd) => cmd.shortcut) // only commands with shortcuts
      .sort((a, b) => {
        const orderA = CATEGORIES[a.category].order;
        const orderB = CATEGORIES[b.category].order;
        if (orderA !== orderB) return orderA - orderB;
        return a.title.localeCompare(b.title);
      });
  }, []);

  const grouped = useMemo(() => {
    const groups: Partial<Record<CommandCategory, CommandDescriptor[]>> = {};

    for (const cmd of commands) {
      (groups[cmd.category] ??= []).push(cmd);
    }

    return Object.entries(groups).map(([key, cmds]) => ({
      key,
      label: CATEGORIES[key as CommandCategory].label,
      commands: cmds,
    }));
  }, [commands]);

  return (
    <Overlay open={open} onClose={close} title="Keyboard Shortcuts" maxW="max-w-3xl">
      <div className="space-y-5">
        {grouped.map((group) => (
          <div key={group.key}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h3>
            <div className="space-y-2">
              {group.commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground">{cmd.title}</div>
                    {cmd.description && (
                      <div className="mt-0.5 text-2xs text-muted-foreground">{cmd.description}</div>
                    )}
                  </div>
                  <kbd className="ml-3 shrink-0 rounded-md border border-border/70 bg-background px-2 py-1 font-mono text-2xs font-medium text-muted-foreground">
                    {cmd.shortcut && formatShortcut(cmd.shortcut)}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Overlay>
  );
}
