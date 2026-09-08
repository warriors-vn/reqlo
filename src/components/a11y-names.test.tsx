// @vitest-environment jsdom
import "@/test/setup-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { computeAccessibleName } from "dom-accessibility-api";

import { RequestBuilder } from "@/components/RequestBuilder";
import { WebSocketConsole } from "@/components/WebSocketConsole";
import { RequestWebSocketEditor } from "@/components/RequestWebSocketEditor";
import { CollectionSettingsModal } from "@/components/CollectionSettingsModal";
import { ResponseViewer } from "@/components/ResponseViewer";
import { CodeSnippetPanel } from "@/features/code-snippets/components/CodeSnippetPanel";
import { AdvancedBodyEditor } from "@/features/request-body/components/AdvancedBodyEditor";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { Sidebar } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { ImportCurlModal } from "@/components/ImportCurlModal";
import { SettingsModal } from "@/components/SettingsModal";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { EnvironmentSwitcher } from "@/components/EnvironmentSwitcher";
import { registerBuiltInCommands } from "@/core/commands/handlers";
import { useStore } from "@/stores/useStore";
import {
  createDefaultRequestDefaults,
  createDefaultWebSocketConfig,
  normalizeApiRequest,
  type ApiRequest,
  createDefaultBodyDrafts,
  createEmptyFormDataRow,
  type Collection,
  type Workspace,
} from "@/services/db";
import type { ExecutionResult } from "@/services/execution";

// Monaco's package entry doesn't resolve under vitest; the editor itself isn't
// what an accessible-name audit is about.
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

/**
 * Every control a keyboard or screen-reader user can reach has to announce
 * itself as something. An icon-only button with no name is read out as just
 * "button", which tells the user nothing about what pressing it does — the
 * single most common a11y defect in an icon-dense UI like this one, and the
 * thing this sweep is looking for across the surfaces v1.5.0 added.
 *
 * role="option"/"checkbox"/"switch"/"combobox" and <summary> were added
 * after v1.5.1's audit found the original list missed everywhere this app
 * actually uses those roles (TemplateInput's autocomplete listbox, for one).
 * A role="option" reached only by roving/virtual focus (no explicit
 * tabindex, or tabindex="-1") is excluded below by the same tabIndex check
 * that already excludes it — the widened list only ever adds coverage, it
 * doesn't relax the "must be reachable" requirement.
 */
const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="combobox"]',
].join(",");

function unnamedControls(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((el) => el.getAttribute("aria-hidden") !== "true")
    .filter((el) => el.tabIndex !== -1)
    .filter((el) => !computeAccessibleName(el).trim())
    .map(describe_);
}

function describe_(el: HTMLElement): string {
  const attrs = ["type", "class"]
    .map((name) =>
      el.getAttribute(name) ? `${name}="${el.getAttribute(name)?.slice(0, 40)}"` : "",
    )
    .filter(Boolean)
    .join(" ");
  return `<${el.tagName.toLowerCase()} ${attrs}>`;
}

const REQUEST_ID = "req-1";
const COLLECTION_ID = "col-1";

function seedRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  const request = normalizeApiRequest({
    id: REQUEST_ID,
    workspaceId: "w",
    collectionId: COLLECTION_ID,
    name: "Req",
    method: "GET",
    url: "https://api.example.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  });
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
    requests: [request],
    collections: [collection],
    folders: [],
    environments: [],
    activeEnvId: null,
    wsSessions: {},
  });
  return request;
}

const seedWs = () =>
  seedRequest({
    protocol: "websocket",
    url: "wss://echo.example.com/socket",
    websocket: createDefaultWebSocketConfig(),
  });

afterEach(() => {
  cleanup();
  useStore.setState({ wsSessions: {} });
});

