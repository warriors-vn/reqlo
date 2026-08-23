import { lazy, Suspense, type ComponentType } from "react";
import { useStore } from "@/stores/useStore";
import { useLazyMount } from "@/hooks/useLazyMount";

const EnvironmentSwitcher: ComponentType | null = import.meta.env.SSR
  ? null
  : lazy(() =>
      import("@/components/EnvironmentSwitcher").then((m) => ({ default: m.EnvironmentSwitcher })),
    );

export function LazyEnvironmentSwitcher() {
  const open = useStore((s) => s.overlays["env-switcher"]);
  const mounted = useLazyMount(open);
  if (!EnvironmentSwitcher || !mounted) return null;
  return (
    <Suspense fallback={null}>
      <EnvironmentSwitcher />
    </Suspense>
  );
}
