// @vitest-environment jsdom
import "@/test/setup-dom";
import { useState } from "react";
import { describe, expect, it, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Overlay } from "@/components/Overlay";

/** Mirrors how every real consumer mounts it: a trigger in the page behind,
 * plus a background field that focus must never reach while the dialog is up. */
function Harness({ withInput = false }: { withInput?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <input aria-label="background field" />
      <button onClick={() => setOpen(true)}>Open</button>
      <Overlay open={open} onClose={() => setOpen(false)} title="Settings">
        {/* autoFocus mirrors ImportCurlModal/PromptDialog/the history search,
            which focus their own field on mount. */}
        {withInput ? <input autoFocus aria-label="dialog field" /> : null}
        <button>First</button>
        <button>Last</button>
      </Overlay>
    </div>
  );
}

// `role="dialog" aria-modal="true"` is advisory: on its own it doesn't stop Tab
// walking out of the panel into the sidebar behind the backdrop, where a
// keyboard user can type into a field they can't see. Radix gives
// ConfirmDeleteDialog this for free; Overlay backs the other seven modals
// (Settings, Shortcuts, Runner, Environments, Prompt, Import cURL, History).
describe("Overlay — focus management", () => {
  afterEach(cleanup);

  it("moves focus into the dialog when it opens", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open" }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it("leaves an autofocused field inside the dialog focused rather than stealing it", async () => {
    const user = userEvent.setup();
    render(<Harness withInput />);

    await user.click(screen.getByRole("button", { name: "Open" }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    // Overlay only moves focus when the panel doesn't already own it, so a
    // panel that autofocuses its own field keeps it — rather than being
    // yanked to the Close button, which is the first focusable in DOM order.
    expect(document.activeElement).toBe(screen.getByLabelText("dialog field"));
  });

  it("keeps Tab inside the dialog instead of reaching the background field", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    // Well past the number of focusable controls in the panel — without a trap
    // this walks out into the page behind the backdrop.
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    expect(document.activeElement).not.toBe(screen.getByLabelText("background field"));
  });

  it("wraps backwards from the first focusable to the last", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("restores focus to the trigger when it closes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });

    await user.click(trigger);
    await screen.findByRole("dialog");

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Close" }));
    });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
