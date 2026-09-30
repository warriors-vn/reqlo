// @vitest-environment jsdom
import "@/test/setup-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useStore } from "@/stores/useStore";
import {
  createDefaultRequestDefaults,
  createRequestSnapshot,
  normalizeApiRequest,
  type ApiRequest,
  type Collection,
  type HistoryEntry,
  type Workspace,
} from "@/services/db";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

const COLLECTION_ID = "col-1";

/** downloadJSON builds a blob URL and clicks an anchor — neither exists here,
 * and what these tests care about is what the user is *told*, not the bytes. */
const downloads: string[] = [];
/** …except where the bytes are the point: what each download contained. */
const blobs: Blob[] = [];

beforeEach(() => {
  downloads.length = 0;
  blobs.length = 0;
  vi.clearAllMocks();

  URL.createObjectURL = (blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);
    return "blob:mock";
  };
  URL.revokeObjectURL = () => {};
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = realCreate(tag);
    if (tag === "a") {
      (el as HTMLAnchorElement).click = () => downloads.push((el as HTMLAnchorElement).download);
    }
    return el;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function seed(requests: ApiRequest[], history: HistoryEntry[] = []) {
  const collection: Collection = {
    id: COLLECTION_ID,
    workspaceId: "w",
    name: "Billing",
    position: 0,
    defaults: createDefaultRequestDefaults(),
    createdAt: 0,
  };
  useStore.setState({
    workspace: { id: "w", name: "W", globals: [], createdAt: 0, updatedAt: 0 } as Workspace,
    collections: [collection],
    folders: [],
    requests,
    history,
  });
}

const makeRequest = () =>
  normalizeApiRequest({
    id: "r1",
    workspaceId: "w",
    collectionId: COLLECTION_ID,
    name: "List invoices",
    method: "GET",
    url: "https://api.example.com/invoices",
    createdAt: 0,
    updatedAt: 0,
  });

describe("exporting an empty collection", () => {
  // Downloading a Postman file with an empty `item: []` and saying nothing
  // looks exactly like a successful export of real data. Exporting history as
  // HAR already refuses out loud when there's nothing to export; a collection
  // export has to be just as honest, or the user finds out when the import on
  // the other end comes up blank.
  it("says the collection is empty instead of downloading a file with nothing in it", async () => {
    seed([]);
    await useStore.getState().exportCollectionAsPostman(COLLECTION_ID);

    expect(downloads).toEqual([]);
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("no requests"),
      expect.anything(),
    );
  });

  it("does the same for an OpenAPI export", async () => {
    seed([]);
    await useStore.getState().exportCollectionAsOpenApi(COLLECTION_ID);

    expect(downloads).toEqual([]);
    expect(toast.info).toHaveBeenCalled();
  });

  it("still exports a collection that has requests", async () => {
    seed([makeRequest()]);
    await useStore.getState().exportCollectionAsPostman(COLLECTION_ID);

    expect(downloads).toEqual(["billing.postman_collection.json"]);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("still exports an OpenAPI document that has paths", async () => {
    seed([makeRequest()]);
    await useStore.getState().exportCollectionAsOpenApi(COLLECTION_ID);

    expect(downloads).toEqual(["billing.openapi.json"]);
  });

  // The pre-existing behaviour this is being made consistent with.
  it("already refuses a HAR export with no history", async () => {
    seed([makeRequest()], []);
    await useStore.getState().exportHistoryAsHar();

    expect(downloads).toEqual([]);
    expect(toast.info).toHaveBeenCalled();
  });
});

describe("credentials in the Postman / OpenAPI / HAR exports", () => {
  const withCredentials = () => ({
    ...makeRequest(),
    auth: { type: "bearer" as const, token: "sk-live-request-token" },
    headers: [{ id: "h1", key: "Cookie", value: "session=live-cookie", enabled: true }],
  });

  it("leaves literal credentials out of a Postman export and says so", async () => {
    seed([withCredentials()]);
    await useStore.getState().exportCollectionAsPostman(COLLECTION_ID);

    const exported = await blobs[0].text();
    expect(exported).toContain("List invoices");
    expect(exported).not.toContain("sk-live-request-token");
    expect(exported).not.toContain("live-cookie");
    expect(toast.info).toHaveBeenCalledWith(
      "2 credentials were left out of this export",
      expect.anything(),
    );
  });

  it("leaves them out of an OpenAPI export", async () => {
    seed([withCredentials()]);
    await useStore.getState().exportCollectionAsOpenApi(COLLECTION_ID);

    const exported = await blobs[0].text();
    expect(exported).toContain("/invoices");
    expect(exported).not.toContain("sk-live-request-token");
    expect(exported).not.toContain("live-cookie");
  });

  it("leaves them, and the response's Set-Cookie, out of a HAR export", async () => {
    const request = withCredentials();
    seed(
      [request],
      [
        {
          id: "h1",
          workspaceId: "w",
          requestId: request.id,
          requestName: request.name,
          method: "GET",
          url: request.url,
          status: 200,
          ok: true,
          durationMs: 1,
          sizeBytes: 0,
          executedAt: 0,
          environmentId: null,
          environmentName: null,
          favorite: false,
          pinned: false,
          searchText: "",
          snapshot: createRequestSnapshot(request),
          responseKind: "text",
          responseContentType: "text/plain",
          responseHeaders: { "set-cookie": "sid=live-set-cookie" },
          responseBody: "",
          responseBodyTruncated: false,
        },
      ],
    );
    await useStore.getState().exportHistoryAsHar();

    const exported = await blobs[0].text();
    expect(exported).toContain("/invoices");
    expect(exported).not.toContain("sk-live-request-token");
    expect(exported).not.toContain("live-cookie");
    expect(exported).not.toContain("live-set-cookie");
  });
});
