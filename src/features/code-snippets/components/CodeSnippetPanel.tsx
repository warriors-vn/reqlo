import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Expand,
  GripVertical,
  Shrink,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { snippetGenerators } from "@/features/code-snippets/registry";
import { useGeneratedSnippet } from "@/features/code-snippets/hooks/useGeneratedSnippet";
import {
  clampPanelWidth,
  useCodeSnippetPanelStore,
} from "@/features/code-snippets/stores/useCodeSnippetPanelStore";
import { SnippetCodeEditor } from "@/features/code-snippets/components/SnippetCodeEditor";
import { copyTextToClipboard } from "@/features/code-snippets/utils/clipboard";
import type { SnippetLanguage } from "@/features/code-snippets/types";
import type { ApiRequest, Environment } from "@/services/db";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const COLLAPSED_WIDTH = 68;
const MIN_WIDTH = 320;

interface Props {
  request?: ApiRequest | null;
  environment?: Environment | null;
}

export function CodeSnippetPanel({ request, environment }: Props) {
  const selectedLanguage = useCodeSnippetPanelStore((state) => state.selectedLanguage);
  const setSelectedLanguage = useCodeSnippetPanelStore((state) => state.setSelectedLanguage);
  const persistedWidth = useCodeSnippetPanelStore((state) => state.panelWidth);
  const setPersistedWidth = useCodeSnippetPanelStore((state) => state.setPanelWidth);
  const collapsed = useCodeSnippetPanelStore((state) => state.collapsed);
  const toggleCollapsed = useCodeSnippetPanelStore((state) => state.toggleCollapsed);
  const wrapLines = useCodeSnippetPanelStore((state) => state.wrapLines);
  const setWrapLines = useCodeSnippetPanelStore((state) => state.setWrapLines);
  const fullscreen = useCodeSnippetPanelStore((state) => state.fullscreen);
  const setFullscreen = useCodeSnippetPanelStore((state) => state.setFullscreen);
  const generated = useGeneratedSnippet(request, environment);
  const [copied, setCopied] = useState(false);
  const [panelWidth, setPanelWidth] = useState(persistedWidth);
  const widthRef = useRef(persistedWidth);

  useEffect(() => {
    const nextWidth = clampInlineWidth(persistedWidth);
    setPanelWidth(nextWidth);
    widthRef.current = nextWidth;
  }, [persistedWidth]);

  useEffect(() => {
    const onResize = () => {
      const nextWidth = clampInlineWidth(widthRef.current);
      widthRef.current = nextWidth;
      setPanelWidth(nextWidth);
      setPersistedWidth(nextWidth);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setPersistedWidth]);

  const activeMeta = generated.meta;
  const panelWidthPx = collapsed ? COLLAPSED_WIDTH : panelWidth;

  const requestSummary = useMemo(() => {
    if (!request) return "Select a request to generate code";
    return `${request.method} · ${request.name || "Untitled request"}`;
  }, [request]);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(generated.code);
      setCopied(true);
      toast.success(`Copied ${activeMeta.label} snippet`, {
        description: request ? request.name || "Untitled request" : "No active request",
      });
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Unable to copy snippet");
    }
  };

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (collapsed) return;
    const startX = event.clientX;
    const startWidth = widthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      const next = clampInlineWidth(startWidth + delta);
      widthRef.current = next;
      setPanelWidth(next);
    };

    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setPersistedWidth(widthRef.current);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <>
      <motion.aside
        initial={false}
        animate={{ width: panelWidthPx, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.9 }}
        className="relative flex h-full shrink-0 border-l border-white/40 bg-[linear-gradient(180deg,rgba(244,244,245,0.4),rgba(244,244,245,0.18))] backdrop-blur-2xl"
      >
        {!collapsed && (
          <button
            type="button"
            onPointerDown={startResize}
            className="absolute inset-y-0 left-0 z-30 flex w-3 -translate-x-1/2 items-center justify-center text-muted-foreground/60 transition hover:text-foreground"
            aria-label="Resize code snippet panel"
          >
            <span className="flex h-16 w-2 items-center justify-center rounded-full bg-white/70 shadow-[0_12px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          </button>
        )}

        {collapsed ? (
          <CollapsedRail
            languageLabel={activeMeta.label}
            onExpand={toggleCollapsed}
            onCopy={handleCopy}
            copied={copied}
          />
        ) : (
          <PanelSurface
            activeMeta={activeMeta}
            code={generated.code}
            hasRequest={!!request}
            requestSummary={requestSummary}
            selectedLanguage={selectedLanguage}
            onSelectLanguage={setSelectedLanguage}
            onCopy={handleCopy}
            copied={copied}
            onToggleCollapse={toggleCollapsed}
            wrapLines={wrapLines}
            onWrapLinesChange={setWrapLines}
            fullscreen={false}
            onToggleFullscreen={() => setFullscreen(true)}
            environment={environment ?? null}
          />
        )}
      </motion.aside>

      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/24 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ x: 48, opacity: 0.6, scale: 0.98 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: 48, opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 230, damping: 28 }}
              className="h-[calc(100vh-2rem)] w-full max-w-[min(960px,calc(100vw-2rem))]"
            >
              <PanelSurface
                activeMeta={activeMeta}
                code={generated.code}
                hasRequest={!!request}
                requestSummary={requestSummary}
                selectedLanguage={selectedLanguage}
                onSelectLanguage={setSelectedLanguage}
                onCopy={handleCopy}
                copied={copied}
                onToggleCollapse={toggleCollapsed}
                wrapLines={wrapLines}
                onWrapLinesChange={setWrapLines}
                fullscreen
                onToggleFullscreen={() => setFullscreen(false)}
                environment={environment ?? null}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function PanelSurface({
  activeMeta,
  code,
  hasRequest,
  requestSummary,
  selectedLanguage,
  onSelectLanguage,
  onCopy,
  copied,
  onToggleCollapse,
  wrapLines,
  onWrapLinesChange,
  fullscreen,
  onToggleFullscreen,
  environment,
}: {
  activeMeta: (typeof snippetGenerators)[number]["meta"];
  code: string;
  hasRequest: boolean;
  requestSummary: string;
  selectedLanguage: string;
  onSelectLanguage: (value: SnippetLanguage) => void;
  onCopy: () => void;
  copied: boolean;
  onToggleCollapse: () => void;
  wrapLines: boolean;
  onWrapLinesChange: (value: boolean) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  environment: Environment | null;
}) {
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/45 bg-white/40 px-4 py-3 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl border border-white/60 bg-white/70 text-foreground shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
              <Code2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">Code snippets</div>
              <div className="truncate text-[11px] text-muted-foreground">{requestSummary}</div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span
              className={cn(
                "rounded-full px-2 py-1 text-foreground shadow-sm",
                `bg-gradient-to-r ${activeMeta.accent}`,
              )}
            >
              {activeMeta.family}
            </span>
            {environment && (
              <span className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-foreground/80">
                {environment.name}
              </span>
            )}
            <span>{activeMeta.description}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="grid h-9 w-9 place-items-center rounded-2xl border border-white/60 bg-white/70 text-muted-foreground shadow-sm transition hover:bg-white hover:text-foreground"
            title={fullscreen ? "Exit fullscreen" : "Open fullscreen"}
          >
            {fullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
          </button>
          {!fullscreen && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="grid h-9 w-9 place-items-center rounded-2xl border border-white/60 bg-white/70 text-muted-foreground shadow-sm transition hover:bg-white hover:text-foreground"
              title="Collapse snippets"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          {fullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="grid h-9 w-9 place-items-center rounded-2xl border border-white/60 bg-white/70 text-muted-foreground shadow-sm transition hover:bg-white hover:text-foreground"
              title="Close fullscreen"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-white/45 bg-white/30 px-4 py-3 backdrop-blur-xl">
        <Select value={selectedLanguage} onValueChange={onSelectLanguage}>
          <SelectTrigger className="h-10 min-w-[220px] rounded-2xl border-white/60 bg-white/75 text-xs shadow-sm">
            <SelectValue placeholder="Choose language" />
          </SelectTrigger>
          <SelectContent className="rounded-2xl border-white/60 bg-white/92 backdrop-blur-2xl">
            {snippetGenerators.map((generator) => (
              <SelectItem
                key={generator.meta.id}
                value={generator.meta.id}
                className="rounded-xl py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {generator.meta.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {generator.meta.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/60 bg-white/75 px-3.5 text-xs font-semibold text-foreground shadow-sm transition hover:bg-white"
        >
          {copied ? (
            <Check className="h-4 w-4 text-[var(--status-success)]" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? "Copied" : "Copy snippet"}
          <kbd className="rounded-lg border border-white/70 bg-white/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘⇧Y
          </kbd>
        </button>

        <div className="ml-auto rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-[11px] text-muted-foreground shadow-sm">
          {hasRequest ? "Live updates enabled" : "Waiting for an active request"}
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <SnippetCodeEditor
          language={activeMeta.monacoLanguage}
          code={code}
          wrapLines={wrapLines}
          onWrapLinesChange={onWrapLinesChange}
          fullscreen={fullscreen}
        />
      </div>
    </div>
  );
}

function CollapsedRail({
  languageLabel,
  onExpand,
  onCopy,
  copied,
}: {
  languageLabel: string;
  onExpand: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-between py-4">
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onExpand}
          className="grid h-11 w-11 place-items-center rounded-2xl border border-white/60 bg-white/75 text-foreground shadow-[0_14px_28px_rgba(15,23,42,0.08)] transition hover:bg-white"
          title="Expand code snippet panel (⌘⇧C)"
        >
          <Code2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onExpand}
          className="grid h-9 w-9 place-items-center rounded-2xl border border-white/60 bg-white/70 text-muted-foreground shadow-sm transition hover:bg-white hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="flex rotate-180 flex-col items-center gap-3 [writing-mode:vertical-rl]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {languageLabel}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="grid h-9 w-9 place-items-center rounded-2xl border border-white/60 bg-white/70 text-muted-foreground shadow-sm transition hover:bg-white hover:text-foreground"
          title="Copy current snippet"
        >
          {copied ? (
            <Check className="h-4 w-4 text-[var(--status-success)]" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

function clampInlineWidth(width: number) {
  if (typeof window === "undefined") return clampPanelWidth(width);
  const maxWidth = Math.max(MIN_WIDTH, Math.min(820, Math.round(window.innerWidth * 0.56)));
  return Math.max(MIN_WIDTH, Math.min(maxWidth, clampPanelWidth(width)));
}
