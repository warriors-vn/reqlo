import { describe, expect, it } from "vitest";
import { useStore } from "@/stores/useStore";

// requestPrompt/requestConfirm are the styled window.prompt()/window.confirm()
// replacements PromptDialog/GlobalConfirmDialog render — pure in-memory state,
// no IndexedDB involved, so these are exercised directly against the store.

describe("requestPrompt / resolvePrompt", () => {
  it("resolves the pending promise with the value passed to resolvePrompt", async () => {
    const promise = useStore.getState().requestPrompt({ title: "Rename", defaultValue: "old" });
    expect(useStore.getState().promptRequest?.title).toBe("Rename");
    expect(useStore.getState().promptRequest?.defaultValue).toBe("old");

    useStore.getState().resolvePrompt("new name");

    await expect(promise).resolves.toBe("new name");
    expect(useStore.getState().promptRequest).toBeNull();
  });

  it("resolves to null when cancelled", async () => {
    const promise = useStore.getState().requestPrompt({ title: "Rename", defaultValue: "old" });
    useStore.getState().resolvePrompt(null);
    await expect(promise).resolves.toBeNull();
  });

  it("resolving with no pending request is a no-op, not a crash", () => {
    expect(useStore.getState().promptRequest).toBeNull();
    expect(() => useStore.getState().resolvePrompt("whatever")).not.toThrow();
  });

  it("a second requestPrompt call replaces the first — only the newest resolver fires", async () => {
    const first = useStore.getState().requestPrompt({ title: "First", defaultValue: "" });
    const second = useStore.getState().requestPrompt({ title: "Second", defaultValue: "" });

    useStore.getState().resolvePrompt("answer");

    await expect(second).resolves.toBe("answer");
    // The first promise is simply left unsettled by design — nothing else in
    // the app awaits it once superseded — but it must not also fire.
    let firstSettled = false;
    void first.then(() => {
      firstSettled = true;
    });
    await Promise.resolve();
    expect(firstSettled).toBe(false);
  });
});

describe("requestConfirm / resolveConfirm", () => {
  it("resolves true on confirm, false on cancel", async () => {
    const confirmed = useStore.getState().requestConfirm({ title: "Delete this?" });
    expect(useStore.getState().confirmRequest?.title).toBe("Delete this?");
    useStore.getState().resolveConfirm(true);
    await expect(confirmed).resolves.toBe(true);
    expect(useStore.getState().confirmRequest).toBeNull();

    const cancelled = useStore.getState().requestConfirm({ title: "Delete this?" });
    useStore.getState().resolveConfirm(false);
    await expect(cancelled).resolves.toBe(false);
  });

  it("carries an optional description and confirmLabel through to the dialog state", () => {
    void useStore.getState().requestConfirm({
      title: "Restore backup?",
      description: "This replaces the current workspace.",
      confirmLabel: "Restore",
    });
    const req = useStore.getState().confirmRequest;
    expect(req?.description).toBe("This replaces the current workspace.");
    expect(req?.confirmLabel).toBe("Restore");
    useStore.getState().resolveConfirm(false);
  });
});
