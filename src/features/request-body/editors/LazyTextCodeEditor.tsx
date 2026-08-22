import { lazy, Suspense, type ComponentType } from "react";
import type { ComponentProps } from "react";
import type { TextCodeEditor as TextCodeEditorComponent } from "@/features/request-body/editors/TextCodeEditor";

type Props = ComponentProps<typeof TextCodeEditorComponent>;

// `import.meta.env.SSR` is a Vite-replaced compile-time constant, so this branch
// is dead code (and its dynamic import) is fully stripped from the SSR build —
// monaco-editor never mounts server-side, and the Cloudflare Worker bundle never
// ships its ~7MB source for a code path it can't reach anyway.
const TextCodeEditor: ComponentType<Props> | null = import.meta.env.SSR
  ? null
  : lazy(() =>
      import("@/features/request-body/editors/TextCodeEditor").then((module) => ({
        default: module.TextCodeEditor,
      })),
    );

export function LazyTextCodeEditor(props: Props) {
  if (!TextCodeEditor) return <EditorFallback minHeight={props.minHeight} />;
  return (
    <Suspense fallback={<EditorFallback minHeight={props.minHeight} />}>
      <TextCodeEditor {...props} />
    </Suspense>
  );
}

function EditorFallback({ minHeight }: { minHeight?: number }) {
  return (
    <div
      style={{ minHeight: minHeight ?? 280 }}
      className="grid place-items-center rounded-[22px] border border-border/80 bg-background/80 text-xs text-muted-foreground"
    >
      Loading editor…
    </div>
  );
}
