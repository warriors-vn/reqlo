import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useStore } from "@/stores/useStore";
import { db } from "@/services/db";
import { parseCurl } from "@/services/curl";

// Mocked rather than left real: sonner's toast() needs a mounted <Toaster/>
// to render anywhere, which this pure-store test has none of. Mocking lets
// the "Undo" test invoke the *actual* action.onClick captured from the real
// applyCurlToRequest call, instead of a hand-copied restore that could pass
// even if the real button were wired to the wrong thing.
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
}));

const WORKSPACE_ID = "ws-1";

async function seedRequest(curl: string) {
  const req = parseCurl(curl, WORKSPACE_ID, null);
  await db.requests.add(req);
  useStore.setState({ requests: [req] });
  return req;
}

afterEach(async () => {
  await db.delete();
  await db.open();
  useStore.setState({ requests: [] });
  vi.mocked(toast).mockClear();
});

// The URL field's onPaste handler in RequestBuilder.tsx calls this to
// overwrite the request currently open, rather than importCurl's "create a
// new request" behavior — mirrors pasting a cURL command into Postman's URL
// bar.
describe("applyCurlToRequest", () => {
  it("overwrites the existing request's method/url/headers/body/auth in place", async () => {
    const original = await seedRequest("curl https://old.example.com/a");

    const applied = await useStore
      .getState()
      .applyCurlToRequest(
        original.id,
        `curl -X POST https://new.example.com/b -H 'X-Test: 1' -d '{"x":1}'`,
      );

    expect(applied).toBe(true);
    const updated = useStore.getState().requests.find((r) => r.id === original.id);
    expect(updated?.method).toBe("POST");
    expect(updated?.url).toBe("https://new.example.com/b");
    expect(updated?.headers.some((h) => h.key === "X-Test" && h.value === "1")).toBe(true);
    expect(updated?.body).toBe('{"x":1}');
    // Identity fields untouched by the overwrite.
    expect(updated?.id).toBe(original.id);
    expect(updated?.workspaceId).toBe(original.workspaceId);

    const persisted = await db.requests.get(original.id);
    expect(persisted?.url).toBe("https://new.example.com/b");
  });

  it("returns false and leaves the request untouched for text that isn't a real cURL command", async () => {
    const original = await seedRequest("curl https://old.example.com/a");

    const applied = await useStore.getState().applyCurlToRequest(original.id, "not a curl command");

    expect(applied).toBe(false);
    const unchanged = useStore.getState().requests.find((r) => r.id === original.id);
    expect(unchanged?.url).toBe(original.url);
  });

  it("returns false for an id that doesn't match any open request", async () => {
    const applied = await useStore
      .getState()
      .applyCurlToRequest("does-not-exist", "curl https://api.example.com");
    expect(applied).toBe(false);
  });

  it("toasts an Undo action whose onClick — the real one, not a stand-in — restores every overwritten field", async () => {
    const original = await seedRequest("curl https://old.example.com/a -H 'X-Old: yes'");

    await useStore
      .getState()
      .applyCurlToRequest(original.id, "curl -X PUT https://new.example.com/b");
    expect(useStore.getState().requests.find((r) => r.id === original.id)?.url).toBe(
      "https://new.example.com/b",
    );

    const call = vi
      .mocked(toast)
      .mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("Request replaced from pasted cURL"),
      );
    expect(call).toBeDefined();
    const options = call?.[1] as { action?: { onClick?: unknown } } | undefined;
    const onClick = options?.action?.onClick as (() => void) | undefined;
    expect(onClick).toBeTypeOf("function");

    onClick?.();
    // updateRequest's own write is async — the onClick fires it without
    // awaiting (matches the real "Undo" button, which can't await a click
    // handler either), so give its promise a tick to land before asserting.
    await Promise.resolve();
    await Promise.resolve();

    const restored = useStore.getState().requests.find((r) => r.id === original.id);
    expect(restored?.url).toBe(original.url);
    expect(restored?.method).toBe(original.method);
    expect(restored?.headers).toEqual(original.headers);
  });
});
