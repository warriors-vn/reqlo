import { lazy, Suspense, type ComponentType } from "react";
import { useStore } from "@/stores/useStore";
import { useLazyMount } from "@/hooks/useLazyMount";

const SettingsModal: ComponentType | null = import.meta.env.SSR
  ? null
  : lazy(() => import("@/components/SettingsModal").then((m) => ({ default: m.SettingsModal })));

export function LazySettingsModal() {
  const open = useStore((s) => s.overlays.settings);
  const mounted = useLazyMount(open);
  if (!SettingsModal || !mounted) return null;
  return (
    <Suspense fallback={null}>
      <SettingsModal />
    </Suspense>
  );
}
