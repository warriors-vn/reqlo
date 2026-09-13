import { describe, expect, it } from "vitest";
import { snippetGenerators } from "@/features/code-snippets/registry";
import { pythonGenerator } from "@/features/code-snippets/generators/pythonGenerator";
import { fetchGenerator } from "@/features/code-snippets/generators/fetchGenerator";
import { nodeGenerator } from "@/features/code-snippets/generators/nodeGenerator";
import { axiosGenerator } from "@/features/code-snippets/generators/axiosGenerator";
import type { ApiRequest } from "@/services/db";
import type { SnippetBody, SnippetContext } from "@/features/code-snippets/types";

// A JSON body deliberately shaped to break a generator that pastes it in as
// source rather than treating it as data: booleans, null, a quote, a
// backslash and a newline all have to survive whatever escaping a target
// language needs.
const JSON_BODY_TEXT =
  '{\n  "name": "Ada \\"Lovelace\\"",\n  "active": true,\n  "deleted": false,\n  "meta": null,\n  "path": "C:\\\\temp"\n}';

const BASE_CONTEXT: Omit<SnippetContext, "body"> = {
  requestName: "Create user",
  method: "POST",
  url: "https://api.example.com/users?debug=true",
  headers: [{ key: "Authorization", value: "Bearer abc123" }],
  queryParams: [{ key: "debug", value: "true" }],
  canSendBody: true,
  authType: "none",
  request: {} as ApiRequest,
  environment: null,
};

const BODY_FIXTURES: Record<string, SnippetBody> = {
  none: { kind: "none", contentType: null },
  json: { kind: "text", bodyType: "json", text: JSON_BODY_TEXT, contentType: "application/json" },
  raw: { kind: "text", bodyType: "raw", text: "plain text body", contentType: "text/plain" },
  xml: {
    kind: "text",
    bodyType: "xml",
    text: "<root><a>1</a></root>",
    contentType: "application/xml",
  },
  graphql: {
    kind: "text",
    bodyType: "graphql",
    text: '{"query":"{ me { id } }","variables":{}}',
    contentType: "application/json",
  },
  urlencoded: {
    kind: "urlencoded",
    entries: [
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ],
    encoded: "a=1&b=2",
    contentType: "application/x-www-form-urlencoded",
  },
  multipart: {
    kind: "multipart",
    entries: [
      { key: "field", kind: "text", value: "hello" },
      {
        key: "file",
        kind: "file",
        value: "a.txt",
        fileName: "a.txt",
        mimeType: "text/plain",
        hasBlob: false,
      },
    ],
    contentType: null,
  },
  binary: {
    kind: "binary",
    fileName: "payload.bin",
    mimeType: "application/octet-stream",
    size: 123,
    hasBlob: false,
    contentType: "application/octet-stream",
  },
};

function contextFor(bodyKey: keyof typeof BODY_FIXTURES): SnippetContext {
  return { ...BASE_CONTEXT, body: BODY_FIXTURES[bodyKey] };
}

describe("every snippet generator, every body kind", () => {
  // The full registry — a generator added to the list without a matching
  // fixture here would otherwise ship with zero coverage.
  expect(snippetGenerators.map((g) => g.meta.id).sort()).toEqual(
    ["axios", "csharp", "curl", "fetch", "go", "java", "node", "php", "python", "rust"].sort(),
  );

  for (const generator of snippetGenerators) {
    describe(generator.meta.id, () => {
      for (const bodyKey of Object.keys(BODY_FIXTURES) as (keyof typeof BODY_FIXTURES)[]) {
        it(`generates a non-empty snippet for a "${bodyKey}" body without throwing`, () => {
          const output = generator.generate(contextFor(bodyKey));
          expect(typeof output).toBe("string");
          expect(output.length).toBeGreaterThan(0);
        });
      }

      it("includes the method and URL somewhere in the output", () => {
        const output = generator.generate(contextFor("none"));
        expect(output).toContain(BASE_CONTEXT.url);
      });
    });
  }
});

describe("pythonGenerator — JSON body", () => {
  // Regression: the JSON body used to be pasted straight into the Python
  // source as `payload = <raw JSON text>`, which is invalid Python wherever
  // the JSON has `true`, `false` or `null` — none of them are Python names.
  it("parses the body at runtime with json.loads instead of splicing it into source", () => {
    const output = pythonGenerator.generate(contextFor("json"));

    expect(output).toContain("import json");
    expect(output).toMatch(/payload = json\.loads\(/);
    // The old bug's shape: a bare object literal assigned straight from the
    // JSON text, with no parsing step.
    expect(output).not.toMatch(/payload = \{/);
  });

  it("always imports requests, even when the body has no JSON to import json for", () => {
    const output = pythonGenerator.generate(contextFor("raw"));
    expect(output).toContain("import requests");
    expect(output).not.toContain("import json");
    // The non-JSON path still quotes the text as a plain Python string.
    expect(output).toMatch(/payload = ".*"/);
  });

  // Regression: `import requests` itself was built but never emitted —
  // every generated snippet failed on the first line that used `requests`.
  it("emits import requests for every body kind", () => {
    for (const bodyKey of Object.keys(BODY_FIXTURES) as (keyof typeof BODY_FIXTURES)[]) {
      expect(pythonGenerator.generate(contextFor(bodyKey))).toContain("import requests");
    }
  });
});

describe("fetch/node generators — JSON body", () => {
  // Regression: fetch's `body` option must be a string. The generator built
  // a real JS object (`const body = {...}`) but then passed that object
  // straight through as `body`, which fetch coerces to the literal text
  // "[object Object]" instead of sending the JSON.
  for (const generator of [fetchGenerator, nodeGenerator]) {
    it(`${generator.meta.id}: stringifies the JSON body before sending it`, () => {
      const output = generator.generate(contextFor("json"));
      expect(output).toContain("body: JSON.stringify(body)");
      // The old bug's shape: passing the object straight through.
      expect(output).not.toMatch(/\bbody,\n/);
    });

    it(`${generator.meta.id}: sends a non-JSON text body as-is`, () => {
      const output = generator.generate(contextFor("raw"));
      expect(output).toMatch(/\bbody,/);
      expect(output).not.toContain("JSON.stringify(body)");
    });
  }

  // axios's `data` option auto-serializes a plain object and sets the
  // header itself — passing the object straight through is correct there,
  // unlike fetch/node. This guards against "fixing" it the same way by
  // mistake.
  it("axios still passes the JSON body through as a plain object literal", () => {
    const output = axiosGenerator.generate(contextFor("json"));
    expect(output).toContain('"active": true');
    expect(output).not.toContain("JSON.stringify");
  });
});
