// @vitest-environment jsdom
import "@/test/setup-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { OnboardingChecklist } from "@/components/sidebar/OnboardingChecklist";
import { useStore } from "@/stores/useStore";

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args) },
}));

// ensureSeed() always creates exactly 3 sample requests (see OnboardingChecklist.tsx).
const SEEDED_REQUEST_COUNT = 3;

function resetPersistedState() {
  localStorage.removeItem("reqlo:onboarding-dismissed");
  localStorage.removeItem("reqlo:theme");
  document.documentElement.classList.remove("dark");
  useStore.setState({ overlays: { ...useStore.getState().overlays, palette: false } });
}

describe("OnboardingChecklist", () => {
  beforeEach(() => {
    resetPersistedState();
    toastSuccess.mockClear();
  });

  afterEach(() => {
    cleanup();
    resetPersistedState();
  });

  it("shows all four items as not done, and the progress count, on a fresh workspace", () => {
    render(<OnboardingChecklist requestCount={SEEDED_REQUEST_COUNT} historyCount={0} />);
    expect(screen.getByText("0/4")).toBeInTheDocument();
    expect(screen.getByText("Send a request")).toBeInTheDocument();
    expect(screen.getByText("Create a request of your own")).toBeInTheDocument();
  });

  it("clicking 'Open the command palette' opens the palette overlay", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<OnboardingChecklist requestCount={SEEDED_REQUEST_COUNT} historyCount={0} />);

    await user.click(screen.getByRole("button", { name: /Open the command palette/ }));

    expect(useStore.getState().overlays.palette).toBe(true);
  });

  it("clicking 'Try dark mode' toggles the theme class and checks the item off", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<OnboardingChecklist requestCount={SEEDED_REQUEST_COUNT} historyCount={0} />);

    await user.click(screen.getByRole("button", { name: /Try dark mode/ }));

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("dismisses on close and stays dismissed across a re-render", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    const { rerender } = render(
      <OnboardingChecklist requestCount={SEEDED_REQUEST_COUNT} historyCount={0} />,
    );

    await user.click(screen.getByLabelText("Dismiss getting-started checklist"));
    expect(screen.queryByText("Getting started")).not.toBeInTheDocument();

    rerender(<OnboardingChecklist requestCount={SEEDED_REQUEST_COUNT} historyCount={0} />);
    expect(screen.queryByText("Getting started")).not.toBeInTheDocument();
  });

  it("toasts once when the last item completes, but not on an already-complete mount", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    // Two of four already satisfied via props; palette and theme are still open.
    render(<OnboardingChecklist requestCount={SEEDED_REQUEST_COUNT + 1} historyCount={1} />);
    expect(toastSuccess).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Open the command palette/ }));
    await user.click(screen.getByRole("button", { name: /Try dark mode/ }));

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledTimes(1);
    });

    cleanup();
    toastSuccess.mockClear();

    // A fresh mount that is already complete (e.g. a returning user) must not
    // re-fire the celebration toast.
    render(<OnboardingChecklist requestCount={SEEDED_REQUEST_COUNT + 1} historyCount={1} />);
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
