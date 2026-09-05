// reqlo history → HAR 1.2.
//
// Built from HISTORY, not from a collection, and that's the whole point: a HAR
// is a log of requests that actually happened, with the responses they got. A
// collection is a set of requests that have not. Exporting a collection as HAR
// would mean inventing responses; exporting history is the honest mapping, and
// it's what makes the file useful in a browser devtools viewer or any HAR
// analyzer.

import type { HistoryEntry, KV } from "@/services/db";

interface HarNameValue {
  name: string;
  value: string;
}

export interface HarExportResult {
  log: {
    version: "1.2";
    creator: { name: string; version: string };
    entries: HarEntry[];
  };
}

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    cookies: never[];
    headers: HarNameValue[];
    queryString: HarNameValue[];
    postData?: { mimeType: string; text: string };
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    cookies: never[];
    headers: HarNameValue[];
    content: { size: number; mimeType: string; text?: string };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, never>;
  timings: { send: number; wait: number; receive: number };
}

/** -1 is HAR's own "not known", which is the truth here: reqlo sends through
 * fetch and never sees the raw byte counts on the wire. */
const UNKNOWN_SIZE = -1;

export function buildHarLog(entries: HistoryEntry[], appVersion = "1.5.0"): HarExportResult {
  return {
    log: {
      version: "1.2",
      creator: { name: "reqlo", version: appVersion },
      // Oldest first, the order a capture would have produced.
      entries: [...entries]
        .sort((a, b) => a.executedAt - b.executedAt)
        .map((entry) => toHarEntry(entry)),
    },
  };
}

function toHarEntry(entry: HistoryEntry): HarEntry {
  const snapshot = entry.snapshot;
  const requestHeaders = toNameValues(snapshot.headers);
  const postData = bodyOf(entry);

  return {
    startedDateTime: new Date(entry.executedAt).toISOString(),
    time: Math.round(entry.durationMs),
    request: {
      method: entry.method,
      url: entry.url,
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: requestHeaders,
      queryString: toNameValues(snapshot.queryParams),
      ...(postData ? { postData } : {}),
      headersSize: UNKNOWN_SIZE,
      bodySize: postData ? byteLength(postData.text) : 0,
    },
    response: {
      // A send that never reached a server has no status. HAR spells that 0,
      // which viewers render as a failed request rather than as a 200.
      status: entry.status ?? 0,
      statusText: entry.status === null ? (entry.errorMessage ?? "Failed") : "",
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: Object.entries(entry.responseHeaders).map(([name, value]) => ({ name, value })),
      content: {
        size: entry.sizeBytes,
        mimeType: entry.responseContentType || "application/octet-stream",
        // Omitted rather than truncated-and-passed-off-as-complete: history
        // caps large bodies, and a HAR consumer has no way to tell a clipped
        // body from a short one.
        ...(entry.responseBodyTruncated ? {} : { text: entry.responseBody }),
      },
      redirectURL: "",
      headersSize: UNKNOWN_SIZE,
      bodySize: entry.sizeBytes,
    },
    cache: {},
    timings: { send: 0, wait: Math.round(entry.durationMs), receive: 0 },
  };
}

function bodyOf(entry: HistoryEntry): { mimeType: string; text: string } | null {
  const snapshot = entry.snapshot;
  if (entry.method === "GET" || entry.method === "HEAD") return null;

  switch (snapshot.bodyType) {
    case "json":
      return { mimeType: "application/json", text: snapshot.bodyDrafts.json };
    case "xml":
      return { mimeType: "application/xml", text: snapshot.bodyDrafts.xml };
    case "raw":
      return { mimeType: "text/plain", text: snapshot.bodyDrafts.raw };
    case "x-www-form-urlencoded":
      return {
        mimeType: "application/x-www-form-urlencoded",
        text: new URLSearchParams(
          snapshot.bodyDrafts.urlEncoded
            .filter((row) => row.enabled && row.key.trim())
            .map((row) => [row.key, row.value] as [string, string]),
        ).toString(),
      };
    case "graphql":
      return {
        mimeType: "application/json",
        text: JSON.stringify({
          query: snapshot.bodyDrafts.graphql.query,
          variables: snapshot.bodyDrafts.graphql.variables,
        }),
      };
    // form-data and binary carry file contents a HAR can't hold either, and
    // "none" has nothing to write.
    case "form-data":
    case "binary":
    case "none":
      return null;
  }
}

function toNameValues(rows: KV[]): HarNameValue[] {
  return rows
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => ({ name: row.key, value: row.value }));
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
