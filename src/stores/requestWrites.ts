import { db, type ApiRequest } from "@/services/db";
import { reportDbWriteFailure } from "@/stores/shared";

/**
 * Persistence for request edits, coalesced per request.
 *
 * Editors call updateRequest on every change, and a body edit carries the whole
 * bodyDrafts object — writing each one to IndexedDB meant a ~1 MB structured
 * clone per keystroke in a large JSON body (and, on a quota error, a toast per
 * keystroke). The in-memory store still updates immediately; only the Dexie
 * write waits for the edits to settle, and later patches to the same request
 * are merged into one write.
 */
export const REQUEST_WRITE_DEBOUNCE_MS = 300;

type Patch = Partial<ApiRequest>;

interface Pending {
  patch: Patch;
  timer: ReturnType<typeof setTimeout>;
  waiters: { resolve: () => void; reject: (error: unknown) => void }[];
}

const pending = new Map<string, Pending>();

async function write(id: string, entry: Pending) {
  try {
    await reportDbWriteFailure(db.requests.update(id, entry.patch));
    entry.waiters.forEach((w) => w.resolve());
  } catch (error) {
    entry.waiters.forEach((w) => w.reject(error));
  }
}

/** Queue a patch; the returned promise settles once it has been written. */
export function queueRequestWrite(id: string, patch: Patch): Promise<void> {
  const existing = pending.get(id);
  if (existing) clearTimeout(existing.timer);
  const entry: Pending = existing ?? { patch: {}, timer: undefined as never, waiters: [] };
  entry.patch = { ...entry.patch, ...patch };
  entry.timer = setTimeout(() => void flushRequestWrites([id]), REQUEST_WRITE_DEBOUNCE_MS);
  pending.set(id, entry);
  return new Promise<void>((resolve, reject) => entry.waiters.push({ resolve, reject }));
}

/** Write everything queued now (or just these requests). Never rejects — a
 * failure is reported to the waiters and as a toast. */
export async function flushRequestWrites(ids?: readonly string[]): Promise<void> {
  const targets = (ids ?? [...pending.keys()]).filter((id) => pending.has(id));
  await Promise.all(
    targets.map((id) => {
      const entry = pending.get(id)!;
      clearTimeout(entry.timer);
      pending.delete(id);
      return write(id, entry).catch(() => undefined);
    }),
  );
}

/** Drop queued edits for requests that no longer exist. */
export function discardRequestWrites(ids: readonly string[]) {
  for (const id of ids) {
    const entry = pending.get(id);
    if (!entry) continue;
    clearTimeout(entry.timer);
    pending.delete(id);
    entry.waiters.forEach((w) => w.resolve());
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushRequestWrites();
  });
  window.addEventListener("pagehide", () => void flushRequestWrites());
}
