import { lazy, Suspense, type ComponentProps, type ComponentType } from "react";
import type { ConfirmDeleteDialog as ConfirmDeleteDialogComponent } from "@/components/ConfirmDeleteDialog";
import { useLazyMount } from "@/hooks/useLazyMount";

type Props = ComponentProps<typeof ConfirmDeleteDialogComponent>;

const ConfirmDeleteDialog: ComponentType<Props> | null = import.meta.env.SSR
  ? null
  : lazy(() =>
      import("@/components/ConfirmDeleteDialog").then((m) => ({
        default: m.ConfirmDeleteDialog,
      })),
    );

export function LazyConfirmDeleteDialog(props: Props) {
  const mounted = useLazyMount(props.open);
  if (!ConfirmDeleteDialog || !mounted) return null;
  return (
    <Suspense fallback={null}>
      <ConfirmDeleteDialog {...props} />
    </Suspense>
  );
}