describe("accessible names — v1.5.0 surfaces", () => {
  it("names every control in the WebSocket console", () => {
    const { container } = render(<WebSocketConsole request={seedWs()} />);
    expect(unnamedControls(container)).toEqual([]);
  });

  it("names every control in the WebSocket console with a saved message", () => {
    const { container } = render(
      <WebSocketConsole
        request={seedRequest({
          protocol: "websocket",
          url: "wss://echo.example.com/socket",
          websocket: {
            subprotocols: [],
            messageDrafts: [{ id: "d1", name: "Ping", contentType: "json", body: "{}" }],
          },
        })}
      />,
    );
    expect(unnamedControls(container)).toEqual([]);
  });

  it("names every control in the WebSocket message editor", () => {
    const { container } = render(
      <RequestWebSocketEditor
        request={seedRequest({
          protocol: "websocket",
          websocket: {
            subprotocols: ["graphql-ws"],
            messageDrafts: [{ id: "d1", name: "Ping", contentType: "json", body: "{}" }],
          },
        })}
      />,
    );
    expect(unnamedControls(container)).toEqual([]);
  });

  it("names every control on each HTTP request tab", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RequestBuilder
        request={seedRequest()}
        onSend={() => {}}
        onCancel={() => {}}
        sending={false}
      />,
    );

    for (const tab of screen.getAllByRole("tab")) {
      await user.click(tab);
      expect({ tab: tab.textContent, unnamed: unnamedControls(container) }).toEqual({
        tab: tab.textContent,
        unnamed: [],
      });
    }
  });

  it("names every control on each WebSocket request tab", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RequestBuilder request={seedWs()} onSend={() => {}} onCancel={() => {}} sending={false} />,
    );

    for (const tab of screen.getAllByRole("tab")) {
      await user.click(tab);
      expect({ tab: tab.textContent, unnamed: unnamedControls(container) }).toEqual({
        tab: tab.textContent,
        unnamed: [],
      });
    }
  });

  it("names every control in the collection defaults modal", async () => {
    const user = userEvent.setup();
    seedRequest();
    useStore.getState().openDefaultsEditor({ type: "collection", id: COLLECTION_ID });
    render(<CollectionSettingsModal />);

    const dialog = await screen.findByRole("dialog");
    for (const tab of within(dialog).getAllByRole("tab")) {
      await user.click(tab);
      expect({ tab: tab.textContent, unnamed: unnamedControls(dialog as HTMLElement) }).toEqual({
        tab: tab.textContent,
        unnamed: [],
      });
    }
  });

  it("names every control in the code snippet panel, collapsed and expanded", async () => {
    const user = userEvent.setup();
    const request = seedRequest();
    const { container } = render(<CodeSnippetPanel request={request} environment={null} />);
    expect(unnamedControls(container)).toEqual([]);

    // The collapsed rail is a different render path made almost entirely of
    // icon-only buttons — exactly where an unnamed control hides.
    await user.click(screen.getByRole("button", { name: /Collapse/i }));
    expect(unnamedControls(container)).toEqual([]);
  });

  it("names every control in the response viewer", () => {
    const result: ExecutionResult = {
      status: 200,
      statusText: "OK",
      durationMs: 12,
      sizeBytes: 11,
      headers: { "content-type": "application/json" },
      body: `{"ok":true}`,
      contentType: "application/json",
      ok: true,
      responseKind: "json",
      blob: null,
      fileName: null,
    };
    const { container } = render(
      <ResponseViewer result={result} loading={false} request={seedRequest()} />,
    );
    expect(unnamedControls(container)).toEqual([]);
  });

  it("names every control in the form-data body editor", () => {
    const { container } = render(
      <AdvancedBodyEditor
        request={seedRequest({
          bodyType: "form-data",
          bodyDrafts: { ...createDefaultBodyDrafts(), formData: [createEmptyFormDataRow("text")] },
        })}
      />,
    );
    expect(unnamedControls(container)).toEqual([]);
  });

  it("names every control in the sidebar", () => {
    seedRequest();
    const { container } = render(<Sidebar />);
    expect(unnamedControls(container)).toEqual([]);
  });

  it("names every control in the history drawer", () => {
    seedRequest();
    useStore.getState().openOverlay("history");
    const { container, baseElement } = render(<HistoryDrawer />);
    void container;
    expect(unnamedControls(baseElement as HTMLElement)).toEqual([]);
  });

  // The five cases below cover the overlays the original sweep never
  // rendered — only "runner" and "collection-settings" of OverlayKey's eight
  // members were exercised above. Probing these live (v1.5.1) found three
  // unnamed controls on the first pass: the palette's search box, the
  // Import cURL textarea, and the "new environment" name field — none of
  // them icon-only, all of them relying on a placeholder that disappears
  // the moment someone types.
  describe("overlays outside the original sweep", () => {
    it("names every control in the command palette", () => {
      const dispose = registerBuiltInCommands();
      seedRequest();
      useStore.getState().openOverlay("palette");
      const { baseElement } = render(<CommandPalette />);
      expect(unnamedControls(baseElement as HTMLElement)).toEqual([]);
      dispose();
    });

    it("names every control in the Import cURL modal", async () => {
      useStore.getState().openOverlay("import-curl");
      render(<ImportCurlModal />);
      const dialog = await screen.findByRole("dialog");
      expect(unnamedControls(dialog as HTMLElement)).toEqual([]);
    });

    it("names every control in Settings", async () => {
      seedRequest();
      useStore.setState({ environments: [] });
      useStore.getState().openOverlay("settings");
      render(<SettingsModal />);
      const dialog = await screen.findByRole("dialog");
      expect(unnamedControls(dialog as HTMLElement)).toEqual([]);
    });

    it("names every control in the keyboard shortcuts modal", async () => {
      const dispose = registerBuiltInCommands();
      useStore.getState().openOverlay("shortcuts");
      render(<KeyboardShortcutsModal />);
      const dialog = await screen.findByRole("dialog");
      expect(unnamedControls(dialog as HTMLElement)).toEqual([]);
      dispose();
    });

    it("names every control in Manage Environments", async () => {
      useStore.setState({
        workspace: { id: "w", name: "W", globals: [], createdAt: 0, updatedAt: 0 } as Workspace,
        requests: [],
        collections: [],
        folders: [],
        environments: [
          {
            id: "env-1",
            workspaceId: "w",
            name: "Development",
            variables: [{ id: "v1", key: "TODO_ID", value: "1", enabled: true }],
            createdAt: 0,
          },
        ],
        activeEnvId: "env-1",
      });
      useStore.getState().openOverlay("env-switcher");
      render(<EnvironmentSwitcher />);
      const dialog = await screen.findByRole("dialog", { name: "Manage Environments" });

      // Both panels the dialog can show — the selected environment and Globals —
      // since each renders a distinct set of fields.
      expect(unnamedControls(dialog as HTMLElement)).toEqual([]);
      await userEvent.setup().click(screen.getByRole("button", { name: /Globals/ }));
      expect(unnamedControls(dialog as HTMLElement)).toEqual([]);
    });
  });
});
