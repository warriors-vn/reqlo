import type { CategoryMeta, CommandCategory } from "./types";

export const CATEGORIES: Record<CommandCategory, CategoryMeta> = {
  requests:        { id: "requests",        label: "Requests",       order: 10 },
  collections:     { id: "collections",     label: "Collections",    order: 20 },
  workspace:       { id: "workspace",       label: "Workspace",      order: 30 },
  navigation:      { id: "navigation",      label: "Navigation",     order: 40 },
  "import-export": { id: "import-export",   label: "Import / Export", order: 50 },
  ai:              { id: "ai",              label: "AI",             order: 60 },
  view:            { id: "view",            label: "View",           order: 70 },
  settings:        { id: "settings",        label: "Settings",       order: 80 },
  developer:       { id: "developer",       label: "Developer",      order: 90 },
};
