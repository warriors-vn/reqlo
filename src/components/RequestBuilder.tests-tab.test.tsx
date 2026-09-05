// @vitest-environment jsdom
import "@/test/setup-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequestBuilder } from "@/components/RequestBuilder";
import { useStore } from "@/stores/useStore";
import { normalizeApiRequest, uid, type ApiRequest, type AssertionRule } from "@/services/db";
import type { ExecutionResult } from "@/services/execution";

// Opening the Script tab lazily pulls in Monaco, whose package entry Vite
// can't resolve under vitest — it surfaces as an unhandled "Failed to resolve
// entry for package monaco-editor" that fails whichever test happens to be
// running when the import settles. The editor itself isn't what these tests
// are about; the phase toggle and where it writes are.
vi.mock("@/features/request-body/editors/LazyTextCodeEditor", () => ({
  LazyTextCodeEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (next: string) => void;
  }) => (
    <textarea aria-label="Script source" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

function seedRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  const now = Date.now();
  const request = normalizeApiRequest({
    id: uid(),
    workspaceId: "ws-1",
    name: "Req",
    method: "GET",
    url: "https://api.example.com",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  useStore.setState({
    requests: [request],
    collections: [],
    folders: [],
    environments: [],
    activeEnvId: null,
    workspace: null,
  });
  return request;
}

function makeResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    status: 200,
    statusText: "OK",
    durationMs: 5,
    sizeBytes: 2,
    headers: { "content-type": "application/json" },
    body: "{}",
    contentType: "application/json",
    ok: true,
    responseKind: "json",
    blob: null,
    fileName: null,
    ...overrides,
  };
}

/** Re-reads the request from the store on every render, the way Workspace.tsx
 * derives `activeRequest`. Rendering RequestBuilder with a captured object
 * instead leaves it holding a stale request, so a second edit writes back over
 * the first — an artifact of the test setup, not of the component. */
function Wrapper({ requestId, result }: { requestId: string; result?: ExecutionResult | null }) {
  const request = useStore((s) => s.requests.find((r) => r.id === requestId));
  if (!request) return null;
  return (
    <RequestBuilder
      request={request}
      result={result ?? null}
      onSend={() => {}}
      onCancel={() => {}}
      sending={false}
    />
  );
}

const statusRule: AssertionRule = {
  id: "rule-1",
  enabled: true,
  kind: "status",
  path: "",
  operator: "equals",
  expected: "200",
};

afterEach(() => {
  cleanup();
});

describe("RequestBuilder — the Tests tab counts script tests alongside rules", () => {
  it("renders post-response test results with their pass/fail state", async () => {
    const request = seedRequest();
    const result = makeResult({
      scriptTests: [
        { name: "is 200", passed: true, message: "" },
        { name: "has a token", passed: false, message: "expected a truthy value, got null" },
      ],
    });
    const user = userEvent.setup();
    render(<Wrapper requestId={request.id} result={result} />);

    await user.click(screen.getByRole("tab", { name: /^Tests/ }));

    expect(screen.getByText("is 200")).toBeInTheDocument();
    expect(screen.getByText("has a token")).toBeInTheDocument();
    expect(screen.getByText(/expected a truthy value, got null/)).toBeInTheDocument();
    expect(screen.getByText("PASS")).toBeInTheDocument();
    expect(screen.getByText("FAIL")).toBeInTheDocument();
  });

  // One number, not two: a declarative rule and a script test both answer
  // "did this response pass?", so the badge has to add them together or it
  // under-reports whichever half the user isn't looking at.
  it("adds script tests into the tab badge's ran-count", async () => {
    const request = seedRequest({ assertions: [statusRule] });
    const result = makeResult({
      scriptTests: [
        { name: "a", passed: true, message: "" },
        { name: "b", passed: false, message: "nope" },
      ],
    });
    render(<Wrapper requestId={request.id} result={result} />);

    // 1 rule (passes against status 200) + 2 script tests, 1 of which failed.
    expect(screen.getByRole("tab", { name: /^Tests/ })).toHaveTextContent("2/3");
  });

  it("counts an enabled post-response script in the badge before anything has run", () => {
    const request = seedRequest({
      assertions: [statusRule],
      postResponseScript: { enabled: true, source: `test("x", () => {});` },
    });
    render(<Wrapper requestId={request.id} result={null} />);

    // The rule plus the script itself — the script's own test count isn't
    // knowable until it runs.
    expect(screen.getByRole("tab", { name: /^Tests/ })).toHaveTextContent("2");
  });

  it("surfaces a post-response script failure instead of leaving the tab silent", async () => {
    const request = seedRequest();
    const result = makeResult({ postScriptError: "ReferenceError: nope is not defined" });
    const user = userEvent.setup();
    render(<Wrapper requestId={request.id} result={result} />);

    await user.click(screen.getByRole("tab", { name: /^Tests/ }));

    expect(screen.getByText(/Post-response script failed/)).toBeInTheDocument();
    expect(screen.getByText(/nope is not defined/)).toBeInTheDocument();
  });
});

describe("RequestScriptEditor — the two phases are separate slots", () => {
  it("writes the enabled flag to postResponseScript, not preRequestScript", async () => {
    const request = seedRequest();
    const user = userEvent.setup();
    render(<Wrapper requestId={request.id} result={null} />);

    await user.click(screen.getByRole("tab", { name: /^Script/ }));
    await user.click(screen.getByRole("tab", { name: "Post-response" }));
    await user.click(screen.getByRole("checkbox"));
    await user.type(screen.getByLabelText("Script source"), "ok");

    const stored = useStore.getState().requests[0];
    expect(stored.postResponseScript.enabled).toBe(true);
    expect(stored.postResponseScript.source).toBe("ok");
    // The pre-request slot is untouched — the toggle picks a slot, it doesn't
    // move one script between two names.
    expect(stored.preRequestScript.enabled).toBe(false);
    expect(stored.preRequestScript.source).toBe("");
  });
});
