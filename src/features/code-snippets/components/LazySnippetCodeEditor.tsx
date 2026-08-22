import { lazy, Suspense, type ComponentType } from "react";
import type { ComponentProps } from "react";
import type { SnippetCodeEditor as SnippetCodeEditorComponent } from "@/features/code-snippets/components/SnippetCodeEditor";

type Props = ComponentProps<typeof SnippetCodeEditorComponent>;

// `import.meta.env.SSR` is a Vite-replaced compile-time constant, so this branch
// is dead code (and its dynamic import) is fully stripped from the SSR build —
// monaco-editor never mounts server-side, and the Cloudflare Worker bundle never
// ships its ~7MB source for a code path it can't reach anyway.
const SnippetCodeEditor: ComponentType<Props> | null = import.meta.env.SSR
  ? null
  : lazy(() =>
      import("@/features/code-snippets/components/SnippetCodeEditor").then((module) => ({
        default: module.SnippetCodeEditor,
      })),
    );

export function LazySnippetCodeEditor(props: Props) {
  if (!SnippetCodeEditor) return <EditorFallback fullscreen={props.fullscreen} />;
  return (
    <Suspense fallback={<EditorFallback fullscreen={props.fullscreen} />}>
      <SnippetCodeEditor {...props} />
    </Suspense>
  );
}

function EditorFallback({ fullscreen }: { fullscreen?: boolean }) {
  return (
    <div
      style={{ height: fullscreen ? "calc(100vh - 14rem)" : "100%" }}
      className="grid place-items-center rounded-[26px] border border-[var(--border)]/50 bg-[var(--surface-elevated)]/40 text-xs text-muted-foreground backdrop-blur-2xl"
    >
      Loading editor…
    </div>
  );
}
