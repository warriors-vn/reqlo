import { Plus, X } from "lucide-react";
import { useStore } from "@/stores/useStore";
import {
  createEmptyWebSocketMessageDraft,
  type ApiRequest,
  type WebSocketMessageDraft,
} from "@/services/db";

/**
 * The WebSocket request's own settings: the subprotocols offered during the
 * handshake, and the message bodies saved for re-sending. Everything else a
 * WebSocket needs (URL, query params, variables) is shared with HTTP and
 * edited in the same places.
 */
export function RequestWebSocketEditor({ request }: { request: ApiRequest }) {
  const updateRequest = useStore((s) => s.updateRequest);
  const config = request.websocket;

  const patch = (next: Partial<typeof config>) =>
    void updateRequest(request.id, { websocket: { ...config, ...next } });

  const updateDraft = (id: string, next: Partial<WebSocketMessageDraft>) =>
    patch({
      messageDrafts: config.messageDrafts.map((draft) =>
        draft.id === id ? { ...draft, ...next } : draft,
      ),
    });

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div>
          <h3 className="text-xs font-semibold tracking-tight">Subprotocols</h3>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Offered as <code className="font-mono">Sec-WebSocket-Protocol</code> during the
            handshake; the server picks one. Comma-separated. This is the only handshake header a
            browser lets a page set — see the Headers tab.
          </p>
        </div>
        <input
          value={config.subprotocols.join(", ")}
          onChange={(e) =>
            patch({
              subprotocols: e.target.value
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            })
          }
          placeholder="graphql-transport-ws, json"
          spellCheck={false}
          aria-label="Subprotocols"
          className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus-ring placeholder:text-muted-foreground/60"
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold tracking-tight">Saved messages</h3>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Bodies you send often — a subscribe frame, a ping. They appear as buttons above the
              composer once connected. Saved with the request; the message log is not.
            </p>
          </div>
          <button
            onClick={() =>
              patch({
                messageDrafts: [
                  ...config.messageDrafts,
                  createEmptyWebSocketMessageDraft(`Message ${config.messageDrafts.length + 1}`),
                ],
              })
            }
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-2xs font-medium transition hover:bg-accent focus-ring"
          >
            <Plus className="h-3 w-3" aria-hidden /> Add
          </button>
        </div>

        {config.messageDrafts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-center text-2xs text-muted-foreground">
            No saved messages. Anything typed in the composer is still sendable without saving it
            here.
          </p>
        ) : (
          <ul className="space-y-2">
            {config.messageDrafts.map((draft) => (
              <li key={draft.id} className="space-y-1.5 rounded-xl border border-border p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    value={draft.name}
                    onChange={(e) => updateDraft(draft.id, { name: e.target.value })}
                    placeholder="Name"
                    aria-label="Message name"
                    className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus-ring"
                  />
                  <select
                    value={draft.contentType}
                    onChange={(e) =>
                      updateDraft(draft.id, {
                        contentType: e.target.value as WebSocketMessageDraft["contentType"],
                      })
                    }
                    aria-label="Message format"
                    className="h-7 cursor-pointer rounded-md border border-border bg-background px-2 text-2xs outline-none focus-ring"
                  >
                    <option value="json">JSON</option>
                    <option value="text">Text</option>
                  </select>
                  <button
                    onClick={() =>
                      patch({
                        messageDrafts: config.messageDrafts.filter((item) => item.id !== draft.id),
                      })
                    }
                    aria-label={`Remove ${draft.name || "message"}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-destructive focus-ring"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <textarea
                  value={draft.body}
                  onChange={(e) => updateDraft(draft.id, { body: e.target.value })}
                  rows={3}
                  spellCheck={false}
                  placeholder={
                    draft.contentType === "json" ? `{"type":"subscribe"}` : "Message body"
                  }
                  aria-label={`${draft.name || "Message"} body`}
                  className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus-ring placeholder:text-muted-foreground/60"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
