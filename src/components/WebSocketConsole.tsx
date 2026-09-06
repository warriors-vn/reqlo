import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Eraser, Info, Send } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStore } from "@/stores/useStore";
import type { ApiRequest } from "@/services/db";
import type { WebSocketEvent, WebSocketStatus } from "@/services/websocket";
import { WS_EVENT_LIMIT, type WsSessionState } from "@/stores/slices/websocket";

type DirectionFilter = "all" | "sent" | "received" | "system";

const STATUS_LABEL: Record<WebSocketStatus, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  open: "Connected",
  closing: "Closing…",
  closed: "Disconnected",
};

/** Replaces ResponseViewer for a WebSocket request: a connection has a
 * scrollback of many messages in both directions, not one response body. */
export function WebSocketConsole({ request }: { request: ApiRequest }) {
  const session = useStore((s) => s.wsSessions[request.id]) as WsSessionState | undefined;
  const sendWebSocketMessage = useStore((s) => s.sendWebSocketMessage);
  const clearWebSocketLog = useStore((s) => s.clearWebSocketLog);

  const [filter, setFilter] = useState<DirectionFilter>("all");
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

  const status = session?.status ?? "idle";
  const isOpen = status === "open";

  // "Connect first" has to stop being shown the moment there *is* a
  // connection — otherwise the UI goes on blaming a user who already did what
  // it asked. Keyed on status rather than cleared inside connect(), so a
  // connection opened from anywhere (the Connect button, ⌘↵, the command
  // palette) settles it.
  useEffect(() => {
    if (isOpen) setSendError(null);
  }, [isOpen]);
  const events = useMemo(() => session?.events ?? [], [session]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return events.filter((event) => {
      if (filter !== "all" && event.direction !== filter) return false;
      if (needle && !event.data.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [events, filter, search]);

  const counts = useMemo(
    () => ({
      sent: events.filter((e) => e.direction === "sent").length,
      received: events.filter((e) => e.direction === "received").length,
    }),
    [events],
  );

  const submit = () => {
    if (!composer.trim()) return;
    if (sendWebSocketMessage(request.id, composer)) {
      setComposer("");
      setSendError(null);
      return;
    }
    setSendError(
      isOpen
        ? "The message couldn't be sent — see the log for why."
        : "Connect first: there's no open connection to send on.",
    );
  };

  const sendDraft = (body: string) => {
    if (sendWebSocketMessage(request.id, body)) {
      setSendError(null);
      return;
    }
    setSendError("Connect first: there's no open connection to send on.");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-[var(--surface)] px-4 py-3 text-2xs">
        <StatusPill status={status} />
        {session?.url && (
          <span
            className="max-w-[28ch] truncate rounded-full border border-border/70 bg-background/70 px-2.5 py-1 font-mono text-3xs text-muted-foreground"
            title={session.url}
          >
            {session.url}
          </span>
        )}
        <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-2.5 py-1">
          <ArrowUp className="h-3 w-3 text-[var(--status-success)]" aria-hidden />
          <span className="font-mono font-medium text-foreground/90">{counts.sent}</span>
          <ArrowDown className="h-3 w-3 text-primary" aria-hidden />
          <span className="font-mono font-medium text-foreground/90">{counts.received}</span>
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`ws-filter-${request.id}`}>
            Filter messages
          </label>
          <input
            id={`ws-filter-${request.id}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter messages…"
            className="h-7 w-40 rounded-md border border-border bg-background px-2 text-2xs outline-none focus-ring placeholder:text-muted-foreground/60"
          />
          <div className="flex items-center gap-1 rounded-lg border border-border/70 p-0.5">
            {(["all", "sent", "received", "system"] as const).map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                aria-pressed={filter === item}
                className={cn(
                  "rounded-md px-2 py-1 text-3xs font-medium capitalize transition focus-ring",
                  filter === item
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            onClick={() => clearWebSocketLog(request.id)}
            disabled={events.length === 0}
            title="Clear the message log"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-2xs font-medium transition hover:bg-accent disabled:opacity-40 focus-ring"
          >
            <Eraser className="h-3 w-3" aria-hidden /> Clear
          </button>
        </div>
      </div>

      {/* Scrollback */}
      <div className="min-h-0 flex-1">
        <EventLog
          events={visible}
          total={events.length}
          truncated={session?.truncated ?? false}
          status={status}
          hasUrl={Boolean(request.url.trim())}
          filtered={visible.length !== events.length}
        />
      </div>

      {/* Saved drafts */}
      {request.websocket.messageDrafts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-[var(--surface)] px-4 py-2">
          <span className="text-3xs uppercase tracking-wide text-muted-foreground">Saved</span>
          {request.websocket.messageDrafts.map((draft) => (
            <button
              key={draft.id}
              onClick={() => sendDraft(draft.body)}
              disabled={!isOpen}
              title={draft.body.slice(0, 200) || "Empty message"}
              className="max-w-[20ch] truncate rounded-full border border-border bg-background px-2.5 py-1 text-2xs font-medium transition hover:bg-accent disabled:opacity-40 focus-ring"
            >
              {draft.name || "Untitled"}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-border bg-[var(--surface-elevated)] px-4 py-3">
        {sendError && (
          <p role="alert" className="mb-2 text-2xs text-destructive">
            {sendError}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor={`ws-composer-${request.id}`}>
            Message to send
          </label>
          <textarea
            id={`ws-composer-${request.id}`}
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            spellCheck={false}
            placeholder={isOpen ? `Message to send — ⌘↵ to send` : "Connect to send a message"}
            className="min-h-[46px] flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus-ring placeholder:text-muted-foreground/60"
          />
          <button
            onClick={submit}
            disabled={!isOpen || !composer.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50 focus-ring"
          >
            <Send className="h-3.5 w-3.5" aria-hidden /> Send
          </button>
        </div>
      </div>
    </div>
  );
}

function EventLog({
  events,
  total,
  truncated,
  status,
  hasUrl,
  filtered,
}: {
  events: WebSocketEvent[];
  total: number;
  truncated: boolean;
  status: WebSocketStatus;
  hasUrl: boolean;
  filtered: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Follow the tail as messages arrive — a live feed that stays pinned to the
  // top would need scrolling on every single frame to be usable.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

  if (total === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="space-y-1">
          <p className="text-xs font-medium text-foreground/70">
            {status === "connecting" ? "Connecting…" : "No messages yet"}
          </p>
          <p className="text-2xs text-muted-foreground">
            {status === "open"
              ? "Send a message below, or wait for the server to push one."
              : hasUrl
                ? "Press Connect to open the connection."
                : // Connect is disabled without a URL, so telling someone to
                  // press it is a dead end — name the missing thing instead.
                  "Enter a WebSocket URL above (ws:// or wss://), then press Connect."}
          </p>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-2xs text-muted-foreground">
        No messages match this filter — {total} hidden.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      {truncated && (
        <div className="border-b border-border/70 bg-[var(--status-warn)]/10 px-4 py-2 text-2xs text-muted-foreground">
          Showing the most recent {WS_EVENT_LIMIT.toLocaleString()} messages — older ones were
          dropped to keep memory bounded.
        </div>
      )}
      <ul className="divide-y divide-border/70">
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </ul>
      <div ref={bottomRef} />
      {filtered && (
        <div className="px-4 py-2 text-3xs text-muted-foreground">
          {events.length} of {total} messages shown.
        </div>
      )}
    </ScrollArea>
  );
}

function EventRow({ event }: { event: WebSocketEvent }) {
  if (event.direction === "system") {
    return (
      <li className="flex items-start gap-2 bg-[var(--surface)]/60 px-4 py-2 text-2xs text-muted-foreground">
        <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">{event.data}</span>
        <time className="ml-auto shrink-0 font-mono text-3xs tabular-nums">
          {formatTime(event.at)}
        </time>
      </li>
    );
  }

  const outgoing = event.direction === "sent";
  return (
    <li className="space-y-1.5 px-4 py-3">
      <div className="flex items-center gap-2 text-3xs text-muted-foreground">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide",
            outgoing
              ? "bg-[var(--status-success)]/10 text-[var(--status-success)]"
              : "bg-primary/10 text-primary",
          )}
        >
          {outgoing ? (
            <ArrowUp className="h-2.5 w-2.5" aria-hidden />
          ) : (
            <ArrowDown className="h-2.5 w-2.5" aria-hidden />
          )}
          {outgoing ? "Sent" : "Received"}
        </span>
        <span className="font-mono tabular-nums">{event.sizeBytes} B</span>
        <time className="ml-auto font-mono tabular-nums">{formatTime(event.at)}</time>
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
        {event.binary ? event.data : prettyPrintMaybeJson(event.data)}
      </pre>
    </li>
  );
}

function StatusPill({ status }: { status: WebSocketStatus }) {
  const tone =
    status === "open"
      ? "text-[var(--status-success)]"
      : status === "connecting" || status === "closing"
        ? "text-[var(--status-warn)]"
        : "text-muted-foreground";
  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-2.5 py-1"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "open"
            ? "bg-[var(--status-success)]"
            : status === "connecting"
              ? "animate-pulse bg-[var(--status-warn)]"
              : "bg-muted-foreground/60",
        )}
        aria-hidden
      />
      <span className={cn("font-medium", tone)}>{STATUS_LABEL[status]}</span>
    </div>
  );
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour12: false });
}

function prettyPrintMaybeJson(data: string): string {
  try {
    return JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    return data;
  }
}
