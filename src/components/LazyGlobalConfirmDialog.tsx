import { lazy, Suspense, type ComponentType } from "react";
import { useStore } from "@/stores/useStore";
import { useLazyMount } from "@/hooks/useLazyMount";

const GlobalConfirmDialog: ComponentType | null = import.meta.env.SSR
  ? null
  : lazy(() =>
      import("@/components/GlobalConfirmDialog").then((m) => ({
        default: m.GlobalConfirmDialog,
      })),
    );

export function LazyGlobalConfirmDialog() {
  const open = useStore((s) => s.confirmRequest !== null);
  const mounted = useLazyMount(open);
  if (!GlobalConfirmDialog || !mounted) return null;
  return (
    <Suspense fallback={null}>
      <GlobalConfirmDialog />
    </Suspense>
  );
}
