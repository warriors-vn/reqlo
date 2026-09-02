// @vitest-environment jsdom
import "@/test/setup-dom";
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { CollectionRunnerModal } from "@/components/CollectionRunnerModal";
import { useStore } from "@/stores/useStore";
import { normalizeApiRequest, uid, type ApiRequest, type Collection } from "@/services/db";
import * as runner from "@/services/runner";
import type { RunSingleRequestOutcome } from "@/services/runner";

function seedCollection(requestCount: number): { collection: Collection; requests: ApiRequest[] } {
  const now = Date.now();
  const collection: Collection = {
    id: uid(),
    workspaceId: "ws-1",
    name: "Col",
    position: 0,
    createdAt: now,
  };
  const requests = Array.from({ length: requestCount }, (_, index) =>
    normalizeApiRequest({
      id: uid(),
      workspaceId: "ws-1",
      collectionId: collection.id,
      name: `Req ${index}`,
      method: "GET",
      url: "https://api.example.com",
      position: index,
      createdAt: now,
      updatedAt: now,
    }),
  );

  useStore.setState((s) => ({
    collections: [collection],
    folders: [],
    requests,
    environments: [],
    activeEnvId: null,
    workspace: { id: "ws-1", name: "WS", globals: [], createdAt: now, updatedAt: now },
    activeRun: null,
    runnerTarget: null,
    overlays: { ...s.overlays, runner: false },
  }));

  return { collection, requests };
}

function successOutcome(): RunSingleRequestOutcome {
  return {
    result: {
      status: 200,
      statusText: "OK",
      durationMs: 12,
      sizeBytes: 2,
      headers: {},
      body: "{}",
      contentType: "application/json",
      ok: true,
      responseKind: "json",
      blob: null,
      fileName: null,
    },
    assertionOutcomes: [],
    extractedVariables: [],
    extractFailures: [],
    noActiveEnvironment: false,
    scriptEnvironmentDropped: false,
  };
}

// Regression test for a gap the v1.2.0 hardening review flagged and
// deliberately deferred: reportDbWriteFailure() (useStore.ts) now rethrows
// after toasting, so a DB write failure inside runSingleRequest (history/
// environment/request persistence) can throw where it used to fail silently.
// Before this fix, that throw would leave the row that was mid-flight stuck
// at "running" forever, even though the run's own `finally` already cleared
// `activeRun` — a permanent per-row spinner surviving a run that had
// technically already stopped.
describe("CollectionRunnerModal — a write failure doesn't strand a row at 'running'", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("marks the failed row done with an error instead of leaving it stuck, and still runs the rest", async () => {
    const { collection } = seedCollection(2);
    const spy = vi.spyOn(runner, "runSingleRequest");
    spy.mockRejectedValueOnce(new Error("Change not saved"));
    spy.mockResolvedValueOnce(successOutcome());

    render(<CollectionRunnerModal />);
    act(() => {
      useStore.getState().startRun({ type: "collection", id: collection.id });
    });

    // The run finishes (activeRun clears) instead of hanging forever.
    await waitFor(() => expect(useStore.getState().activeRun).toBeNull());

    // The failed row surfaces the write-failure message instead of staying
    // at "running" with no explanation.
    expect(await screen.findByText("Change not saved")).toBeInTheDocument();

    // The second request still ran — one row's write failure didn't abort
    // the rest of the batch.
    expect(await screen.findByText("1/2 requests passed")).toBeInTheDocument();

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
