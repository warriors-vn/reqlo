import type { ComponentType, SVGProps } from "react";

export type CommandCategory =
  | "requests"
  | "collections"
  | "workspace"
  | "navigation"
  | "import-export"
  | "ai"
  | "settings"
  | "view"
  | "developer";

export interface CommandContext {
  hasActiveRequest: boolean;
  hasSelection: boolean;
  paletteOpen: boolean;
}

export interface CommandDescriptor {
  /** Stable, namespaced id, e.g. "request.send" */
  id: string;
  title: string;
  description?: string;
  category: CommandCategory;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Human-readable shortcut, e.g. "mod+shift+i". `mod` = ⌘ on macOS, Ctrl elsewhere. */
  shortcut?: string;
  /** Search keywords beyond the title. */
  keywords?: string[];
  /** When true, command is shown/runnable. Receives live context. */
  when?: (ctx: CommandContext) => boolean;
  /** Side-effectful action. May be async. */
  run: () => void | Promise<void>;
}

export interface CategoryMeta {
  id: CommandCategory;
  label: string;
  order: number;
}
