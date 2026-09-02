import { lazy, Suspense, type ComponentType } from "react";
import { useStore } from "@/stores/useStore";
import { useLazyMount } from "@/hooks/useLazyMount";

const PromptDialog: ComponentType | null = import.meta.env.SSR
  ? null
  : lazy(() => import("@/components/PromptDialog").then((m) => ({ default: m.PromptDialog })));

export function LazyPromptDialog() {
  const open = useStore((s) => s.promptRequest !== null);
  const mounted = useLazyMount(open);
  if (!PromptDialog || !mounted) return null;
  return (
    <Suspense fallback={null}>
      <PromptDialog />
    </Suspense>
  );
}
