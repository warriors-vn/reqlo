/**
 * Notices when reqlo is open in more than one tab of this browser.
 *
 * Each tab loads the workspace from IndexedDB once and never re-reads it, so
 * an edit in one tab is invisible in the other — and the other tab's next edit
 * of the same request writes its stale fields back over it. Keeping the tabs
 * in sync is a bigger change; telling the user is the part that stops the
 * silent data loss.
 */
const CHANNEL = "reqlo-tabs";

type Message = { type: "hello" | "here"; from: string };

let started = false;

/** Calls `onOtherTab` each time another tab announces itself, or answers ours.
 * Returns a stop function. A browser without BroadcastChannel gets a no-op. */
export function startTabPresence(onOtherTab: () => void): () => void {
  if (started || typeof BroadcastChannel === "undefined") return () => undefined;
  started = true;

  const me = Math.random().toString(36).slice(2);
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent<Message>) => {
    const message = event.data;
    if (!message || message.from === me) return;
    onOtherTab();
    // A tab that was here first hears our hello and answers, so the newcomer
    // learns about it too — the warning shows in both.
    if (message.type === "hello") channel.postMessage({ type: "here", from: me } satisfies Message);
  };
  channel.postMessage({ type: "hello", from: me } satisfies Message);

  return () => {
    channel.close();
    started = false;
  };
}
