import { lazy, Suspense, type ComponentType } from "react";
import { useStore } from "@/stores/useStore";
import { useLazyMount } from "@/hooks/useLazyMount";

const CollectionRunnerModal: ComponentType | null = import.meta.env.SSR
  ? null
  : lazy(() =>
      import("@/components/CollectionRunnerModal").then((m) => ({
        default: m.CollectionRunnerModal,
      })),
    );

export function LazyCollectionRunnerModal() {
  const open = useStore((s) => s.overlays.runner);
  const mounted = useLazyMount(open);
  if (!CollectionRunnerModal || !mounted) return null;
  return (
    <Suspense fallback={null}>
      <CollectionRunnerModal />
    </Suspense>
  );
}
