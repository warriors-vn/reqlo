import { toast } from "sonner";
import type { RunTarget } from "@/services/runner";
import type { SliceCreator } from "@/stores/types";

// A monotonic counter, not Date.now() — two runs started within the same
// millisecond (e.g. an empty collection finishing instantly, then another
// starting) would otherwise mint identical tokens, and CollectionRunnerModal's
// "is this a new run" check is a strict inequality against the last token it saw.
let nextRunToken = 0;

export interface RunnerSlice {
  // set by startRun; CollectionRunnerModal watches the token to detect a new run
  runnerTarget: (RunTarget & { token: number }) | null;
  // the run currently executing (if any) — the single source of truth startRun
  // consults to refuse/queue overlapping runs, and CollectionRunnerModal's
  // loop consults for its AbortController and "is running" state. Its target
  // is whatever runnerTarget.token currently matches, not duplicated here.
  activeRun: { token: number; controller: AbortController } | null;

  startRun: (target: RunTarget) => void;
  stopRun: () => void;
  finishRun: (token: number) => void;
}

export const createRunnerSlice: SliceCreator<RunnerSlice> = (set, get) => ({
  runnerTarget: null,
  activeRun: null,

  startRun: (target) => {
    const { activeRun, runnerTarget } = get();
    if (activeRun) {
      const sameTarget = runnerTarget?.type === target.type && runnerTarget?.id === target.id;
      if (sameTarget) {
        // Already running this exact target — reopen the modal onto it rather
        // than starting a second concurrent loop over the same rows.
        set((s) => ({ overlays: { ...s.overlays, runner: true } }));
        return;
      }
      toast.warning("A run is already in progress", {
        description: "Stop the current run before starting a different one.",
      });
      return;
    }

    const token = ++nextRunToken;
    set((s) => ({
      runnerTarget: { ...target, token },
      activeRun: { token, controller: new AbortController() },
      overlays: { ...s.overlays, runner: true },
    }));
  },

  stopRun: () => {
    get().activeRun?.controller.abort();
  },

  finishRun: (token) => {
    set((s) => (s.activeRun?.token === token ? { activeRun: null } : {}));
  },
});
