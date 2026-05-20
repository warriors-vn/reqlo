import Editor from "@monaco-editor/react";
import type { editor as MonacoEditor, IDisposable } from "monaco-editor";
import { ChevronDown, ChevronUp, Search, WrapText, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMonacoSnippetTheme } from "@/features/code-snippets/hooks/useMonacoSnippetTheme";
import { cn } from "@/lib/utils";

interface Props {
  language: string;
  code: string;
  wrapLines: boolean;
  onWrapLinesChange: (value: boolean) => void;
  fullscreen?: boolean;
}

export function SnippetCodeEditor({
  language,
  code,
  wrapLines,
  onWrapLinesChange,
  fullscreen = false,
}: Props) {
  const theme = useMonacoSnippetTheme();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const actionRef = useRef<IDisposable | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  const editorHeight = fullscreen ? "calc(100vh - 14rem)" : "100%";

  const matches = useMemo(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !searchQuery.trim()) return [];
    return model.findMatches(searchQuery, true, false, false, null, true);
  }, [searchQuery]);

  useEffect(() => {
    setMatchCount(matches.length);
    if (!matches.length) {
      setActiveMatchIndex(0);
      return;
    }
    setActiveMatchIndex((current) => Math.min(current, matches.length - 1));
  }, [matches]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;

    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      matches.map((match, index) => ({
        range: match.range,
        options: {
          className:
            index === activeMatchIndex ? "reqlo-snippet-match-active" : "reqlo-snippet-match",
          inlineClassName:
            index === activeMatchIndex
              ? "reqlo-snippet-match-active-inline"
              : "reqlo-snippet-match-inline",
        },
      })),
    );

    const current = matches[activeMatchIndex];
    if (current) {
      editor.setSelection(current.range);
      editor.revealRangeInCenter(current.range);
    }
  }, [activeMatchIndex, matches]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setScrollTop(0);
    editor.setPosition({ lineNumber: 1, column: 1 });
  }, [code, language]);

  useEffect(() => {
    if (!searchOpen) return;
    queryInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    return () => {
      actionRef.current?.dispose();
    };
  }, []);

  const moveMatch = (direction: "next" | "prev") => {
    if (!matches.length) return;
    setActiveMatchIndex((current) => {
      if (direction === "next") return (current + 1) % matches.length;
      return (current - 1 + matches.length) % matches.length;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.76),rgba(255,255,255,0.48))] shadow-[0_22px_60px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/50 bg-white/50 px-3 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full border border-white/60 bg-white/70 px-2.5 py-1 font-semibold uppercase tracking-[0.18em] text-foreground/75">
            {language}
          </span>
          <span>{code.split("\n").length} lines</span>
        </div>

        <div className="flex items-center gap-1.5">
          {searchOpen && (
            <div className="flex items-center gap-1 rounded-2xl border border-white/60 bg-white/75 px-2 py-1 shadow-sm">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                ref={queryInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    moveMatch(event.shiftKey ? "prev" : "next");
                  }
                  if (event.key === "Escape") {
                    setSearchOpen(false);
                    setSearchQuery("");
                  }
                }}
                placeholder="Search snippet"
                className="w-32 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/70"
              />
              <span className="min-w-[42px] text-right font-mono text-[10px] text-muted-foreground">
                {matchCount ? `${activeMatchIndex + 1}/${matchCount}` : "0"}
              </span>
              <button
                type="button"
                onClick={() => moveMatch("prev")}
                className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveMatch("next")}
                className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
                className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {!searchOpen && (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex h-8 items-center gap-1 rounded-2xl border border-white/60 bg-white/70 px-3 text-[11px] font-medium text-muted-foreground transition hover:bg-white hover:text-foreground"
            >
              <Search className="h-3.5 w-3.5" /> Search
            </button>
          )}

          <button
            type="button"
            onClick={() => onWrapLinesChange(!wrapLines)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-2xl border px-3 text-[11px] font-medium transition",
              wrapLines
                ? "border-primary/20 bg-primary/10 text-primary"
                : "border-white/60 bg-white/70 text-muted-foreground hover:bg-white hover:text-foreground",
            )}
          >
            <WrapText className="h-3.5 w-3.5" /> Wrap
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Editor
          height={editorHeight}
          language={language}
          value={code}
          theme={theme}
          beforeMount={(monaco) => {
            monaco.editor.defineTheme("reqlo-snippet-light", {
              base: "vs",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#FFFFFF00",
                "editor.lineHighlightBackground": "#F4F4F540",
                "editorLineNumber.foreground": "#98A2B3",
                "editor.selectionBackground": "#D9E6FF99",
                "editor.inactiveSelectionBackground": "#E9EEF599",
              },
            });
            monaco.editor.defineTheme("reqlo-snippet-dark", {
              base: "vs-dark",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#02061700",
                "editor.lineHighlightBackground": "#0F172A55",
                "editorLineNumber.foreground": "#64748B",
                "editor.selectionBackground": "#1D4ED880",
                "editor.inactiveSelectionBackground": "#0F172A80",
              },
            });
          }}
          onMount={(editor) => {
            editorRef.current = editor;
            actionRef.current?.dispose();
            actionRef.current = editor.addAction({
              id: "reqlo-snippet-search",
              label: "Search snippet",
              keybindings: [],
              run: () => setSearchOpen(true),
            });
          }}
          loading={
            <div className="grid h-full place-items-center text-xs text-muted-foreground">
              Loading editor…
            </div>
          }
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontFamily: "var(--font-mono)",
            fontLigatures: true,
            fontSize: fullscreen ? 13 : 12,
            wordWrap: wrapLines ? "on" : "off",
            lineNumbers: "on",
            roundedSelection: true,
            scrollBeyondLastLine: false,
            overviewRulerBorder: false,
            renderLineHighlightOnlyWhenFocus: true,
            lineDecorationsWidth: 10,
            glyphMargin: false,
            folding: false,
            automaticLayout: true,
            padding: { top: 16, bottom: 24 },
            smoothScrolling: true,
            cursorStyle: "line-thin",
            cursorBlinking: "solid",
            renderValidationDecorations: "off",
          }}
        />
      </div>
    </div>
  );
}
