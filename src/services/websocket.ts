// A WebSocket connection, wrapped so the store and the console UI never touch
// the raw socket.
//
// Unlike every HTTP send, this one does NOT go through /api/proxy: the proxy
// speaks HTTP and cannot tunnel a WebSocket upgrade. That's fine, and it's not
// the CORS problem again — a browser applies no same-origin restriction to
// `new WebSocket()`. The server decides for itself whether to accept the
// handshake by looking at the Origin header, so a cross-origin connection
// either works or is refused by the server, with nothing reqlo could proxy
// around.
//
// What the browser *does* enforce, and what this module reports up front
// rather than letting it surface as an unexplained failure, is mixed content:
// a page served over https cannot open a plain `ws://` socket.

import { uid } from "@/services/db";

export type WebSocketEventDirection = "sent" | "received" | "system";

export interface WebSocketEvent {
  id: string;
  direction: WebSocketEventDirection;
  at: number;
  data: string;
  sizeBytes: number;
  /** Set on a "received" frame that arrived as binary — `data` then holds a
   * placeholder, since a Blob has no useful text rendering. */
  binary?: boolean;
}

export type WebSocketStatus = "idle" | "connecting" | "open" | "closing" | "closed";

export interface WebSocketSessionHandlers {
  onStatus: (status: WebSocketStatus) => void;
  onEvent: (event: WebSocketEvent) => void;
}

/** Injectable so tests can drive a fake socket, the way executor.test.ts
 * stubs `fetch`. Defaults to the browser's own constructor. */
export type WebSocketFactory = (url: string, protocols?: string[]) => WebSocket;

export interface WebSocketSessionOptions {
  url: string;
  subprotocols?: string[];
  handlers: WebSocketSessionHandlers;
  createSocket?: WebSocketFactory;
  /** The page's own scheme, for the mixed-content check. Injectable for tests;
   * defaults to `location.protocol`. */
  pageProtocol?: string;
}

/** Close codes a page is allowed to send. 1000 is "normal closure"; anything
 * below 3000 other than 1000 is reserved for the protocol itself and throws. */
const NORMAL_CLOSURE = 1000;

export class WebSocketSession {
  private socket: WebSocket | null = null;
  private currentStatus: WebSocketStatus = "idle";
  /** Set when close() was called from here. A server that doesn't complete
   * the closing handshake (it just drops the TCP connection) makes the
   * browser report 1006 "abnormal closure" even for a close we initiated —
   * so the code alone can't be trusted to say whether this was intentional,
   * and reporting "Connection dropped" to someone who just clicked
   * Disconnect is simply wrong. */
  private closeRequested = false;
  private readonly options: WebSocketSessionOptions;

  constructor(options: WebSocketSessionOptions) {
    this.options = options;
  }

  get status(): WebSocketStatus {
    return this.currentStatus;
  }

  connect(): void {
    if (this.currentStatus === "connecting" || this.currentStatus === "open") return;

    const url = this.options.url.trim();
    const problem = describeUrlProblem(url, this.options.pageProtocol ?? readPageProtocol());
    if (problem) {
      this.setStatus("closed");
      this.emit("system", problem);
      return;
    }

    this.closeRequested = false;
    this.setStatus("connecting");
    this.emit("system", `Connecting to ${url}…`);

    const create = this.options.createSocket ?? defaultFactory;
    let socket: WebSocket;
    try {
      // A subprotocol list the server can't satisfy, or a malformed one,
      // throws synchronously rather than firing onerror.
      socket = create(
        url,
        this.options.subprotocols?.length ? this.options.subprotocols : undefined,
      );
    } catch (error) {
      this.setStatus("closed");
      this.emit("system", `Couldn't open the connection: ${messageOf(error)}`);
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      this.setStatus("open");
      const negotiated = socket.protocol;
      this.emit("system", negotiated ? `Connected (subprotocol: ${negotiated})` : "Connected");
    };

    socket.onmessage = (event: MessageEvent) => {
      void this.recordIncoming(event.data);
    };

    // The browser deliberately gives a page no detail about why a handshake
    // failed — exposing it would let a page probe the local network. Saying
    // that outright beats printing an empty "error".
    socket.onerror = () => {
      this.emit(
        "system",
        "Connection error. Browsers don't tell a page why a WebSocket handshake failed — check the URL, that the server is reachable, and that it accepts this origin.",
      );
    };

    socket.onclose = (event: CloseEvent) => {
      this.socket = null;
      this.setStatus("closed");
      this.emit("system", describeClose(event, this.closeRequested));
    };
  }

