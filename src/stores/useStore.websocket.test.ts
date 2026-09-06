import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/stores/useStore";
import { WS_EVENT_LIMIT, closeAllWebSocketSessions } from "@/stores/slices/websocket";
import {
  createDefaultWebSocketConfig,
  normalizeApiRequest,
  type ApiRequest,
  type Environment,
  type Workspace,
} from "@/services/db";

// The slice builds its socket through the global constructor, so replacing
// that global exercises the real wiring — including URL resolution and the
// subprotocol list — rather than a hand-passed factory that would skip it.
class FakeSocket {
  static instances: FakeSocket[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  protocol = "";
  sent: string[] = [];
  closed = false;

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
    this.closed = true;
    this.onclose?.({ code: 1000, reason: "", wasClean: true } as CloseEvent);
  }

  open() {
    this.onopen?.();
  }
  receive(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const WS_ID = "ws-request";

function makeWsRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return normalizeApiRequest({
    id: WS_ID,
    workspaceId: "ws-1",
    name: "Socket",
    method: "GET",
    url: "wss://echo.example.com/socket",
    protocol: "websocket",
    websocket: createDefaultWebSocketConfig(),
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  });
}

function seed(
  request: ApiRequest,
  environments: Environment[] = [],
  activeEnvId: string | null = null,
) {
  useStore.setState({
    workspace: { id: "ws-1", name: "W", globals: [], createdAt: 0, updatedAt: 0 } as Workspace,
    requests: [request],
    collections: [],
    folders: [],
    environments,
    activeEnvId,
    wsSessions: {},
  });
}

const latest = () => FakeSocket.instances[FakeSocket.instances.length - 1];
const session = () => useStore.getState().wsSessions[WS_ID];

let originalWebSocket: unknown;

beforeEach(() => {
  FakeSocket.instances = [];
  originalWebSocket = (globalThis as Record<string, unknown>).WebSocket;
  (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
});

afterEach(() => {
  closeAllWebSocketSessions();
  (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
  useStore.setState({ wsSessions: {} });
});

describe("connectWebSocket", () => {
  it("opens a session and records the connection in the store", () => {
    seed(makeWsRequest());
    useStore.getState().connectWebSocket(WS_ID);

    expect(latest().url).toBe("wss://echo.example.com/socket");
    expect(session().status).toBe("connecting");

    latest().open();
    expect(session().status).toBe("open");
    expect(session().connectedAt).toBeGreaterThan(0);
  });

  // The URL goes through the same resolver every HTTP send uses, so a
  // {{VAR}} in a WebSocket URL has to be substituted before it reaches the
  // socket — otherwise the literal braces go out and the connection fails
  // with no indication why.
  it("resolves {{VAR}} in the URL from the active environment", () => {
    seed(
      makeWsRequest({ url: "{{WS_HOST}}/socket" }),
      [
        {
          id: "env-1",
          workspaceId: "ws-1",
          name: "Local",
          variables: [{ id: "v1", key: "WS_HOST", value: "wss://echo.example.com", enabled: true }],
          createdAt: 0,
        },
      ],
      "env-1",
    );
    useStore.getState().connectWebSocket(WS_ID);

    expect(latest().url).toBe("wss://echo.example.com/socket");
    expect(session().url).toBe("wss://echo.example.com/socket");
  });

  it("appends enabled query params to the handshake URL", () => {
    seed(
      makeWsRequest({
        queryParams: [{ id: "q1", key: "token", value: "abc", enabled: true }],
      }),
    );
    useStore.getState().connectWebSocket(WS_ID);

    expect(latest().url).toContain("token=abc");
  });

  it("passes configured subprotocols through to the handshake", () => {
    seed(
      makeWsRequest({
        websocket: { subprotocols: ["graphql-transport-ws"], messageDrafts: [] },
      }),
    );
    useStore.getState().connectWebSocket(WS_ID);

    expect(latest().protocols).toEqual(["graphql-transport-ws"]);
  });

  it("ignores a connect for a request that doesn't exist", () => {
    seed(makeWsRequest());
    useStore.getState().connectWebSocket("nope");
    expect(FakeSocket.instances).toHaveLength(0);
  });

  // Two sockets for one request would leave the second unreachable — the map
  // is keyed by request id, so Disconnect could only ever close one of them.
  it("doesn't open a second socket while one is already connected", () => {
    seed(makeWsRequest());
    useStore.getState().connectWebSocket(WS_ID);
    latest().open();
    useStore.getState().connectWebSocket(WS_ID);

    expect(FakeSocket.instances).toHaveLength(1);
  });
});

describe("message log", () => {
  it("records sent and received messages in order", () => {
    seed(makeWsRequest());
    useStore.getState().connectWebSocket(WS_ID);
    latest().open();

    expect(useStore.getState().sendWebSocketMessage(WS_ID, "ping")).toBe(true);
    latest().receive("pong");

    const directions = session().events.map((e) => `${e.direction}:${e.data}`);
    expect(directions).toContain("sent:ping");
    expect(directions).toContain("received:pong");
    expect(directions.indexOf("sent:ping")).toBeLessThan(directions.indexOf("received:pong"));
  });

  it("reports a send with no connection as a failure instead of dropping it", () => {
    seed(makeWsRequest());
    expect(useStore.getState().sendWebSocketMessage(WS_ID, "ping")).toBe(false);
  });

  // A chatty feed would otherwise grow without bound for the life of the tab.
  it("caps the log and flags that older messages were dropped", () => {
    seed(makeWsRequest());
    useStore.getState().connectWebSocket(WS_ID);
    latest().open();

    const before = session().events.length;
    for (let i = 0; i < WS_EVENT_LIMIT + 10; i++) latest().receive(`msg-${i}`);

    expect(session().events.length).toBe(WS_EVENT_LIMIT);
    expect(session().truncated).toBe(true);
    // The cap drops from the front, so the newest message must survive.
    expect(session().events.at(-1)?.data).toBe(`msg-${WS_EVENT_LIMIT + 9}`);
    expect(before).toBeGreaterThan(0);
  });

  it("clearWebSocketLog empties the log and resets the truncation flag", () => {
    seed(makeWsRequest());
    useStore.getState().connectWebSocket(WS_ID);
    latest().open();
    latest().receive("hello");

    useStore.getState().clearWebSocketLog(WS_ID);
    expect(session().events).toEqual([]);
    expect(session().truncated).toBe(false);
    // Clearing the view must not close the connection.
    expect(session().status).toBe("open");
  });
});

describe("disconnecting", () => {
  it("closes the socket and reports it in the store", () => {
    seed(makeWsRequest());
    useStore.getState().connectWebSocket(WS_ID);
    const socket = latest();
    socket.open();

    useStore.getState().disconnectWebSocket(WS_ID);
    expect(socket.closed).toBe(true);
    expect(session().status).toBe("closed");
  });

  it("reconnects after disconnecting", () => {
    seed(makeWsRequest());
    useStore.getState().connectWebSocket(WS_ID);
    latest().open();
    useStore.getState().disconnectWebSocket(WS_ID);

    useStore.getState().connectWebSocket(WS_ID);
    expect(FakeSocket.instances).toHaveLength(2);
    // A reconnect starts a fresh log rather than appending to the old one.
    expect(session().events.every((e) => e.direction === "system")).toBe(true);
  });

  it("discardWebSocketSession closes the connection outright", () => {
    seed(makeWsRequest());
    useStore.getState().connectWebSocket(WS_ID);
    const socket = latest();
    socket.open();

    useStore.getState().discardWebSocketSession(WS_ID);
    expect(socket.closed).toBe(true);
  });

  // Without this, deleting a request leaves its socket open and still
  // receiving into a session nothing in the UI can reach — and the connection
  // stays up until the tab itself closes.
  it("deleting the request closes its connection and drops the session", async () => {
    seed(makeWsRequest());
    useStore.setState({ tabs: [], activeTabId: null, sidebarSelection: null });
    useStore.getState().connectWebSocket(WS_ID);
    const socket = latest();
    socket.open();

    await useStore.getState().deleteRequest(WS_ID);

    expect(socket.closed).toBe(true);
    expect(useStore.getState().wsSessions[WS_ID]).toBeUndefined();
  });

  it("disconnecting a request that was never connected is a no-op", () => {
    seed(makeWsRequest());
    expect(() => useStore.getState().disconnectWebSocket(WS_ID)).not.toThrow();
  });
});

describe("failure reporting", () => {
  it("logs a bad URL as a system message instead of opening a socket", () => {
    seed(makeWsRequest({ url: "https://example.com/socket" }));
    useStore.getState().connectWebSocket(WS_ID);

    expect(FakeSocket.instances).toHaveLength(0);
    expect(session().status).toBe("closed");
    expect(session().events.at(-1)?.data).toContain("wss://");
  });

  it("surfaces an opaque handshake error with an explanation", () => {
    seed(makeWsRequest());
    useStore.getState().connectWebSocket(WS_ID);
    latest().onerror?.();

    expect(session().events.at(-1)?.data).toContain("Browsers don't tell a page why");
  });

  it("doesn't warn about mixed content when the page itself is http", () => {
    seed(makeWsRequest({ url: "ws://localhost:3000/ws" }));
    useStore.getState().connectWebSocket(WS_ID);

    expect(FakeSocket.instances).toHaveLength(1);
    expect(session().status).toBe("connecting");
  });
});
