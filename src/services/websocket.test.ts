import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WebSocketSession,
  describeClose,
  describeUrlProblem,
  type WebSocketEvent,
  type WebSocketStatus,
} from "@/services/websocket";

/**
 * A stand-in for the browser's WebSocket, driven by the test rather than by a
 * server — the same shape executor.test.ts uses for `fetch`. Only the members
 * WebSocketSession actually touches are implemented.
 */
class FakeSocket {
  static instances: FakeSocket[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  protocol = "";
  sent: string[] = [];
  closedWith: number | null = null;
  /** Set by a test to make send() throw, the way a socket does once it has
   * started closing. */
  sendThrows: Error | null = null;

  constructor(
    public url: string,
    public protocols?: string[],
  ) {
    FakeSocket.instances.push(this);
  }

  send(data: string) {
    if (this.sendThrows) throw this.sendThrows;
    this.sent.push(data);
  }

  close(code?: number) {
    this.closedWith = code ?? null;
  }

  // — test drivers —
  open(negotiatedProtocol = "") {
    this.protocol = negotiatedProtocol;
    this.onopen?.();
  }
  receive(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
  fail() {
    this.onerror?.();
  }
  serverClose(code = 1000, reason = "", wasClean = true) {
    this.onclose?.({ code, reason, wasClean } as CloseEvent);
  }
}

interface Harness {
  session: WebSocketSession;
  events: WebSocketEvent[];
  statuses: WebSocketStatus[];
  socket: () => FakeSocket;
}

function makeSession(
  url = "wss://echo.example.com/socket",
  options: { subprotocols?: string[]; pageProtocol?: string } = {},
): Harness {
  const events: WebSocketEvent[] = [];
  const statuses: WebSocketStatus[] = [];
  const session = new WebSocketSession({
    url,
    subprotocols: options.subprotocols,
    pageProtocol: options.pageProtocol ?? "http:",
    createSocket: (socketUrl, protocols) =>
      new FakeSocket(socketUrl, protocols) as unknown as WebSocket,
    handlers: {
      onStatus: (status) => statuses.push(status),
      onEvent: (event) => events.push(event),
    },
  });
  return {
    session,
    events,
    statuses,
    socket: () => FakeSocket.instances[FakeSocket.instances.length - 1],
  };
}

const messagesOf = (events: WebSocketEvent[]) => events.map((e) => e.data);

beforeEach(() => {
  FakeSocket.instances = [];
});

describe("WebSocketSession — connecting", () => {
  it("opens a socket at the given URL and reports open", () => {
    const h = makeSession();
    h.session.connect();

    expect(h.socket().url).toBe("wss://echo.example.com/socket");
    expect(h.session.status).toBe("connecting");

    h.socket().open();
    expect(h.session.status).toBe("open");
    expect(h.statuses).toEqual(["connecting", "open"]);
  });

  it("passes subprotocols through to the handshake and reports the negotiated one", () => {
    const h = makeSession("wss://x.example.com", { subprotocols: ["graphql-ws", "json"] });
    h.session.connect();
    expect(h.socket().protocols).toEqual(["graphql-ws", "json"]);

    h.socket().open("graphql-ws");
    expect(messagesOf(h.events)).toContain("Connected (subprotocol: graphql-ws)");
  });

  // `new WebSocket(url, [])` throws on an empty protocol list in some engines,
  // so an unset list has to arrive as undefined rather than as [].
  it("omits the protocol argument entirely when no subprotocols are configured", () => {
    const h = makeSession();
    h.session.connect();
    expect(h.socket().protocols).toBeUndefined();
  });

  // Without this, Cmd+Enter or a double-click on Connect leaks a second socket
  // that nothing can close — the map only holds one per request.
  it("ignores a second connect while one is already in flight", () => {
    const h = makeSession();
    h.session.connect();
    h.session.connect();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("reconnects after a close", () => {
    const h = makeSession();
    h.session.connect();
    h.socket().open();
    h.socket().serverClose();
    expect(h.session.status).toBe("closed");

    h.session.connect();
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("reports a constructor throw as a system event instead of leaving it pending", () => {
    const events: WebSocketEvent[] = [];
    const session = new WebSocketSession({
      url: "wss://x.example.com",
      pageProtocol: "http:",
      createSocket: () => {
        throw new SyntaxError("bad protocol");
      },
      handlers: { onStatus: () => {}, onEvent: (event) => events.push(event) },
    });
    session.connect();

    expect(session.status).toBe("closed");
    expect(messagesOf(events).join(" ")).toContain("bad protocol");
  });
});

describe("WebSocketSession — messages", () => {
  it("logs a sent message and hands it to the socket", () => {
    const h = makeSession();
    h.session.connect();
    h.socket().open();

    expect(h.session.send(`{"op":"ping"}`)).toBe(true);
    expect(h.socket().sent).toEqual([`{"op":"ping"}`]);
    expect(h.events.at(-1)).toMatchObject({ direction: "sent", data: `{"op":"ping"}` });
  });

  it("logs a received message", () => {
    const h = makeSession();
    h.session.connect();
    h.socket().open();
    h.socket().receive("pong");

    expect(h.events.at(-1)).toMatchObject({ direction: "received", data: "pong" });
  });

  // A dropped message that looks sent is the worst outcome here — the user
  // would be debugging a server that never received anything.
  it("refuses to send before the socket is open rather than dropping the message", () => {
    const h = makeSession();
    h.session.connect();

    expect(h.session.send("too early")).toBe(false);
    expect(h.socket().sent).toEqual([]);
    expect(messagesOf(h.events)).not.toContain("too early");
  });

  it("refuses to send after the socket closed", () => {
    const h = makeSession();
    h.session.connect();
    h.socket().open();
    h.socket().serverClose();

    expect(h.session.send("too late")).toBe(false);
  });

  it("reports a throw from send() as a failure, not a success", () => {
    const h = makeSession();
    h.session.connect();
    h.socket().open();
    h.socket().sendThrows = new Error("still in CONNECTING state");

    expect(h.session.send("x")).toBe(false);
    expect(messagesOf(h.events).join(" ")).toContain("still in CONNECTING state");
  });

  // Rendering a Blob as text produces mojibake; the size is the useful fact.
  it("records a binary frame by size instead of mangling it into text", async () => {
    const h = makeSession();
    h.session.connect();
    h.socket().open();
    h.socket().receive(new ArrayBuffer(12));
    await vi.waitFor(() => expect(h.events.at(-1)?.binary).toBe(true));

    expect(h.events.at(-1)).toMatchObject({
      direction: "received",
      sizeBytes: 12,
      data: "[binary frame • 12 bytes]",
    });
  });

  it("measures a sent message in bytes, not characters", () => {
    const h = makeSession();
    h.session.connect();
    h.socket().open();
    h.session.send("héllo");

    expect(h.events.at(-1)?.sizeBytes).toBe(6);
  });
});

describe("WebSocketSession — closing", () => {
  it("closes with the normal-closure code", () => {
    const h = makeSession();
    h.session.connect();
    h.socket().open();
    h.session.close();

    expect(h.socket().closedWith).toBe(1000);
    expect(h.session.status).toBe("closing");

    h.socket().serverClose();
    expect(h.session.status).toBe("closed");
  });

  it("distinguishes a server-initiated close from a dropped connection", () => {
    const clean = makeSession();
    clean.session.connect();
    clean.socket().open();
    clean.socket().serverClose(1000, "", true);
    expect(clean.events.at(-1)?.data).toContain("Closed by the server");

    const dropped = makeSession();
    dropped.session.connect();
    dropped.socket().open();
    dropped.socket().serverClose(1006, "", false);
    expect(dropped.events.at(-1)?.data).toContain("Connection dropped");
    expect(dropped.events.at(-1)?.data).toContain("1006");
  });

  // Found by driving the real app: a server that drops the TCP connection
  // instead of completing the closing handshake makes the browser report
  // 1006 "abnormal closure" even for a close we asked for — so clicking
  // Disconnect logged "Connection dropped", blaming the network for what the
  // user just did.
  it("calls a close it initiated a disconnect, even when the code says 1006", () => {
    const h = makeSession();
    h.session.connect();
    h.socket().open();

    h.session.close();
    h.socket().serverClose(1006, "", false);

    const message = h.events.at(-1)?.data ?? "";
    expect(message).toContain("Disconnected");
    expect(message).not.toContain("Connection dropped");
  });

  // A fresh connect must not inherit the previous one's intent, or a genuine
  // drop after a reconnect would be reported as a tidy disconnect.
  it("resets the initiated-close flag on reconnect", () => {
    const h = makeSession();
    h.session.connect();
    h.socket().open();
    h.session.close();
    h.socket().serverClose(1000, "", true);

    h.session.connect();
    h.socket().open();
    h.socket().serverClose(1006, "", false);

    expect(h.events.at(-1)?.data).toContain("Connection dropped");
  });

  it("includes the server's close reason when it sent one", () => {
    const h = makeSession();
    h.session.connect();
    h.socket().open();
    h.socket().serverClose(4001, "token expired", true);

    expect(h.events.at(-1)?.data).toContain("token expired");
  });

  it("does nothing when closing a session that was never connected", () => {
    const h = makeSession();
    expect(() => h.session.close()).not.toThrow();
  });
});

describe("WebSocketSession — errors", () => {
  // Browsers deliberately withhold the reason (it would let a page probe the
  // local network), so an empty "error" line would tell the user nothing.
  it("says why a handshake error carries no detail instead of logging a blank error", () => {
    const h = makeSession();
    h.session.connect();
    h.socket().fail();

    const message = h.events.at(-1)?.data ?? "";
    expect(message).toContain("Browsers don't tell a page why");
    expect(message).not.toBe("");
  });
});

describe("describeUrlProblem", () => {
  it("accepts ws:// and wss://", () => {
    expect(describeUrlProblem("ws://localhost:8080/socket", "http:")).toBeNull();
    expect(describeUrlProblem("wss://example.com/socket", "https:")).toBeNull();
  });

  it("asks for a URL when the field is empty", () => {
    expect(describeUrlProblem("", "http:")).toContain("Enter a WebSocket URL");
  });

  // Pasting an https:// URL into a WebSocket request is the obvious mistake,
  // and `new WebSocket("https://…")` throws a SyntaxError that says nothing
  // about which scheme to use instead.
  it("names the right scheme when an http(s) URL was pasted in", () => {
    expect(describeUrlProblem("https://example.com/socket", "https:")).toContain("wss://");
    expect(describeUrlProblem("http://example.com/socket", "http:")).toContain("ws://");
  });

  it("rejects an unrelated scheme", () => {
    expect(describeUrlProblem("ftp://example.com", "http:")).toContain("ws:// or wss://");
  });

  it("rejects a URL that doesn't parse", () => {
    expect(describeUrlProblem("not a url", "http:")).toContain("isn't a valid URL");
  });

  // The browser blocks this one before anything leaves, and the failure it
  // surfaces to the page has no explanation attached.
  it("explains the mixed-content block instead of letting it fail opaquely", () => {
    const problem = describeUrlProblem("ws://example.com/socket", "https:");
    expect(problem).toContain("mixed content");
    expect(problem).toContain("wss://");
  });

  it("allows ws:// from an http page — the local-dev case", () => {
    expect(describeUrlProblem("ws://localhost:3000/ws", "http:")).toBeNull();
  });
});

describe("describeClose", () => {
  const event = (code: number, reason = "", wasClean = true) =>
    ({ code, reason, wasClean }) as CloseEvent;

  it("keeps the close code as a detail, not the headline", () => {
    expect(describeClose(event(1000), true)).toBe("Disconnected (code 1000)");
  });

  it("includes a reason the server sent", () => {
    expect(describeClose(event(4001, "token expired", true))).toBe(
      "Closed by the server (token expired, code 4001)",
    );
  });

  it("says the connection dropped only when nobody asked for it", () => {
    expect(describeClose(event(1006, "", false))).toContain("Connection dropped");
    expect(describeClose(event(1006, "", false), true)).toContain("Disconnected");
  });
});
