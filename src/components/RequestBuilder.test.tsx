// @vitest-environment jsdom
import "@/test/setup-dom";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequestBuilder } from "@/components/RequestBuilder";
import { useStore } from "@/stores/useStore";
import { createEmptyKV, normalizeApiRequest, uid, type ApiRequest } from "@/services/db";

function seedRequest(): ApiRequest {
  const now = Date.now();
  const request = normalizeApiRequest({
    id: uid(),
    workspaceId: "ws-1",
    name: "Req",
    method: "GET",
    url: "https://api.example.com",
    queryParams: [createEmptyKV()],
    headers: [createEmptyKV()],
    createdAt: now,
    updatedAt: now,
  });
  useStore.setState({ requests: [request], environments: [], activeEnvId: null, workspace: null });
  return request;
}

// The store's request array is the only source of truth this test cares
// about — re-reading it on every render (like Workspace.tsx's own
// `activeRequest` derivation) is what proves a tab switch didn't drop data
// into some local, unmounted piece of component state instead.
function Wrapper({ requestId }: { requestId: string }) {
  const request = useStore((s) => s.requests.find((r) => r.id === requestId));
  if (!request) return null;
  return <RequestBuilder request={request} onSend={() => {}} onCancel={() => {}} sending={false} />;
}

describe("RequestBuilder — Params/Headers survive a tab switch", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps a typed param key after switching to Headers and back", async () => {
    const request = seedRequest();
    const user = userEvent.setup();
    render(<Wrapper requestId={request.id} />);

    await user.type(screen.getByPlaceholderText("key"), "foo");
    expect(useStore.getState().requests[0].queryParams[0].key).toBe("foo");

    await user.click(screen.getByRole("tab", { name: /^Headers/ }));
    expect(screen.queryByPlaceholderText("key")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^Params/ }));
    expect(screen.getByPlaceholderText("key")).toHaveValue("foo");
  });

  it("keeps a typed header key after switching to Params and back", async () => {
    const request = seedRequest();
    const user = userEvent.setup();
    render(<Wrapper requestId={request.id} />);

    await user.click(screen.getByRole("tab", { name: /^Headers/ }));
    await user.type(screen.getByPlaceholderText("Header"), "X-Test");
    expect(useStore.getState().requests[0].headers[0].key).toBe("X-Test");

    await user.click(screen.getByRole("tab", { name: /^Params/ }));
    await user.click(screen.getByRole("tab", { name: /^Headers/ }));
    expect(screen.getByPlaceholderText("Header")).toHaveValue("X-Test");
  });

  it("keeps both Params and Headers edits independent of each other", async () => {
    const request = seedRequest();
    const user = userEvent.setup();
    render(<Wrapper requestId={request.id} />);

    await user.type(screen.getByPlaceholderText("key"), "foo");
    await user.click(screen.getByRole("tab", { name: /^Headers/ }));
    await user.type(screen.getByPlaceholderText("Header"), "X-Test");

    const stored = useStore.getState().requests[0];
    expect(stored.queryParams[0].key).toBe("foo");
    expect(stored.headers[0].key).toBe("X-Test");
  });

  it("re-syncs the open text-mode editor when the list changes externally, instead of overwriting it on the next edit", async () => {
    const request = seedRequest();
    const user = userEvent.setup();
    render(<Wrapper requestId={request.id} />);

    await user.click(screen.getByRole("button", { name: "Edit as text" }));
    const textarea = screen.getByPlaceholderText(/key: value/);
    expect(textarea).toHaveValue(":");

    // Something other than this editor writes to the same request's
    // queryParams while text mode is still open — e.g. restoring a history
    // entry into the same active tab.
    act(() => {
      void useStore.getState().updateRequest(request.id, {
        queryParams: [{ id: uid(), key: "restored", value: "1", enabled: true }],
      });
    });

    await waitFor(() => expect(textarea).toHaveValue("restored: 1"));

    await user.click(textarea);
    await user.keyboard("{End}");
    await user.type(textarea, "\nextra: 2");

    expect(useStore.getState().requests[0].queryParams).toEqual([
      expect.objectContaining({ key: "restored", value: "1" }),
      expect.objectContaining({ key: "extra", value: "2" }),
    ]);
  });
});
