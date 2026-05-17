import { useEffect, useSyncExternalStore } from "react";
import { commandRegistry } from "@/core/commands/registry";
import { registerBuiltInCommands } from "@/core/commands/handlers";
import { eventMatches } from "@/core/commands/shortcuts";
import { pushRecent } from "@/core/commands/recent";
import { useStore } from "@/stores/useStore";
import type { CommandContext, CommandDescriptor } from "@/core/commands/types";

/** Subscribe to the registry. Re-renders when commands are added/removed. */
export function useCommands(): CommandDescriptor[] {
  return useSyncExternalStore(
    (cb) => commandRegistry.subscribe(cb),
    () => commandRegistry.all(),
    () => commandRegistry.all(),
  );
}

/** Compute the live execution context from the store. */
export function useCommandContext(): CommandContext {
  const activeTabId = useStore(s => s.activeTabId);
  const tabs = useStore(s => s.tabs);
  const requests = useStore(s => s.requests);
  const paletteOpen = useStore(s => s.overlays.palette);
  const t = tabs.find(x => x.id === activeTabId);
  const hasActiveRequest = !!(t && requests.find(r => r.id === t.requestId));
  return { hasActiveRequest, hasSelection: hasActiveRequest, paletteOpen };
}

/** Mounts built-in commands and installs the global keyboard handler. */
export function useCommandSystem() {
  // Register built-ins once.
  useEffect(() => registerBuiltInCommands(), []);

  // Global shortcut handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape always closes the palette.
      if (e.key === "Escape" && useStore.getState().overlays.palette) {
        useStore.getState().closeOverlay("palette");
        return;
      }
      // Ignore key events from inputs unless they include a modifier — keep typing fast.
      const target = e.target as HTMLElement | null;
      const inField = !!target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target?.isContentEditable;
      const hasMod = e.metaKey || e.ctrlKey || e.altKey;
      if (inField && !hasMod) return;

      const ctx: CommandContext = (() => {
        const st = useStore.getState();
        const t = st.tabs.find(x => x.id === st.activeTabId);
        const has = !!(t && st.requests.find(r => r.id === t.requestId));
        return { hasActiveRequest: has, hasSelection: has, paletteOpen: st.overlays.palette };
      })();

      for (const cmd of commandRegistry.all()) {
        if (!cmd.shortcut) continue;
        if (cmd.when && !cmd.when(ctx)) continue;
        if (eventMatches(cmd.shortcut, e)) {
          e.preventDefault();
          pushRecent(cmd.id);
          void cmd.run();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Imperatively execute a command by id (used by palette items). */
export function runCommand(id: string) {
  const cmd = commandRegistry.get(id);
  if (!cmd) return;
  pushRecent(id);
  void cmd.run();
}
