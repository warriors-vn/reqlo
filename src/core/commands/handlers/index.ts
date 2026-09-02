import {
  Plus,
  FolderPlus,
  Send,
  Copy,
  Trash2,
  Star,
  Pencil,
  Search,
  Download,
  Upload,
  FileJson,
  Settings,
  History,
  PanelLeft,
  Terminal,
  Globe,
  Code2,
  ChevronLeft,
  ChevronRight,
  SunMoon,
} from "lucide-react";
import { commandRegistry } from "../registry";
import type { CommandDescriptor } from "../types";
import type { Workspace } from "@/services/db";
import { useStore, pickFile } from "@/stores/useStore";
import { applyTheme, getStoredTheme, resolveTheme, setStoredTheme } from "@/lib/theme";
import { useCodeSnippetPanelStore } from "@/features/code-snippets/stores/useCodeSnippetPanelStore";
import { generateSnippetFromRequest } from "@/features/code-snippets/utils/generate-snippet";
import { copyTextToClipboard } from "@/features/code-snippets/utils/clipboard";
import { mergeGlobalsIntoEnvironment } from "@/features/code-snippets/utils/request-resolver";
import { toast } from "sonner";

const s = () => useStore.getState();

/** Styled text-input prompt (see PromptDialog) — resolves null if the user
 * cancels or submits empty, same contract the old window.prompt() call had. */
const ask = (title: string, defaultValue = "") => s().requestPrompt({ title, defaultValue });
/** Styled destructive-confirm dialog (see GlobalConfirmDialog), replacing
 * window.confirm() so it matches the rest of the app's confirmation flows. */
const confirmDanger = (title: string) => s().requestConfirm({ title });

function suggestEnvironmentName(existingNames: string[]) {
  const taken = new Set(existingNames.map((name) => name.toLowerCase()));
  let index = 1;
  let candidate = "Environment";

  while (taken.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `Environment ${index}`;
  }

  return candidate;
}

