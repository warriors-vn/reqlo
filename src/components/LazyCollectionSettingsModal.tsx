import { lazy, Suspense, type ComponentType } from "react";
import { useStore } from "@/stores/useStore";
import { useLazyMount } from "@/hooks/useLazyMount";

const CollectionSettingsModal: ComponentType | null = import.meta.env.SSR
  ? null
  : lazy(() =>
      import("@/components/CollectionSettingsModal").then((m) => ({
        default: m.CollectionSettingsModal,
      })),
    );

export function LazyCollectionSettingsModal() {
  const open = useStore((s) => s.overlays["collection-settings"]);
  const mounted = useLazyMount(open);
  if (!CollectionSettingsModal || !mounted) return null;
  return (
    <Suspense fallback={null}>
      <CollectionSettingsModal />
    </Suspense>
  );
}
