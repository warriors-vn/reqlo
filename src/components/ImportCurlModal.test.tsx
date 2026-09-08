// @vitest-environment jsdom
import "@/test/setup-dom";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ImportCurlModal } from "@/components/ImportCurlModal";
import { useStore } from "@/stores/useStore";
import type { Workspace } from "@/services/db";

function open() {
  useStore.setState({
    workspace: { id: "w", name: "W", globals: [], createdAt: 0, updatedAt: 0 } as Workspace,
    overlays: { ...useStore.getState().overlays, "import-curl": true },
  });
}

afterEach(() => {
  cleanup();
  useStore.setState({ overlays: { ...useStore.getState().overlays, "import-curl": false } });
});

describe("ImportCurlModal", () => {
  // The Import button silently disables itself when nothing parses to a URL
  // — pasting anything that doesn't start with "curl", or a well-formed curl
  // command missing a URL, used to leave the button greyed out with zero
  // explanation, indistinguishable from the feature being broken.
  it("explains why Import is disabled when the text isn't a cURL command", async () => {
    open();
    render(<ImportCurlModal />);

    await act(async () => {
      await userEvent.type(screen.getByLabelText("cURL command"), "GET https://api.example.com");
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/doesn't look like a curl command/i);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("explains why Import is disabled when a curl command has no URL", async () => {
    open();
    render(<ImportCurlModal />);

    await act(async () => {
      await userEvent.type(
        screen.getByLabelText("cURL command"),
        "curl -H 'Content-Type: application/json'",
      );
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't find a url/i);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("shows no message before anything is typed", () => {
    open();
    render(<ImportCurlModal />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows no message once the command parses to a URL", async () => {
    open();
    render(<ImportCurlModal />);

    await act(async () => {
      await userEvent.type(
        screen.getByLabelText("cURL command"),
        "curl https://api.example.com/items",
      );
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
  });
});