export function registerBuiltInCommands(): () => void {
  const cmds: CommandDescriptor[] = [
    // ─────────── REQUESTS ───────────
    {
      id: "request.create",
      title: "Create Request",
      description: "New blank request",
      category: "requests",
      icon: Plus,
      shortcut: "mod+t",
      keywords: ["new", "blank"],
      run: () => {
        s().createRequest(s().collections[0]?.id ?? null);
      },
    },
    {
      id: "request.send",
      title: "Send Request",
      description: "Execute the active request",
      category: "requests",
      icon: Send,
      shortcut: "mod+enter",
      when: (c) => c.hasActiveRequest,
      run: () => s().requestSend(),
    },
    {
      id: "request.duplicate",
      title: "Duplicate Request",
      category: "requests",
      icon: Copy,
      shortcut: "mod+d",
      when: (c) => c.hasActiveRequest,
      run: () => {
        const r = s().getActiveRequest();
        if (r) s().duplicateRequest(r.id);
      },
    },
    {
      id: "request.rename",
      title: "Rename Request",
      category: "requests",
      icon: Pencil,
      shortcut: "mod+shift+r",
      when: (c) => c.hasActiveRequest,
      run: async () => {
        const r = s().getActiveRequest();
        if (!r) return;
        const name = await ask("Rename request", r.name);
        if (name) s().renameRequest(r.id, name);
      },
    },
    {
      id: "request.delete",
      title: "Delete Request",
      category: "requests",
      icon: Trash2,
      shortcut: "mod+backspace",
      when: (c) => c.hasActiveRequest,
      run: async () => {
        const r = s().getActiveRequest();
        if (!r) return;
        if (await confirmDanger(`Delete "${r.name}"?`)) s().deleteRequest(r.id);
      },
    },
    {
      id: "request.favorite",
      title: "Favorite Request",
      description: "Toggle favorite",
      category: "requests",
      icon: Star,
      shortcut: "mod+shift+s",
      when: (c) => c.hasActiveRequest,
      run: () => {
        const r = s().getActiveRequest();
        if (r) s().toggleFavorite(r.id);
      },
    },
    {
      id: "request.search",
      title: "Search Requests",
      description: "Open the command palette focused on requests",
      category: "requests",
      icon: Search,
      shortcut: "mod+p",
      run: () => s().openOverlay("palette"),
    },

    // ─────────── COLLECTIONS ───────────
    {
      id: "collection.create",
      title: "Create Folder",
      description: "New collection",
      category: "collections",
      icon: FolderPlus,
      run: async () => {
        const n = await ask("Collection name");
        if (n) s().createCollection(n);
      },
    },
    {
      id: "collection.duplicate",
      title: "Duplicate Collection",
      category: "collections",
      icon: Copy,
      run: async () => {
        const cols = s().collections;
        if (cols.length === 0) return;
        const name = await ask("Duplicate which collection? (name)", cols[0].name);
        if (!name) return;
        const match = cols.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? cols[0];
        s().duplicateCollection(match.id);
      },
    },

    // ─────────── WORKSPACE / ENV ───────────
    {
      id: "env.create",
      title: "Create Environment",
      category: "workspace",
      icon: Globe,
      shortcut: "mod+shift+n",
      run: async () => {
        const state = s();
        const environment = await state.createEnvironment(
          suggestEnvironmentName(state.environments.map((item) => item.name)),
        );
        state.setActiveEnv(environment.id);
        state.openOverlay("env-switcher");
      },
    },
    {
      id: "env.switch",
      title: "Manage Environments",
      description: "Switch, edit, and preview environments",
      category: "workspace",
      icon: Globe,
      shortcut: "mod+shift+e",
      run: () => s().openOverlay("env-switcher"),
    },

    // ─────────── NAVIGATION ───────────
    {
      id: "nav.palette",
      title: "Open Command Palette",
      category: "navigation",
      icon: Search,
      shortcut: "mod+k",
      run: () => s().toggleOverlay("palette"),
    },
    {
      id: "nav.history",
      title: "Open History",
      category: "navigation",
      icon: History,
      shortcut: "mod+shift+h",
      run: () => s().openOverlay("history"),
    },
    {
      id: "nav.settings",
      title: "Open Settings",
      category: "navigation",
      icon: Settings,
      shortcut: "mod+,",
      run: () => s().openOverlay("settings"),
    },
    {
      id: "nav.tab-next",
      title: "Next Tab",
      description: "Move to the next open request tab",
      category: "navigation",
      icon: ChevronRight,
      shortcut: "mod+alt+arrowright",
      run: () => s().activateAdjacentTab("next"),
    },
    {
      id: "nav.tab-prev",
      title: "Previous Tab",
      description: "Move to the previous open request tab",
      category: "navigation",
      icon: ChevronLeft,
      shortcut: "mod+alt+arrowleft",
      run: () => s().activateAdjacentTab("prev"),
    },

    // ─────────── IMPORT / EXPORT ───────────
    {
      id: "import.curl",
      title: "Import cURL",
      description: "Paste a cURL command to create a request",
      category: "import-export",
      icon: Terminal,
      shortcut: "mod+shift+i",
      keywords: ["curl", "paste", "import"],
      run: () => s().openOverlay("import-curl"),
    },
    {
      id: "import.collection",
      title: "Import Collection",
      description: "Load a .reqlo.json collection file",
      category: "import-export",
      icon: Upload,
      shortcut: "mod+shift+o",
      run: async () => {
        const text = await pickFile("application/json,.json");
        if (!text) return;
        const col = await s().importCollectionJSON(text);
        if (!col) {
          toast.error("Import failed", { description: "Invalid collection file." });
        }
      },
    },
    {
      id: "import.postman",
      title: "Import Postman Collection",
      description: "Load a Postman Collection v2.1 export",
      category: "import-export",
      icon: Upload,
      keywords: ["postman", "import", "migrate"],
      run: async () => {
        const text = await pickFile("application/json,.json");
        if (!text) return;
        const col = await s().importPostmanCollectionJSON(text);
        if (!col) {
          toast.error("Import failed", {
            description: "Not a Postman Collection v2.1 export.",
          });
        }
      },
    },
    {
      id: "import.insomnia",
      title: "Import Insomnia Export",
      description: "Load an Insomnia v4 export (JSON)",
      category: "import-export",
      icon: Upload,
      keywords: ["insomnia", "import", "migrate"],
      run: async () => {
        const text = await pickFile("application/json,.json");
        if (!text) return;
        const col = await s().importInsomniaExportJSON(text);
        if (!col) {
          toast.error("Import failed", { description: "Not an Insomnia v4 export." });
        }
      },
    },
    {
      id: "import.har",
      title: "Import HAR File",
      description: "Load a HAR (HTTP Archive) capture from browser devtools",
      category: "import-export",
      icon: Upload,
      keywords: ["har", "http archive", "devtools", "import"],
      run: async () => {
        const text = await pickFile("application/json,.har,.json");
        if (!text) return;
        const col = await s().importHarLogJSON(text);
        if (!col) {
          toast.error("Import failed", {
            description: "Not a HAR (HTTP Archive) file.",
          });
        }
      },
    },
    {
      id: "import.openapi",
      title: "Import OpenAPI Spec",
      description: "Load an OpenAPI 3.0/3.1 document (JSON or YAML)",
      category: "import-export",
      icon: Upload,
      keywords: ["openapi", "swagger", "import", "spec"],
      run: async () => {
        const text = await pickFile("application/json,application/yaml,.json,.yaml,.yml");
        if (!text) return;
        const col = await s().importOpenApiText(text);
        if (!col) {
          toast.error("Import failed", {
            description: "Not a recognized OpenAPI 3.0/3.1 document.",
          });
        }
      },
    },
    {
      id: "import.workspace",
      title: "Restore Workspace",
      description: "Replace the local workspace from a backup export",
      category: "import-export",
      icon: Upload,
      shortcut: "mod+alt+shift+o",
      run: async () => {
        if (
          !(await confirmDanger(
            "Restore a workspace backup? This will replace the current local workspace.",
          ))
        )
          return;
        const text = await pickFile("application/json,.json");
        if (!text) return;

        let workspace: Workspace | null;
        try {
          workspace = await s().importWorkspaceJSON(text);
        } catch {
          toast.error("Restore failed", {
            description: "Nothing was changed — your current workspace is still intact.",
          });
          return;
        }
        if (!workspace) {
          toast.error("Restore failed", {
            description: "The selected file is not a valid Reqlo workspace export.",
          });
          return;
        }

        const state = s();
        toast.success("Workspace restored", {
          description: `${workspace.name} · ${state.requests.length} requests · ${state.environments.length} environments`,
        });
      },
    },
    {
      id: "export.collection",
      title: "Export Collection",
      description: "Download the first collection as JSON",
      category: "import-export",
      icon: FileJson,
      shortcut: "mod+alt+shift+e",
      run: () => {
        const cols = s().collections;
        if (!cols.length) return;
        const r = s().getActiveRequest();
        const target = (r && cols.find((c) => c.id === r.collectionId)) ?? cols[0];
        s().exportCollectionById(target.id);
      },
    },
    {
      id: "export.workspace",
      title: "Export Workspace",
      description: "Download the full workspace as JSON",
      category: "import-export",
      icon: Download,
      shortcut: "mod+alt+e",
      run: () => s().exportActiveWorkspace(),
    },

    // ─────────── VIEW ───────────
    {
      id: "view.toggle-sidebar",
      title: "Toggle Sidebar",
      category: "view",
      icon: PanelLeft,
      shortcut: "mod+b",
      run: () => s().toggleSidebar(),
    },
    {
      id: "view.toggle-snippets",
      title: "Toggle Code Snippets",
      description: "Collapse or expand the right-side snippet panel",
      category: "view",
      icon: Code2,
      shortcut: "mod+shift+c",
      run: () => useCodeSnippetPanelStore.getState().toggleCollapsed(),
    },
    {
      id: "view.toggle-theme",
      title: "Toggle Theme",
      description: "Cycle Light → Dark → System",
      category: "view",
      icon: SunMoon,
      shortcut: "mod+alt+t",
      run: () => {
        const current = getStoredTheme();
        const next = current === "light" ? "dark" : current === "dark" ? "system" : "light";
        setStoredTheme(next);
        applyTheme(next);
        toast.success(`Theme: ${next === "system" ? `System (${resolveTheme(next)})` : next}`);
      },
    },
    {
      id: "snippet.copy",
      title: "Copy Current Snippet",
      description: "Copy the active snippet in the selected language",
      category: "developer",
      icon: Copy,
      shortcut: "mod+shift+y",
      when: (c) => c.hasActiveRequest,
      run: async () => {
        const request = s().getActiveRequest();
        if (!request) return;
        const state = s();
        const rawEnvironment =
          state.environments.find((env) => env.id === state.activeEnvId) ?? null;
        const environment = mergeGlobalsIntoEnvironment(
          rawEnvironment,
          state.workspace?.globals ?? [],
        );
        const language = useCodeSnippetPanelStore.getState().selectedLanguage;
        const snippet = generateSnippetFromRequest(language, request, environment);
        await copyTextToClipboard(snippet);
        toast.success("Snippet copied", {
          description: `${request.name || "Untitled request"} · ${language}`,
        });
      },
    },

    // ─────────── HELP ───────────
    {
      id: "help.shortcuts",
      title: "Keyboard Shortcuts",
      description: "View all available keyboard shortcuts",
      category: "navigation",
      shortcut: "shift+/",
      run: () => s().openOverlay("shortcuts"),
    },
  ];

  return commandRegistry.registerMany(cmds);
}
