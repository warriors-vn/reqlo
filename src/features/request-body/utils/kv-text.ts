/**
 * Round-trips a `KVEditor` row list to/from a `Key: Value` text block, for the
 * Params/Headers bulk-edit toggle — one line per row, a leading `#` marks a
 * disabled row, always N rows in ⟺ N lines out (blank lines included) so a
 * trailing newline behaves like "Add row" and nothing silently disappears.
 */
export interface KVTextRow {
  key: string;
  value: string;
  enabled: boolean;
}

export function serializeKVText(rows: KVTextRow[]): string {
  return rows.map(serializeKVLine).join("\n");
}

function serializeKVLine({ key, value, enabled }: KVTextRow): string {
  // An *enabled* key that itself starts with "#" would otherwise be
  // indistinguishable from the disabled marker below — escape it by adding
  // one more leading "#". Disabled rows never need this: their marker is a
  // fixed "# " (hash-space), so a disabled line can never start with "##".
  const safeKey = enabled && key.startsWith("#") ? `#${key}` : key;
  const prefix = enabled ? "" : "# ";
  return value ? `${prefix}${safeKey}: ${value}` : `${prefix}${safeKey}:`;
}

export function parseKVText(text: string): KVTextRow[] {
  // A genuinely empty document means zero rows — selecting all and deleting
  // everything is how a user actually clears a Params/Headers list, and a
  // phantom blank row surviving that (then showing up in Rows view where
  // "No entries" should) would look like nothing happened. This is distinct
  // from a blank *line* elsewhere in otherwise non-empty text (e.g. a
  // trailing newline after real content), which still yields its own row
  // below — that one really is "Add row" via Enter, not "clear everything".
  if (text === "") return [];
  // Normalizes CRLF/CR endings too — a block pasted from Windows or exported
  // by another tool shouldn't leave a trailing "\r" baked into every value.
  return text.split(/\r\n|\r|\n/).map(parseKVLine);
}

function parseKVLine(line: string): KVTextRow {
  if (line.startsWith("##")) {
    // Our own escape from serializeKVLine: an enabled key starting with "#".
    // Un-escape by dropping exactly one leading "#" and parse the rest as a
    // normal (enabled) line — never re-checked against the disabled marker.
    return { ...parseKeyValue(line.slice(1)), enabled: true };
  }

  const disabledMatch = /^#\s?(.*)$/.exec(line);
  if (disabledMatch) return { ...parseKeyValue(disabledMatch[1]), enabled: false };

  return { ...parseKeyValue(line), enabled: true };
}

function parseKeyValue(body: string): Omit<KVTextRow, "enabled"> {
  const colonIndex = findKeyValueSeparator(body);
  if (colonIndex === -1) return { key: body, value: "" };

  const key = body.slice(0, colonIndex);
  const rest = body.slice(colonIndex + 1);
  const value = rest.startsWith(" ") ? rest.slice(1) : rest;
  return { key, value };
}

/**
 * The first colon isn't necessarily the key/value boundary — a param key
 * like "filter:eq" is legal and real (REST filter-operator conventions), so
 * naively splitting on any bare colon corrupts it. `serializeKVLine` only
 * ever emits a colon as a separator in one of two exact shapes — ": "
 * (colon-space) or a trailing ":" with nothing after — so only a colon
 * matching one of those counts; a colon embedded in the key with no
 * following space is left alone. (A key that itself contains literal ": "
 * is the one case this still can't tell apart — narrower than the original
 * bug, not eliminated outright.)
 */
function findKeyValueSeparator(body: string): number {
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== ":") continue;
    if (i === body.length - 1 || body[i + 1] === " ") return i;
  }
  return -1;
}
