export interface RunnerOptions {
  /** Pause between one request finishing and the next starting. */
  delayMs: number;
  /** Stop the run at the first request that fails instead of carrying on. */
  stopOnFailure: boolean;
}

export const DEFAULT_RUNNER_OPTIONS: RunnerOptions = { delayMs: 0, stopOnFailure: false };
export const MAX_RUNNER_DELAY_MS = 60_000;

const STORAGE_KEY = "reqlo.runner-options";

export function clampDelay(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.round(value), MAX_RUNNER_DELAY_MS);
}

/** Remembered across runs — a run starts the moment it is opened, so the
 * options can only ever be the ones chosen last time. Storage can be blocked
 * or full; the defaults are a fine answer to either. */
export function loadRunnerOptions(): RunnerOptions {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<RunnerOptions>;
    return {
      delayMs: clampDelay(Number(raw?.delayMs ?? 0)),
      stopOnFailure: raw?.stopOnFailure === true,
    };
  } catch {
    return { ...DEFAULT_RUNNER_OPTIONS };
  }
}

export function saveRunnerOptions(options: RunnerOptions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // Not remembering is harmless.
  }
}
