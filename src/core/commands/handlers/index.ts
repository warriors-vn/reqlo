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
  Sparkles,
  PanelLeft,
  Terminal,
  Globe,
  FlaskConical,
  Code2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { commandRegistry } from "../registry";
import type { CommandDescriptor } from "../types";
import { useStore, pickFile } from "@/stores/useStore";
import { useCodeSnippetPanelStore } from "@/features/code-snippets/stores/useCodeSnippetPanelStore";
import { generateSnippetFromRequest } from "@/features/code-snippets/utils/generate-snippet";
import { copyTextToClipboard } from "@/features/code-snippets/utils/clipboard";
import { toast } from "sonner";

/** Prompt helper. Returns null if user cancels or input is empty. */
const ask = (label: string, def = "") => {
  const v = window.prompt(label, def);
  return v && v.trim() ? v.trim() : null;
};
const confirmDanger = (msg: string) => window.confirm(msg);

const s = () => useStore.getState();

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
      run: () => {
        const r = s().getActiveRequest();
        if (!r) return;
        const name = ask("Rename request", r.name);
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
      run: () => {
        const r = s().getActiveRequest();
        if (!r) return;
        if (confirmDanger(`Delete "${r.name}"?`)) s().deleteRequest(r.id);
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
      run: () => {
        const n = ask("Collection name");
        if (n) s().createCollection(n);
      },
    },
    {
      id: "collection.duplicate",
      title: "Duplicate Collection",
      category: "collections",
      icon: Copy,
      run: () => {
        const cols = s().collections;
        if (cols.length === 0) return;
        const name = ask("Duplicate which collection? (name)", cols[0].name);
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
      run: () => {
        const n = ask("Environment name");
        if (n) s().createEnvironment(n);
      },
    },
    {
      id: "env.switch",
      title: "Switch Environment",
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
        if (!col) window.alert("Invalid collection file.");
      },
    },
    {
      id: "export.collection",
      title: "Export Collection",
      description: "Download the first collection as JSON",
      category: "import-export",
      icon: FileJson,
      shortcut: "mod+shift+e",
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

    // ─────────── AI ───────────
    {
      id: "ai.assistant",
      title: "Open AI Assistant",
      category: "ai",
      icon: Sparkles,
      shortcut: "mod+shift+a",
      run: () => s().openOverlay("ai"),
    },
    {
      id: "ai.generate-test",
      title: "Generate Test Script",
      description: "Draft a test for the active request",
      category: "ai",
      icon: FlaskConical,
      when: (c) => c.hasActiveRequest,
      run: () => s().openOverlay("ai"),
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
        const environment = state.environments.find((env) => env.id === state.activeEnvId) ?? null;
        const language = useCodeSnippetPanelStore.getState().selectedLanguage;
        const snippet = generateSnippetFromRequest(language, request, environment);
        await copyTextToClipboard(snippet);
        toast.success("Snippet copied", {
          description: `${request.name || "Untitled request"} · ${language}`,
        });
      },
    },
  ];

  return commandRegistry.registerMany(cmds);
}
