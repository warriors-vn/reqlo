/**
 * Browsers give a page no way to set headers on a WebSocket handshake —
 * `new WebSocket(url, protocols)` takes a URL and a subprotocol list, and
 * nothing else. Showing an editor here would accept rows that silently never
 * go out, so the tab says what's actually possible instead.
 */
export function WebSocketHeadersNotice() {
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border/70 bg-muted/20 p-3">
      <p className="text-xs font-medium text-foreground/80">
        Custom headers can&apos;t be sent on a WebSocket handshake.
      </p>
      <p className="text-2xs leading-relaxed text-muted-foreground">
        This is a browser limitation, not a reqlo one: the WebSocket API takes only a URL and a
        subprotocol list. Servers that need credentials on a WebSocket usually read them from a
        query parameter, or expect the first message after connecting to carry them.
      </p>
      <p className="text-2xs leading-relaxed text-muted-foreground">
        Use the <span className="font-medium text-foreground/80">Params</span> tab for a query
        parameter, <span className="font-medium text-foreground/80">Message</span> for a saved auth
        frame, or <span className="font-medium text-foreground/80">Message</span> &rarr;
        Subprotocols for <code className="font-mono">Sec-WebSocket-Protocol</code>.
      </p>
    </div>
  );
}

/** Auth that lands in a header can't reach a WebSocket handshake either — see
 * WebSocketHeadersNotice. Query-parameter auth does, so the editor stays. */
export function WebSocketAuthNotice() {
  return (
    <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-2xs leading-relaxed text-muted-foreground">
      On a WebSocket, only <span className="font-medium text-foreground/80">API key</span> set to
      &ldquo;Add to: query&rdquo; actually reaches the server — every other type sends an{" "}
      <code className="font-mono">Authorization</code> header, which a browser won&apos;t attach to
      a handshake.
    </p>
  );
}
