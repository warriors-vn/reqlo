import { Overlay } from "./Overlay";
import { useStore } from "@/stores/useStore";
import { RequestHistoryPanel } from "@/features/request-history/components/RequestHistoryPanel";

export function HistoryDrawer() {
  const open = useStore((s) => s.overlays.history);
  const close = () => useStore.getState().closeOverlay("history");
  const history = useStore((s) => s.history);

  return (
    <Overlay
      open={open}
      onClose={close}
      title="History"
      subtitle={`${history.length} executions`}
      maxW="max-w-6xl"
    >
      <RequestHistoryPanel />
    </Overlay>
  );
}
