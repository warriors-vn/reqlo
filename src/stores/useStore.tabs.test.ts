import { describe, expect, it } from "vitest";
import { useStore } from "@/stores/useStore";
import type { Tab } from "@/stores/types";

// reorderTabs backs TabBar's drag-to-reorder — pure array reordering, no
// IndexedDB involved, so it's exercised directly against the store.

function tabs(...ids: string[]): Tab[] {
  return ids.map((id) => ({ id, requestId: `req-${id}` }));
}

describe("reorderTabs", () => {
  it("moves the dragged tab to just before the target", () => {
    useStore.setState({ tabs: tabs("a", "b", "c", "d") });
    useStore.getState().reorderTabs("d", "b");
    expect(useStore.getState().tabs.map((t) => t.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("moves the dragged tab later when the target is after it", () => {
    useStore.setState({ tabs: tabs("a", "b", "c", "d") });
    useStore.getState().reorderTabs("a", "c");
    expect(useStore.getState().tabs.map((t) => t.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("is a no-op when dragging a tab onto itself", () => {
    useStore.setState({ tabs: tabs("a", "b", "c") });
    useStore.getState().reorderTabs("b", "b");
    expect(useStore.getState().tabs.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when either id doesn't exist", () => {
    useStore.setState({ tabs: tabs("a", "b", "c") });
    useStore.getState().reorderTabs("missing", "b");
    expect(useStore.getState().tabs.map((t) => t.id)).toEqual(["a", "b", "c"]);
    useStore.getState().reorderTabs("a", "missing");
    expect(useStore.getState().tabs.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});

describe("closeOtherTabs", () => {
  it("keeps only the given tab and makes it active", () => {
    useStore.setState({ tabs: tabs("a", "b", "c"), activeTabId: "a" });
    useStore.getState().closeOtherTabs("b");
    expect(useStore.getState().tabs.map((t) => t.id)).toEqual(["b"]);
    expect(useStore.getState().activeTabId).toBe("b");
  });

  it("is a no-op when the id doesn't exist", () => {
    useStore.setState({ tabs: tabs("a", "b"), activeTabId: "a" });
    useStore.getState().closeOtherTabs("missing");
    expect(useStore.getState().tabs.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("closeTabsToRight", () => {
  it("drops every tab after the given one, keeping the active tab if it survives", () => {
    useStore.setState({ tabs: tabs("a", "b", "c", "d"), activeTabId: "b" });
    useStore.getState().closeTabsToRight("b");
    expect(useStore.getState().tabs.map((t) => t.id)).toEqual(["a", "b"]);
    expect(useStore.getState().activeTabId).toBe("b");
  });

  it("re-activates the anchor tab when the active tab was closed", () => {
    useStore.setState({ tabs: tabs("a", "b", "c", "d"), activeTabId: "d" });
    useStore.getState().closeTabsToRight("b");
    expect(useStore.getState().tabs.map((t) => t.id)).toEqual(["a", "b"]);
    expect(useStore.getState().activeTabId).toBe("b");
  });

  it("is a no-op when the id doesn't exist", () => {
    useStore.setState({ tabs: tabs("a", "b"), activeTabId: "a" });
    useStore.getState().closeTabsToRight("missing");
    expect(useStore.getState().tabs.map((t) => t.id)).toEqual(["a", "b"]);
  });
});
