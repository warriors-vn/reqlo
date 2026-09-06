// @vitest-environment jsdom
import "@/test/setup-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WebSocketConsole } from "@/components/WebSocketConsole";
import { RequestBuilder } from "@/components/RequestBuilder";
import { useStore } from "@/stores/useStore";
import { closeAllWebSocketSessions } from "@/stores/slices/websocket";
import {
  createDefaultWebSocketConfig,
  normalizeApiRequest,
  type ApiRequest,
  type Workspace,
} from "@/services/db";

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  protocol = "";
  sent: string[] = [];

  constructor(
    public url: string,
    public protocols?: string[],
  ) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.({ code: 1000, reason: "", wasClean: true } as CloseEvent);
  }
  open() {
    this.onopen?.();
  }
  receive(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const REQUEST_ID = "ws-1";

function seed(overrides: Partial<ApiRequest> = {}): ApiRequest {
  const request = normalizeApiRequest({
    id: REQUEST_ID,
    workspaceId: "w",
    name: "Socket",
    method: "GET",
    url: "wss://echo.example.com/socket",
    protocol: "websocket",
    websocket: createDefaultWebSocketConfig(),
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  });
  useStore.setState({
    workspace: { id: "w", name: "W", globals: [], createdAt: 0, updatedAt: 0 } as Workspace,
    requests: [request],
    collections: [],
    folders: [],
    environments: [],
    activeEnvId: null,
    wsSessions: {},
  });
  return request;
}

const socket = () => FakeSocket.instances[FakeSocket.instances.length - 1];
let originalWebSocket: unknown;

beforeEach(() => {
  FakeSocket.instances = [];
  originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
  (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
});

afterEach(() => {
  cleanup();
  closeAllWebSocketSessions();
  (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
  useStore.setState({ wsSessions: {} });
});

describe("WebSocketConsole", () => {
  it("starts disconnected and says how to open the connection", () => {
    render(<WebSocketConsole request={seed()} />);
    expect(screen.getByText("Not connected")).toBeTruthy();
    expect(screen.getByText(/Press Connect to open the connection/)).toBeTruthy();
  });

  it("shows sent and received messages once connected", async () => {
    const request = seed();
    render(<WebSocketConsole request={request} />);

    useStore.getState().connectWebSocket(REQUEST_ID);
    socket().open();
    socket().receive("hello");

    // Both the status pill and the system log line read "Connected", so the
    // pill is addressed by its role rather than by text.
    expect((await screen.findByRole("status")).textContent).toContain("Connected");
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("disables Send while there's no connection", async () => {
    const user = userEvent.setup();
    render(<WebSocketConsole request={seed()} />);

    await user.type(screen.getByLabelText("Message to send"), "ping");
    expect(screen.getByRole("button", { name: /^Send$/ }).hasAttribute("disabled")).toBe(true);
  });

  // The disabled button blocks the mouse, but ⌘↵ goes straight to submit() —
  // so that path has to refuse out loud rather than swallowing the message.
  it("says why when ⌘↵ is used with no connection", async () => {
    const user = userEvent.setup();
    render(<WebSocketConsole request={seed()} />);

    const composer = screen.getByLabelText("Message to send");
    await user.type(composer, "ping");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(screen.getByRole("alert").textContent).toContain("Connect first");
  });

  it("sends through the socket and clears the composer", async () => {
    const user = userEvent.setup();
    render(<WebSocketConsole request={seed()} />);
    useStore.getState().connectWebSocket(REQUEST_ID);
    socket().open();

    const composer = screen.getByLabelText("Message to send") as HTMLTextAreaElement;
    await user.type(composer, "ping");
    await user.click(screen.getByRole("button", { name: /^Send$/ }));

    expect(socket().sent).toEqual(["ping"]);
    expect(composer.value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("filters the log by direction", async () => {
    const user = userEvent.setup();
    render(<WebSocketConsole request={seed()} />);
    useStore.getState().connectWebSocket(REQUEST_ID);
    socket().open();
    socket().receive("from-server");
    useStore.getState().sendWebSocketMessage(REQUEST_ID, "from-me");

    await user.click(screen.getByRole("button", { name: "sent" }));

    expect(screen.getByText("from-me")).toBeTruthy();
    expect(screen.queryByText("from-server")).toBeNull();
    // The system "Connected" line is filtered out too — "sent" means sent.
    expect(screen.queryByText("Connected", { selector: "li span" })).toBeNull();
  });

  it("sends a saved message draft without retyping it", async () => {
    const user = userEvent.setup();
    render(
      <WebSocketConsole
        request={seed({
          websocket: {
            subprotocols: [],
            messageDrafts: [
              { id: "d1", name: "Subscribe", contentType: "json", body: `{"op":"sub"}` },
            ],
          },
        })}
      />,
    );
    useStore.getState().connectWebSocket(REQUEST_ID);
    socket().open();

    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(socket().sent).toEqual([`{"op":"sub"}`]);
  });

  it("clears the log without closing the connection", async () => {
    const user = userEvent.setup();
    render(<WebSocketConsole request={seed()} />);
    useStore.getState().connectWebSocket(REQUEST_ID);
    socket().open();
    socket().receive("hello");

    await user.click(screen.getByRole("button", { name: /Clear/ }));

    expect(screen.queryByText("hello")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Connected");
  });
});

describe("RequestBuilder — WebSocket mode", () => {
  it("offers Connect instead of Send, and no method selector", () => {
    render(
      <RequestBuilder request={seed()} onSend={() => {}} onCancel={() => {}} sending={false} />,
    );

    expect(screen.getByRole("button", { name: /Connect/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Send$/ })).toBeNull();
    // A WebSocket handshake is always a GET — offering a method would be a
    // control that changes nothing.
    expect(screen.queryByLabelText("HTTP method")).toBeNull();
  });

  it("flips to Disconnect once the connection is open", async () => {
    render(
      <RequestBuilder request={seed()} onSend={() => {}} onCancel={() => {}} sending={false} />,
    );
    useStore.getState().connectWebSocket(REQUEST_ID);
    socket().open();

    expect(await screen.findByRole("button", { name: /Disconnect/ })).toBeTruthy();
  });

  // Body/Extract/Tests/Mock have no meaning for a connection; Message does.
  it("shows only the tabs that mean something for a WebSocket", () => {
    render(
      <RequestBuilder request={seed()} onSend={() => {}} onCancel={() => {}} sending={false} />,
    );
    const tabNames = screen.getAllByRole("tab").map((tab) => tab.textContent?.trim());

    expect(tabNames).toContain("Message");
    expect(tabNames?.some((name) => name?.startsWith("Body"))).toBe(false);
    expect(tabNames?.some((name) => name?.startsWith("Mock"))).toBe(false);
    expect(tabNames?.some((name) => name?.startsWith("Extract"))).toBe(false);
  });

  it("keeps the full HTTP tab set for an HTTP request", () => {
    render(
      <RequestBuilder
        request={seed({ protocol: "http", url: "https://api.example.com" })}
        onSend={() => {}}
        onCancel={() => {}}
        sending={false}
      />,
    );
    const tabNames = screen.getAllByRole("tab").map((tab) => tab.textContent?.trim() ?? "");

    expect(tabNames.some((name) => name.startsWith("Body"))).toBe(true);
    expect(tabNames.some((name) => name.startsWith("Message"))).toBe(false);
    expect(screen.getByLabelText("HTTP method")).toBeTruthy();
  });

  // An editor here would accept header rows that a browser silently never
  // sends on a handshake.
  it("explains the handshake header limitation instead of showing an editor", async () => {
    const user = userEvent.setup();
    render(
      <RequestBuilder request={seed()} onSend={() => {}} onCancel={() => {}} sending={false} />,
    );

    await user.click(screen.getByRole("tab", { name: /Headers/ }));

    expect(screen.getByText(/can't be sent on a WebSocket handshake/)).toBeTruthy();
  });
});
