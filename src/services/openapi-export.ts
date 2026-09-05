// reqlo collection → OpenAPI 3.1.
//
// This is the lossiest of the three exporters, and unavoidably so: OpenAPI
// describes an API's *contract* — what every endpoint accepts and returns —
// while a collection holds concrete example calls. Response schemas, required
// flags and types simply aren't information reqlo has. What it can produce is
// an accurate inventory of endpoints with example requests, which is a useful
// starting point for a spec and an honest one as long as nobody is told it is
// complete. buildOpenApiDocument returns warnings saying exactly that, and the
// export UI shows them.

import type { ApiRequest, Collection, Folder, KV } from "@/services/db";
import { inheritedContributions, resolveAncestors } from "@/services/inheritance";

type JsonObject = Record<string, unknown>;

export interface OpenApiExportResult {
  document: JsonObject;
  warnings: string[];
}

const EXPORTABLE_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch"]);

export function buildOpenApiDocument(
  collection: Collection,
  folders: Folder[],
  requests: ApiRequest[],
): OpenApiExportResult {
  const warnings: string[] = [
    "An OpenAPI document describes what an API accepts and returns. A collection only holds example calls, so this export carries paths, methods, parameters and example bodies — not response schemas, types or required flags.",
  ];

  const scoped = requests.filter((request) => request.collectionId === collection.id);
  const servers = new Set<string>();
  const paths: Record<string, JsonObject> = {};
  const skippedNoUrl: string[] = [];

  for (const request of scoped) {
    const method = request.method.toLowerCase();
    if (!EXPORTABLE_METHODS.has(method)) {
      warnings.push(`"${request.name}": ${request.method} has no place in an OpenAPI path item.`);
      continue;
    }

    const split = splitUrl(request.url);
    if (!split) {
      skippedNoUrl.push(request.name || "Untitled request");
      continue;
    }
    if (split.server) servers.add(split.server);

    const ancestors = resolveAncestors(request, [collection], folders);
    const inherited = inheritedContributions(ancestors);
    const pathItem = (paths[split.path] ??= {});

    if (pathItem[method]) {
      warnings.push(
        `"${request.name}": another request already describes ${request.method} ${split.path}; only the first was exported, since OpenAPI allows one operation per method and path.`,
      );
      continue;
    }

    pathItem[method] = operationFor(request, split, inherited);
  }

  if (skippedNoUrl.length) {
    warnings.push(
      `${skippedNoUrl.length} request(s) had no usable URL and were left out: ${skippedNoUrl.slice(0, 3).join(", ")}${skippedNoUrl.length > 3 ? "…" : ""}.`,
    );
  }

  return {
    document: {
      openapi: "3.1.0",
      info: { title: collection.name || "reqlo collection", version: "1.0.0" },
      ...(servers.size ? { servers: [...servers].map((url) => ({ url })) } : {}),
      paths,
    },
    warnings,
  };
}

function operationFor(
  request: ApiRequest,
  split: SplitUrl,
  inherited: { headers: KV[]; queryParams: KV[] },
): JsonObject {
  const parameters = [
    // Path placeholders come from {{VAR}} segments — see splitUrl.
    ...split.pathParams.map((name) => ({
      name,
      in: "path",
      required: true,
      schema: { type: "string" },
    })),
    ...paramList(dedupeByKey(inherited.queryParams, request.queryParams), "query"),
    ...paramList(dedupeByKey(inherited.headers, request.headers), "header").filter(
      // Content-Type is described by requestBody's own content map; declaring
      // it as a parameter too is invalid per the spec.
      (param) => param.name.toLowerCase() !== "content-type",
    ),
  ];

  const requestBody = bodyFor(request);

  return {
    summary: request.name || "Untitled request",
    operationId: operationId(request, split),
    ...(parameters.length ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    // Required by the spec even when nothing is known about the response.
    responses: {
      default: { description: "No response schema was recorded — reqlo stores example calls." },
    },
  };
}

function paramList(rows: KV[], location: "query" | "header") {
  return rows
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => ({
      name: row.key,
      in: location,
      required: false,
      schema: { type: "string" },
      ...(row.value ? { example: row.value } : {}),
    }));
}

