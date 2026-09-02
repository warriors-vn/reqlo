import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { useStore } from "@/stores/useStore";

/** Renders confirmations requested imperatively via requestConfirm() — the
 * styled replacement for window.confirm() used by command-palette actions
 * that have no owning component of their own to hold dialog state (unlike
 * Sidebar/ResponseViewer, which own their delete/overwrite confirmations
 * locally). Reuses ConfirmDeleteDialog's destructive styling, since every
 * caller so far (delete, restore-workspace) is a destructive action. */
export function GlobalConfirmDialog() {
  const request = useStore((s) => s.confirmRequest);
  const resolveConfirm = useStore((s) => s.resolveConfirm);

  return (
    <ConfirmDeleteDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) resolveConfirm(false);
      }}
      title={request?.title ?? ""}
      description={request?.description ?? ""}
      confirmLabel={request?.confirmLabel}
      onConfirm={() => resolveConfirm(true)}
    />
  );
}
