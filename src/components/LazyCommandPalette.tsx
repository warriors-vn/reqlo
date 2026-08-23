import { lazy, Suspense, type ComponentType } from "react";
import { useStore } from "@/stores/useStore";
import { useLazyMount } from "@/hooks/useLazyMount";

// Same SSR-stripping trick as LazyTextCodeEditor/LazySnippetCodeEditor: the palette
// is always closed on first server render (no server-side interaction can open it),
// so its bundle (cmdk, etc.) never needs to reach the Cloudflare Worker at all.
const CommandPalette: ComponentType | null = import.meta.env.SSR
  ? null
  : lazy(() => import("@/components/CommandPalette").then((m) => ({ default: m.CommandPalette })));

export function LazyCommandPalette() {
  const open = useStore((s) => s.overlays.palette);
  const mounted = useLazyMount(open);
  if (!CommandPalette || !mounted) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette />
    </Suspense>
  );
}
