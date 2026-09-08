import { Plug, Plus, Terminal, Upload } from "lucide-react";
import { runCommand } from "@/hooks/useCommandSystem";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSwitch } from "./ThemeSwitch";

export function SidebarBrandRow({
  onCreateRequest,
}: {
  onCreateRequest: (protocol?: "http" | "websocket") => void;
}) {
  return (
    <div className="flex h-12 items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <div className="grid h-6 w-6 place-items-center rounded-md bg-primary text-3xs font-bold text-primary-foreground">
          R
        </div>
        <span className="text-sm font-semibold tracking-tight">Reqlo</span>
      </div>
      <div className="flex items-center gap-1">
        <ThemeSwitch />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-ring"
              title="Import"
            >
              <Upload className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => runCommand("import.curl")}>
              <Terminal className="h-3.5 w-3.5" /> Import cURL
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runCommand("import.collection")}>
              <Upload className="h-3.5 w-3.5" /> Import Collection
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runCommand("import.postman")}>
              <Upload className="h-3.5 w-3.5" /> Import Postman Collection
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runCommand("import.insomnia")}>
              <Upload className="h-3.5 w-3.5" /> Import Insomnia Export
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runCommand("import.har")}>
              <Upload className="h-3.5 w-3.5" /> Import HAR File
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => runCommand("import.openapi")}>
              <Upload className="h-3.5 w-3.5" /> Import OpenAPI Spec
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-ring"
              title="New request"
              aria-label="New request"
            >
              <Plus className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => onCreateRequest()}>
              <Plus className="h-3.5 w-3.5" /> New HTTP request
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onCreateRequest("websocket")}>
              <Plug className="h-3.5 w-3.5" /> New WebSocket request
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
