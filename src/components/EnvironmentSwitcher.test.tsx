// @vitest-environment jsdom
import "@/test/setup-dom";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { EnvironmentSwitcher } from "@/components/EnvironmentSwitcher";
import { registerBuiltInCommands } from "@/core/commands/handlers";
import { commandRegistry } from "@/core/commands/registry";
import { useStore } from "@/stores/useStore";
import type { Environment, Workspace } from "@/services/db";

function makeEnvironment(id: string, name: string, variables: Environment["variables"]) {
  return { id, workspaceId: "w", name, variables, createdAt: 0 } satisfies Environment;
}

function seed(environments: Environment[], activeEnvId: string | null) {
  useStore.setState({
    workspace: { id: "w", name: "W", globals: [], createdAt: 0, updatedAt: 0 } as Workspace,
    requests: [],
    collections: [],
    folders: [],
    environments,
    activeEnvId,
    overlays: { ...useStore.getState().overlays, "env-switcher": false },
  });
}

/** Runs the real "Create Environment" command, which is the flow that broke:
 * it creates an environment, makes it active, and opens this panel in one
 * step. Going through the registry rather than re-implementing those three
 * store calls means the test still describes the user's action if the
 * handler changes. */
async function runCreateEnvironmentCommand() {
  const dispose = registerBuiltInCommands();
  const command = commandRegistry.get("env.create");
  expect(command, "the env.create command should be registered").toBeTruthy();
  await act(async () => {
    await command!.run();
  });
  dispose();
}

afterEach(() => {
  cleanup();
  useStore.setState({ environments: [], activeEnvId: null });
});

describe("Manage Environments panel", () => {
  // The panel deliberately remembers which environment you were last looking
  // at, but that memory outlived a change made from outside it: "Create
  // Environment" made a new environment active and reopened the panel still
  // showing the *old* one. Variables typed in then landed on the wrong
  // environment, and the next send resolved {{VAR}} to nothing — with the
  // panel showing an environment that wasn't the one in effect and no hint
  // that anything was off.
  it("shows the newly created environment, not the one selected before", async () => {
    seed([makeEnvironment("env-1", "Development", [])], "env-1");
    render(<EnvironmentSwitcher />);

    // Open once on the pre-existing environment, then close — this is what
    // seeds the stale selection.
    act(() => useStore.getState().openOverlay("env-switcher"));
    expect(screen.getByLabelText("Environment name")).toHaveValue("Development");
    act(() => useStore.getState().closeOverlay("env-switcher"));

    await runCreateEnvironmentCommand();

    const created = useStore.getState().environments.at(-1)!;
    expect(useStore.getState().activeEnvId).toBe(created.id);
    expect(screen.getByLabelText("Environment name")).toHaveValue(created.name);
  });

  // The variables grid is the part that actually caused damage: it edits
  // whichever environment is selected, so a stale selection silently wrote
  // one environment's variables into another. Asserted through the store
  // rather than the rendered rows — the outgoing environment's row is still
  // in the DOM for the length of its exit animation, which says nothing
  // about which environment an edit is bound to.
  it("writes a new variable to the new environment, not the previous one", async () => {
    seed(
      [
        makeEnvironment("env-1", "Development", [
          { id: "v1", key: "TODO_ID", value: "1", enabled: true },
        ]),
      ],
      "env-1",
    );
    render(<EnvironmentSwitcher />);

    act(() => useStore.getState().openOverlay("env-switcher"));
    act(() => useStore.getState().closeOverlay("env-switcher"));

    await runCreateEnvironmentCommand();
    const created = useStore.getState().environments.at(-1)!;

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add row" }));
    await user.type(screen.getByPlaceholderText("Variable"), "TODO_ID");
    await user.type(screen.getByPlaceholderText("Value"), "2");

    const byId = (id: string) => useStore.getState().environments.find((env) => env.id === id)!;
    expect(byId(created.id).variables.map((v) => [v.key, v.value])).toEqual([["TODO_ID", "2"]]);
    // The environment that was merely *selected* a moment ago must be untouched.
    expect(byId("env-1").variables.map((v) => [v.key, v.value])).toEqual([["TODO_ID", "1"]]);
  });

  // The remembered selection is still worth having: picking a non-active
  // environment to edit and coming back to it is a normal thing to do, and
  // reopening must not throw that away.
  it("still reopens on the environment you last selected when nothing changed", async () => {
    seed(
      [makeEnvironment("env-1", "Development", []), makeEnvironment("env-2", "Staging", [])],
      "env-1",
    );
    render(<EnvironmentSwitcher />);

    act(() => useStore.getState().openOverlay("env-switcher"));
    await act(async () => {
      screen.getByRole("button", { name: /Staging/ }).click();
    });
    expect(screen.getByLabelText("Environment name")).toHaveValue("Staging");

    act(() => useStore.getState().closeOverlay("env-switcher"));
    act(() => useStore.getState().openOverlay("env-switcher"));

    expect(screen.getByLabelText("Environment name")).toHaveValue("Staging");
  });
});