  /** Returns false when there's no open socket to send on — the caller shows
   * that as a refusal rather than silently dropping the message. */
  send(data: string): boolean {
    if (!this.socket || this.currentStatus !== "open") return false;
    try {
      this.socket.send(data);
    } catch (error) {
      this.emit("system", `Couldn't send: ${messageOf(error)}`);
      return false;
    }
    this.emit("sent", data);
    return true;
  }

  close(): void {
    if (!this.socket) return;
    this.closeRequested = true;
    this.setStatus("closing");
    try {
      this.socket.close(NORMAL_CLOSURE);
    } catch {
      // Already closing or closed — onclose still settles the status.
    }
  }

  private async recordIncoming(data: unknown): Promise<void> {
    if (typeof data === "string") {
      this.emit("received", data);
      return;
    }
    // Binary frames have no text rendering worth showing, so the log records
    // what arrived and how big it was instead of mangling bytes into a string.
    const size = await binarySize(data);
    this.push({
      id: uid(),
      direction: "received",
      at: Date.now(),
      data: `[binary frame • ${size} bytes]`,
      sizeBytes: size,
      binary: true,
    });
  }

  private emit(direction: WebSocketEventDirection, data: string): void {
    this.push({
      id: uid(),
      direction,
      at: Date.now(),
      data,
      sizeBytes: direction === "system" ? 0 : byteLength(data),
    });
  }

  private push(event: WebSocketEvent): void {
    this.options.handlers.onEvent(event);
  }

  private setStatus(status: WebSocketStatus): void {
    this.currentStatus = status;
    this.options.handlers.onStatus(status);
  }
}

/**
 * The failures worth naming before even trying to connect. Everything else is
 * left to the socket, whose error the browser keeps opaque anyway.
 */
export function describeUrlProblem(url: string, pageProtocol: string): string | null {
  if (!url) return "Enter a WebSocket URL (ws:// or wss://) to connect.";

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `"${url}" isn't a valid URL. A WebSocket URL looks like wss://example.com/socket.`;
  }

  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    return `This is an ${parsed.protocol.replace(":", "")} URL. Use ${
      parsed.protocol === "https:" ? "wss://" : "ws://"
    } for a WebSocket, or switch the request back to HTTP.`;
  }
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    return `"${parsed.protocol}" isn't a WebSocket scheme. Use ws:// or wss://.`;
  }
  // Mixed content: the browser blocks this before the request leaves, and the
  // resulting error carries no explanation of its own.
  if (pageProtocol === "https:" && parsed.protocol === "ws:") {
    return "A page served over https can't open a plain ws:// connection — browsers block it as mixed content. Use wss://, or open reqlo over http.";
  }

  return null;
}

export function describeClose(event: CloseEvent, closeRequested = false): string {
  const reason = event.reason?.trim();
  const detail = [reason, event.code ? `code ${event.code}` : ""].filter(Boolean).join(", ");
  const suffix = detail ? ` (${detail})` : "";

  // Our own Disconnect. Whatever code came back describes how tidily the
  // server hung up, which is a detail — not the headline.
  if (closeRequested) return `Disconnected${suffix}`;
  return event.wasClean ? `Closed by the server${suffix}` : `Connection dropped${suffix}`;
}

function defaultFactory(url: string, protocols?: string[]): WebSocket {
  return protocols?.length ? new WebSocket(url, protocols) : new WebSocket(url);
}

function readPageProtocol(): string {
  return typeof location !== "undefined" ? location.protocol : "http:";
}

async function binarySize(data: unknown): Promise<number> {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.size;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  return 0;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
