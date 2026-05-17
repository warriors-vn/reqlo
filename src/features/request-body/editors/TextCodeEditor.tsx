import Editor from "@monaco-editor/react";
import { Sparkles, WrapText } from "lucide-react";
import { useMemo } from "react";
import { useRequestBodyStore } from "@/features/request-body/stores/useRequestBodyStore";
import type { BodyEditorValidation } from "@/features/request-body/types";
import { cn } from "@/lib/utils";

interface Props {
  language: "json" | "plaintext" | "xml";
  value: string;
  onChange: (value: string) => void;
  onFormat?: () => void;
  placeholder?: string;
  validation?: BodyEditorValidation | null;
  minHeight?: number;
}

export function TextCodeEditor({
  language,
  value,
  onChange,
  onFormat,
  placeholder,
  validation,
  minHeight = 280,
}: Props) {
  const wrapLines = useRequestBodyStore((state) => state.wrapLines);
  const fontSize = useRequestBodyStore((state) => state.fontSize);
  const showLineNumbers = useRequestBodyStore((state) => state.showLineNumbers);
  const setWrapLines = useRequestBodyStore((state) => state.setWrapLines);

  const validationTone = useMemo(() => {
    switch (validation?.tone) {
      case "success":
        return "text-[var(--status-success)] bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]";
      case "error":
        return "text-destructive bg-destructive/10";
      default:
        return "text-muted-foreground bg-muted/60";
    }
  }, [validation]);

  return (
    <div className="overflow-hidden rounded-[22px] border border-border/80 bg-background/80 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border/70 bg-[color-mix(in_oklab,var(--surface)_88%,transparent)] px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium uppercase tracking-[0.16em]">
            {language}
          </span>
          {validation && (
            <span className={cn("rounded-full px-2 py-0.5 font-medium", validationTone)}>
              {validation.label}
            </span>
          )}
          {validation?.detail && (
            <span className="truncate text-[10px] text-muted-foreground/80">
              {validation.detail}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onFormat && (
            <button
              onClick={onFormat}
              className="inline-flex h-8 items-center gap-1 rounded-xl px-2.5 text-[11px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5" /> Format
            </button>
          )}
          <button
            onClick={() => setWrapLines(!wrapLines)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-xl px-2.5 text-[11px] font-medium transition",
              wrapLines
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <WrapText className="h-3.5 w-3.5" /> Wrap
          </button>
        </div>
      </div>
      <div style={{ minHeight }}>
        <Editor
          height={minHeight}
          language={language}
          value={value}
          theme="vs-light"
          loading={
            <div className="grid h-full place-items-center text-xs text-muted-foreground">
              Loading editor…
            </div>
          }
          onChange={(next) => onChange(next ?? "")}
          beforeMount={(monaco) => {
            monaco.editor.defineTheme("reqlo-light", {
              base: "vs",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#FFFFFF00",
                "editor.lineHighlightBackground": "#F4F4F540",
                "editorLineNumber.foreground": "#9AA0AA",
                "editor.selectionBackground": "#DDE6FF",
                "editor.inactiveSelectionBackground": "#EBEEF580",
              },
            });
          }}
          options={{
            theme: "reqlo-light",
            minimap: { enabled: false },
            fontSize,
            wordWrap: wrapLines ? "on" : "off",
            lineNumbers: showLineNumbers ? "on" : "off",
            scrollBeyondLastLine: false,
            lineDecorationsWidth: 6,
            glyphMargin: false,
            padding: { top: 14, bottom: 14 },
            tabSize: 2,
            automaticLayout: true,
            overviewRulerBorder: false,
            roundedSelection: true,
            smoothScrolling: true,
            placeholder,
          }}
        />
      </div>
    </div>
  );
}
