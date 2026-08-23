import { describe, expect, it } from "vitest";
import { parseCurl } from "@/services/curl";

const WORKSPACE_ID = "ws-1";

describe("parseCurl", () => {
  it("defaults to GET and captures the URL", () => {
    const req = parseCurl("curl https://api.example.com/users", WORKSPACE_ID, null);
    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://api.example.com/users");
  });

  it("honors -X/--request to override the method", () => {
    const req = parseCurl("curl -X POST https://api.example.com/users", WORKSPACE_ID, null);
    expect(req.method).toBe("POST");
  });

  it("flips a default GET to POST when -d is present", () => {
    const req = parseCurl(`curl https://api.example.com/users -d '{"a":1}'`, WORKSPACE_ID, null);
    expect(req.method).toBe("POST");
  });

  it("does not override an explicit method when -d is present", () => {
    const req = parseCurl(
      `curl -X PUT https://api.example.com/users -d '{"a":1}'`,
      WORKSPACE_ID,
      null,
    );
    expect(req.method).toBe("PUT");
  });

  it("parses -H headers", () => {
    const req = parseCurl(
      `curl -H "Content-Type: application/json" -H "X-Test: 1" https://api.example.com`,
      WORKSPACE_ID,
      null,
    );
    expect(req.headers.map((h) => [h.key, h.value])).toEqual([
      ["Content-Type", "application/json"],
      ["X-Test", "1"],
    ]);
  });

  it("skips a malformed header with no colon", () => {
    const req = parseCurl(`curl -H "NoColonHere" https://api.example.com`, WORKSPACE_ID, null);
    expect(req.headers).toEqual([]);
  });

  it("infers bodyType json for a JSON-looking body", () => {
    const req = parseCurl(`curl https://api.example.com -d '{"a":1}'`, WORKSPACE_ID, null);
    expect(req.bodyType).toBe("json");
    expect(req.body).toBe('{"a":1}');
  });

  it("infers bodyType raw for a non-JSON body with no matching Content-Type", () => {
    const req = parseCurl(`curl https://api.example.com -d 'plain text'`, WORKSPACE_ID, null);
    expect(req.bodyType).toBe("raw");
  });

  it("infers bodyType xml from the Content-Type header", () => {
    const req = parseCurl(
      `curl -H "Content-Type: application/xml" https://api.example.com -d '<a/>'`,
      WORKSPACE_ID,
      null,
    );
    expect(req.bodyType).toBe("xml");
  });

  it("infers bodyType x-www-form-urlencoded from the Content-Type header", () => {
    const req = parseCurl(
      `curl -H "Content-Type: application/x-www-form-urlencoded" https://api.example.com -d 'a=1&b=2'`,
      WORKSPACE_ID,
      null,
    );
    expect(req.bodyType).toBe("x-www-form-urlencoded");
  });

  it("infers bodyType graphql from the Content-Type header", () => {
    const req = parseCurl(
      `curl -H "Content-Type: application/graphql" https://api.example.com -d 'query { x }'`,
      WORKSPACE_ID,
      null,
    );
    expect(req.bodyType).toBe("graphql");
  });

  it("parses -u into Basic auth", () => {
    const req = parseCurl(`curl -u alice:secret https://api.example.com`, WORKSPACE_ID, null);
    expect(req.auth).toEqual({ type: "basic", username: "alice", password: "secret" });
  });

  it("defaults to no auth when -u is absent", () => {
    const req = parseCurl(`curl https://api.example.com`, WORKSPACE_ID, null);
    expect(req.auth).toEqual({ type: "none" });
  });

  it("handles both single and double quotes during tokenization", () => {
    const req = parseCurl(
      `curl -H 'X-Test: 1' -H "X-Other: 2" 'https://api.example.com/x?y=1 2'`,
      WORKSPACE_ID,
      null,
    );
    expect(req.headers.map((h) => h.key)).toEqual(["X-Test", "X-Other"]);
    expect(req.url).toBe("https://api.example.com/x?y=1 2");
  });

  it("collapses backslash-newline line continuations", () => {
    const input = `curl -X POST \\
  -H "Content-Type: application/json" \\
  https://api.example.com/x`;
    const req = parseCurl(input, WORKSPACE_ID, null);
    expect(req.method).toBe("POST");
    expect(req.headers).toEqual([
      { id: expect.any(String), key: "Content-Type", value: "application/json", enabled: true },
    ]);
    expect(req.url).toBe("https://api.example.com/x");
  });

  it("skips an unknown flag's value without disturbing the rest of the parse", () => {
    const req = parseCurl(
      `curl --max-time 30 -X POST https://api.example.com/x`,
      WORKSPACE_ID,
      null,
    );
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://api.example.com/x");
  });

  it("names the request from the URL pathname", () => {
    const req = parseCurl("curl https://api.example.com/v1/users", WORKSPACE_ID, null);
    expect(req.name).toBe("/v1/users");
  });

  it("falls back to a placeholder name when no URL is found", () => {
    const req = parseCurl("curl -X GET", WORKSPACE_ID, null);
    expect(req.url).toBe("");
    expect(req.name).toBe("Imported cURL");
  });
});
