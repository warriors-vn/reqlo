import { afterEach, describe, expect, it, vi } from "vitest";
import { startTabPresence } from "@/lib/tab-presence";

/** Delivers to every other instance on the same name, like the real thing. */
class FakeChannel {
  static all: FakeChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(readonly name: string) {
    FakeChannel.all.push(this);
  }
  postMessage(data: unknown) {
    for (const other of FakeChannel.all) {
      if (other !== this && other.name === this.name) {
        queueMicrotask(() => other.onmessage?.({ data } as MessageEvent));
      }
    }
  }
  close() {
    FakeChannel.all = FakeChannel.all.filter((c) => c !== this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeChannel.all = [];
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("startTabPresence", () => {
  it("tells both tabs about each other", async () => {
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    // The module guards against starting twice per page, so each "tab" gets its
    // own copy of it — as two real pages would.
    vi.resetModules();
    const tabOne = await import("@/lib/tab-presence");
    vi.resetModules();
    const tabTwo = await import("@/lib/tab-presence");

    const one = vi.fn();
    const two = vi.fn();
    const stopOne = tabOne.startTabPresence(one);
    await flush();
    expect(one).not.toHaveBeenCalled();

    const stopTwo = tabTwo.startTabPresence(two);
    await flush();
    expect(one).toHaveBeenCalled();
    expect(two).toHaveBeenCalled();
    stopOne();
    stopTwo();
  });

  it("stays quiet when it is the only tab", async () => {
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const onOtherTab = vi.fn();
    const stop = startTabPresence(onOtherTab);
    await flush();
    expect(onOtherTab).not.toHaveBeenCalled();
    stop();
  });

  it("does nothing where BroadcastChannel doesn't exist", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    expect(() => startTabPresence(vi.fn())()).not.toThrow();
  });
});