/** The request's own rows win over an inherited row of the same name. */
function dedupeByKey(inherited: KV[], own: KV[]): KV[] {
  const ownKeys = new Set(own.map((row) => row.key.trim().toLowerCase()));
  return [...inherited.filter((row) => !ownKeys.has(row.key.trim().toLowerCase())), ...own];
}

function bodyFor(request: ApiRequest): JsonObject | null {
  const drafts = request.bodyDrafts;
  const example = (mime: string, value: unknown) => ({
    content: { [mime]: { example: value } },
  });

  switch (request.bodyType) {
    case "json": {
      if (!drafts.json.trim()) return null;
      try {
        return example("application/json", JSON.parse(drafts.json) as unknown);
      } catch {
        // Not valid JSON — keep it as text rather than dropping the example.
        return example("application/json", drafts.json);
      }
    }
    case "xml":
      return drafts.xml.trim() ? example("application/xml", drafts.xml) : null;
    case "raw":
      return drafts.raw.trim() ? example("text/plain", drafts.raw) : null;
    case "x-www-form-urlencoded": {
      const rows = drafts.urlEncoded.filter((row) => row.enabled && row.key.trim());
      if (!rows.length) return null;
      return example(
        "application/x-www-form-urlencoded",
        Object.fromEntries(rows.map((row) => [row.key, row.value])),
      );
    }
    case "form-data": {
      const rows = drafts.formData.filter((row) => row.enabled && row.key.trim());
      if (!rows.length) return null;
      return example(
        "multipart/form-data",
        Object.fromEntries(
          rows.map((row) => [row.key, row.kind === "file" ? "<file>" : row.value]),
        ),
      );
    }
    case "graphql":
      return drafts.graphql.query.trim()
        ? example("application/json", {
            query: drafts.graphql.query,
            variables: drafts.graphql.variables,
          })
        : null;
    case "binary":
      return {
        content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
      };
    case "none":
      return null;
  }
}

interface SplitUrl {
  server: string | null;
  path: string;
  pathParams: string[];
}

/**
 * Splits a request URL into an OpenAPI server + path. A `{{VAR}}` inside the
 * path becomes a `{var}` path parameter, which is the closest OpenAPI has to
 * reqlo's templating; a `{{VAR}}` at the *start* of the URL is standing in for
 * the whole base URL, so it becomes the server entry instead.
 */
function splitUrl(rawUrl: string): SplitUrl | null {
  const url = rawUrl.trim();
  if (!url) return null;

  const templatedBase = url.match(/^\{\{\s*([\w.-]+)\s*\}\}(.*)$/);
  if (templatedBase) {
    const { path, pathParams } = toPathTemplate(templatedBase[2] || "/");
    return { server: `{{${templatedBase[1]}}}`, path, pathParams };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // A relative or otherwise unparseable URL still has a usable path.
    if (url.startsWith("/")) {
      const { path, pathParams } = toPathTemplate(url.split("?")[0]);
      return { server: null, path, pathParams };
    }
    return null;
  }

  // Taken from the raw string rather than parsed.pathname: URL percent-encodes
  // the braces, so a {{VAR}} segment would arrive as %7B%7BVAR%7D%7D and never
  // match the template pattern below.
  const rawPath = url.slice(parsed.origin.length).split(/[?#]/)[0] || "/";
  const { path, pathParams } = toPathTemplate(rawPath);
  return { server: parsed.origin, path, pathParams };
}

function toPathTemplate(rawPath: string): { path: string; pathParams: string[] } {
  const pathParams: string[] = [];
  const path = rawPath.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, name: string) => {
    pathParams.push(name);
    return `{${name}}`;
  });
  return { path: path.startsWith("/") ? path : `/${path}`, pathParams };
}

function operationId(request: ApiRequest, split: SplitUrl): string {
  const base = (request.name || `${request.method} ${split.path}`)
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");
  return base || `${request.method.toLowerCase()}Operation`;
}
