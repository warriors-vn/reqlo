// @vitest-environment jsdom
import "@/test/setup-dom";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ResponseViewer } from "@/components/ResponseViewer";
import { useStore } from "@/stores/useStore";
import { normalizeApiRequest, uid, type ApiRequest } from "@/services/db";
import type { ExecutionResult } from "@/services/execution";
import { MAX_RESPONSE_RENDER_LENGTH } from "@/lib/response-body-view";

function makeResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    status: 200,
    statusText: "OK",
    durationMs: 12,
    sizeBytes: 2,
    headers: { "content-type": "application/json" },
    body: '{"ok":true}',
    contentType: "application/json",
    ok: true,
    responseKind: "json",
    blob: new Blob(['{"ok":true}']),
    fileName: null,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  const now = Date.now();
  return normalizeApiRequest({
    id: uid(),
    workspaceId: "ws-1",
    name: "Req",
    method: "GET",
    url: "https://api.example.com",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe("ResponseViewer — body views per response kind", () => {
  afterEach(() => {
    cleanup();
  });

  it("offers Pretty/Raw for a JSON response, defaulting to Pretty", () => {
    render(<ResponseViewer result={makeResult({ responseKind: "json" })} loading={false} />);
    expect(screen.getByRole("tab", { name: "Pretty" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Raw" })).toBeInTheDocument();
  });

  it("offers Preview/Raw for an HTML response, defaulting to Preview", () => {
    render(
      <ResponseViewer
        result={makeResult({
          responseKind: "html",
          body: "<p>hi</p>",
          contentType: "text/html",
        })}
        loading={false}
      />,
    );
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Raw" })).toBeInTheDocument();
  });

  it("offers Events/Raw for a stream response, defaulting to Events, and parses SSE frames", () => {
    render(
      <ResponseViewer
        result={makeResult({
          responseKind: "stream",
          body: "event: greeting\ndata: hi\n\ndata: bye\n\n",
          contentType: "text/event-stream",
        })}
        loading={false}
      />,
    );
    expect(screen.getByRole("tab", { name: "Events" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Raw" })).toBeInTheDocument();
    expect(screen.getByText("greeting")).toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("bye")).toBeInTheDocument();
  });

  it("shows the raw SSE text unparsed on the Raw view of a stream response", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(
      <ResponseViewer
        result={makeResult({
          responseKind: "stream",
          body: "data: hi\n\n",
          contentType: "text/event-stream",
        })}
        loading={false}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Raw" }));
    expect(screen.getByText("data: hi")).toBeInTheDocument();
  });

  it("shows a single Summary view with no tab strip for a binary response", () => {
    render(
      <ResponseViewer
        result={makeResult({
          responseKind: "binary",
          body: "",
          contentType: "application/octet-stream",
          blob: new Blob([new Uint8Array([1, 2, 3])]),
        })}
        loading={false}
      />,
    );
    expect(screen.queryByRole("tab", { name: "Summary" })).not.toBeInTheDocument();
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
  });

  it("shows the error panel instead of any body view when the send failed", () => {
    render(
      <ResponseViewer
        result={makeResult({
          status: null,
          ok: false,
          responseKind: "empty",
          body: "",
          blob: null,
          error: "Request failed: boom.",
        })}
        loading={false}
      />,
    );
    expect(screen.getByText("Request failed: boom.")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Pretty" })).not.toBeInTheDocument();
  });
});

describe("ResponseViewer — over-cap guard", () => {
  afterEach(() => {
    cleanup();
  });

  it("truncates a body over the render cap and shows the download-instead banner", () => {
    const hugeBody = "x".repeat(MAX_RESPONSE_RENDER_LENGTH + 500);
    render(
      <ResponseViewer
        result={makeResult({ responseKind: "text", contentType: "text/plain", body: hugeBody })}
        loading={false}
      />,
    );
    expect(
      screen.getByText(/Showing the first .* of .* characters — download the/),
    ).toBeInTheDocument();
  });

  it("renders the full body inline with no banner when under the cap", () => {
    render(
      <ResponseViewer
        result={makeResult({ responseKind: "text", contentType: "text/plain", body: "hello" })}
        loading={false}
      />,
    );
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});

describe("ResponseViewer — Save as mock eligibility", () => {
  afterEach(() => {
    cleanup();
  });

  it("disables Save as mock, with a reason, when there is no active request", () => {
    render(<ResponseViewer result={makeResult()} loading={false} request={null} />);
    const button = screen.getByRole("button", { name: /No active request/ });
    expect(button).toBeDisabled();
  });

  it("disables Save as mock for a binary response, with a reason", () => {
    const request = makeRequest();
    useStore.setState({ requests: [request] });
    render(
      <ResponseViewer
        result={makeResult({ responseKind: "binary", body: "" })}
        loading={false}
        request={request}
      />,
    );
    const button = screen.getByRole("button", { name: /text only/ });
    expect(button).toBeDisabled();
  });

  it("enables Save as mock for a normal textual response with an active request", () => {
    const request = makeRequest();
    useStore.setState({ requests: [request] });
    render(<ResponseViewer result={makeResult()} loading={false} request={request} />);
    const button = screen.getByRole("button", { name: "Save this response as the request's mock" });
    expect(button).toBeEnabled();
  });

  it("saves without confirming when the mock still has its untouched default body", async () => {
    // createDefaultMock()'s placeholder ("{\n  \n}") is on every request
    // whether or not anyone opened the Mock tab — this must not read as an
    // existing mock worth confirming over.
    const request = makeRequest();
    useStore.setState({ requests: [request] });
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(<ResponseViewer result={makeResult()} loading={false} request={request} />);
    await user.click(
      screen.getByRole("button", { name: "Save this response as the request's mock" }),
    );

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    const updated = useStore.getState().requests[0];
    expect(updated.mock.body).toBe('{"ok":true}');
    expect(updated.mock.status).toBe(200);
    expect(updated.mock.enabled).toBe(false);
  });

  it("confirms via a dialog before replacing a real, previously-saved mock body", async () => {
    const request = makeRequest({
      mock: {
        enabled: true,
        status: 201,
        contentType: "application/json",
        body: '{"old":1}',
        delayMs: 0,
      },
    });
    useStore.setState({ requests: [request] });
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(<ResponseViewer result={makeResult()} loading={false} request={request} />);
    await user.click(
      screen.getByRole("button", { name: "Save this response as the request's mock" }),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Replace mock body?");
    // Not applied yet — only after the dialog itself is confirmed.
    expect(useStore.getState().requests[0].mock.body).toBe('{"old":1}');

    await user.click(screen.getByRole("button", { name: "Replace" }));
    expect(useStore.getState().requests[0].mock.body).toBe('{"ok":true}');
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("leaves the mock untouched when the replace confirmation dialog is cancelled", async () => {
    const request = makeRequest({
      mock: {
        enabled: true,
        status: 201,
        contentType: "application/json",
        body: '{"old":1}',
        delayMs: 0,
      },
    });
    useStore.setState({ requests: [request] });
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(<ResponseViewer result={makeResult()} loading={false} request={request} />);
    await user.click(
      screen.getByRole("button", { name: "Save this response as the request's mock" }),
    );

    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(useStore.getState().requests[0].mock.body).toBe('{"old":1}');
  });
});

describe("ResponseViewer — live streaming progress", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the generic spinner while loading with no streaming progress yet", () => {
    render(<ResponseViewer result={null} loading={true} streaming={null} />);
    expect(screen.getByText("Sending request…")).toBeInTheDocument();
  });

  it("renders live SSE frames while still loading, once chunks have arrived", () => {
    render(
      <ResponseViewer
        result={null}
        loading={true}
        streaming={{ text: "data: partial\n\ndata: more", contentType: "text/event-stream" }}
      />,
    );
    expect(screen.queryByText("Sending request…")).not.toBeInTheDocument();
    expect(screen.getByText("partial")).toBeInTheDocument();
    expect(screen.getByText("more")).toBeInTheDocument();
  });

  it("renders plain live text (not SSE-parsed) for a non-event-stream content type", () => {
    render(
      <ResponseViewer
        result={null}
        loading={true}
        streaming={{ text: '{"partial":', contentType: "application/json" }}
      />,
    );
    expect(screen.getByText('{"partial":')).toBeInTheDocument();
  });

  it("stops showing the live view once a final result arrives", () => {
    render(
      <ResponseViewer
        result={makeResult({ responseKind: "text", contentType: "text/plain", body: "done" })}
        loading={false}
        streaming={{ text: "stale partial text", contentType: "text/plain" }}
      />,
    );
    expect(screen.queryByText("stale partial text")).not.toBeInTheDocument();
    expect(screen.getByText("done")).toBeInTheDocument();
  });

  it("keeps showing the previous result during a re-send, instead of blanking to a spinner", () => {
    // A request that already has a result gets sent again — `loading` flips
    // back to true, but no streaming chunks have arrived for the new send
    // yet. Blanking to "Sending request…" here would hide data the user was
    // just looking at for no reason; the old result should stay put until
    // something newer (streaming data, or the eventual new result) replaces it.
    render(
      <ResponseViewer
        result={makeResult({ responseKind: "text", contentType: "text/plain", body: "previous" })}
        loading={true}
        streaming={null}
      />,
    );
    expect(screen.queryByText("Sending request…")).not.toBeInTheDocument();
    expect(screen.getByText("previous")).toBeInTheDocument();
  });

  it("prefers fresh streaming data over a stale previous result once chunks start arriving", () => {
    render(
      <ResponseViewer
        result={makeResult({ responseKind: "text", contentType: "text/plain", body: "previous" })}
        loading={true}
        streaming={{ text: "fresh chunk", contentType: "text/plain" }}
      />,
    );
    expect(screen.queryByText("previous")).not.toBeInTheDocument();
    expect(screen.getByText("fresh chunk")).toBeInTheDocument();
  });
});
