// @vitest-environment jsdom
import "@/test/setup-dom";
import { useState } from "react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplateInput } from "@/components/TemplateInput";
import { useStore } from "@/stores/useStore";
import { uid, type Environment, type Workspace } from "@/services/db";

function Wrapper({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <TemplateInput value={value} onChange={setValue} placeholder="url" />;
}

function seedVariables() {
  const environment: Environment = {
    id: "env-1",
    workspaceId: "ws-1",
    name: "Test env",
    variables: [
      { id: uid(), key: "API_KEY", value: "abc", enabled: true },
      { id: uid(), key: "API_TOKEN", value: "def", enabled: true },
      { id: uid(), key: "DISABLED_VAR", value: "x", enabled: false },
    ],
    createdAt: Date.now(),
  };
  const workspace: Workspace = {
    id: "ws-1",
    name: "Test workspace",
    globals: [{ id: uid(), key: "BASE_URL", value: "https://api.example.com", enabled: true }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  useStore.setState({ environments: [environment], activeEnvId: environment.id, workspace });
}

describe("TemplateInput", () => {
  beforeEach(() => {
    seedVariables();
  });

  afterEach(() => {
    cleanup();
  });

  it("has no combobox popover semantics until the caret is inside a '{{' token", () => {
    render(<Wrapper />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens the listbox with every enabled variable (env + globals) when typing '{{'", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const input = screen.getByRole("combobox");
    await user.type(input, "{{{{");

    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["BASE_URL", "API_KEY", "API_TOKEN"]);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
  });

  it("filters suggestions case-insensitively as the token is typed", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const input = screen.getByRole("combobox");
    await user.type(input, "{{{{tok");

    const listbox = await screen.findByRole("listbox");
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["API_TOKEN"]);
  });

  it("closes the popover once the caret leaves the token (a space breaks it)", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const input = screen.getByRole("combobox");
    await user.type(input, "{{{{API_KEY ");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("moves aria-activedescendant with ArrowDown/ArrowUp and wraps around", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const input = screen.getByRole("combobox");
    await user.type(input, "{{{{");
    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");

    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", options[options.length - 1].id);
  });

  it("applies the active suggestion on Enter, closing the popover and inserting '}}'", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "{{{{API_KEY");
    await user.keyboard("{Enter}");

    expect(input.value).toBe("{{API_KEY}}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes without changing the value on Escape", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "{{{{API");
    await user.keyboard("{Escape}");

    expect(input.value).toBe("{{API");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clicking a suggestion applies it, same as Enter", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    await user.type(input, "{{{{BASE");
    const option = await screen.findByRole("option", { name: "BASE_URL" });
    await user.click(option);

    expect(input.value).toBe("{{BASE_URL}}");
  });
});
