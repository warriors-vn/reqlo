import { useMemo } from "react";
import { parseSseEvents } from "@/lib/sse";

/** Renders a `text/event-stream` body as discrete frames rather than raw
 * text. Used both for a finished stream response and for the live partial
 * text while one is still arriving. */
export function SseEventList({ text }: { text: string }) {
  const events = useMemo(() => parseSseEvents(text), [text]);

  if (events.length === 0) {
    return (
      <div className="grid h-full min-h-[160px] place-items-center p-6 text-center text-sm text-muted-foreground">
        No events yet.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/70">
      {events.map((event, index) => (
        <div key={index} className="space-y-1.5 p-4">
          <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono">#{index + 1}</span>
            {event.event && (
              <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-foreground/80">
                {event.event}
              </span>
            )}
            {event.id && <span className="font-mono">id: {event.id}</span>}
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
            {prettyPrintMaybeJson(event.data)}
          </pre>
        </div>
      ))}
    </div>
  );
}

function prettyPrintMaybeJson(data: string): string {
  try {
    return JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    return data;
  }
}
