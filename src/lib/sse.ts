export interface SseEvent {
  event: string | null;
  data: string;
  id: string | null;
}

/**
 * Parses Server-Sent Events framing (the WHATWG spec's field grammar) for
 * display purposes — not a real EventSource: no reconnect, no `retry:`
 * handling, nothing dispatched anywhere. Frames are separated by a blank
 * line; multiple `data:` lines within one frame join with "\n"; a line
 * starting with ":" is a comment and ignored.
 *
 * Deliberately tolerant of an unterminated trailing frame (no blank line
 * yet) — this is called on partial, still-arriving text for the live view
 * as much as on a finished response, and the in-progress frame is exactly
 * what a "still receiving…" render needs to show.
 */
export function parseSseEvents(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  let event: string | null = null;
  let id: string | null = null;
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0 && event === null && id === null) return;
    events.push({ event, data: dataLines.join("\n"), id });
    event = null;
    id = null;
    dataLines = [];
  };

  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith(":")) continue;

    const colonIndex = line.indexOf(":");
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    const rawValue = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "data") dataLines.push(value);
    else if (field === "event") event = value;
    else if (field === "id") id = value;
    // Other fields (e.g. "retry") don't affect what's shown, so they're
    // parsed (to stay off the ":"-comment path) and otherwise ignored.
  }
  flush();

  return events;
}
