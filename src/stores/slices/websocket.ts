// Live WebSocket connections, keyed by request id.
//
// Session-only and never written to IndexedDB — the same treatment
// graphqlSchemas gets (core.ts), and for a stronger reason: a message log is
// a record of one connection, not a property of the request. What *is* saved
// is the message drafts, which live on the request itself.
//
// The sockets themselves are held outside the store state, in a module-level
// map: a WebSocketSession is not serializable, and putting it in state would
// have every subscriber re-render on an object that never meaningfully
// changes.

import { WebSocketSession, type WebSocketEvent, type WebSocketStatus } from "@/services/websocket";
import {
  buildResolvedRequestArtifacts,
  mergeGlobalsIntoEnvironment,
  resolveTemplate,
} from "@/features/code-snippets/utils/request-resolver";
import type { SliceCreator } from "@/stores/types";

/** Kept bounded: a chatty feed would otherwise grow until the tab runs out of
 * memory. The oldest events fall off the front once the cap is hit. */
export const WS_EVENT_LIMIT = 500;

export interface WsSessionState {
  status: WebSocketStatus;
  /** The URL actually connected to — templates resolved — so the console can
   * show what went out rather than what was typed. */
  url: string;
  events: WebSocketEvent[];
  /** True once WS_EVENT_LIMIT has forced older events out of `events`. */
  truncated: boolean;
  connectedAt: number | null;
}

const sockets = new Map<string, WebSocketSession>();

export interface WebSocketSlice {
  wsSessions: Record<string, WsSessionState>;

  connectWebSocket: (requestId: string) => void;
  disconnectWebSocket: (requestId: string) => void;
  sendWebSocketMessage: (requestId: string, data: string) => boolean;
  clearWebSocketLog: (requestId: string) => void;
  /** Closes and forgets a request's connection entirely — for when the
   * request itself is going away, not for the user's Disconnect button. */
  discardWebSocketSession: (requestId: string) => void;
}

export const createWebSocketSlice: SliceCreator<WebSocketSlice> = (set, get) => ({
  wsSessions: {},

  connectWebSocket: (requestId) => {
    const request = get().requests.find((r) => r.id === requestId);
    if (!request) return;
    const existing = sockets.get(requestId);
    if (existing && (existing.status === "open" || existing.status === "connecting")) return;

    // The URL and subprotocols go through the same resolution every HTTP send
    // uses, so {{VAR}} templating and inherited collection variables work
    // here exactly as they do there.
    const state = get();
    const environment = mergeGlobalsIntoEnvironment(
      state.environments.find((env) => env.id === state.activeEnvId) ?? null,
      state.workspace?.globals ?? [],
    );
    const { url, envMap } = buildResolvedRequestArtifacts(
      request,
      environment,
      state.getRequestAncestors(requestId),
    );
    const subprotocols = request.websocket.subprotocols
      .map((value) => resolveTemplate(value, envMap))
      .filter(Boolean);

    set((s) => ({
      wsSessions: {
        ...s.wsSessions,
        [requestId]: { status: "connecting", url, events: [], truncated: false, connectedAt: null },
      },
    }));

    const session = new WebSocketSession({
      url,
      subprotocols,
      handlers: {
        onStatus: (status) => {
          set((s) => {
            const current = s.wsSessions[requestId];
            if (!current) return s;
            return {
              wsSessions: {
                ...s.wsSessions,
                [requestId]: {
                  ...current,
                  status,
                  connectedAt: status === "open" ? Date.now() : current.connectedAt,
                },
              },
            };
          });
        },
        onEvent: (event) => {
          set((s) => {
            const current = s.wsSessions[requestId];
            if (!current) return s;
            const events = [...current.events, event];
            const overflowed = events.length > WS_EVENT_LIMIT;
            return {
              wsSessions: {
                ...s.wsSessions,
                [requestId]: {
                  ...current,
                  events: overflowed ? events.slice(-WS_EVENT_LIMIT) : events,
                  truncated: current.truncated || overflowed,
                },
              },
            };
          });
        },
      },
    });

    sockets.set(requestId, session);
    session.connect();
  },

  disconnectWebSocket: (requestId) => {
    sockets.get(requestId)?.close();
  },

  sendWebSocketMessage: (requestId, data) => {
    const session = sockets.get(requestId);
    if (!session) return false;
    return session.send(data);
  },

  discardWebSocketSession: (requestId) => {
    sockets.get(requestId)?.close();
    sockets.delete(requestId);
  },

  clearWebSocketLog: (requestId) => {
    set((s) => {
      const current = s.wsSessions[requestId];
      if (!current) return s;
      return {
        wsSessions: { ...s.wsSessions, [requestId]: { ...current, events: [], truncated: false } },
      };
    });
  },
});

/** Test seam: closes and forgets every live socket. Also what a full page
 * teardown would do — nothing else holds these. */
export function closeAllWebSocketSessions(): void {
  for (const session of sockets.values()) session.close();
  sockets.clear();
}
