import { lazy, Suspense, type ComponentType } from "react";
import { useStore } from "@/stores/useStore";
import { useLazyMount } from "@/hooks/useLazyMount";

const ImportCurlModal: ComponentType | null = import.meta.env.SSR
  ? null
  : lazy(() =>
      import("@/components/ImportCurlModal").then((m) => ({ default: m.ImportCurlModal })),
    );

export function LazyImportCurlModal() {
  const open = useStore((s) => s.overlays["import-curl"]);
  const mounted = useLazyMount(open);
  if (!ImportCurlModal || !mounted) return null;
  return (
    <Suspense fallback={null}>
      <ImportCurlModal />
    </Suspense>
  );
}
