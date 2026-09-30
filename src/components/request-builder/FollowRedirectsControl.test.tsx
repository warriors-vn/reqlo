// @vitest-environment jsdom
import "@/test/setup-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FollowRedirectsControl } from "@/components/request-builder/FollowRedirectsControl";

afterEach(cleanup);

describe("FollowRedirectsControl", () => {
  it("shows nothing unusual while redirects are followed, and turns them off on click", async () => {
    const onChange = vi.fn();
    render(<FollowRedirectsControl follow onChange={onChange} />);
    const button = screen.getByRole("button", { name: "Don't follow redirects" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("No redirects")).toBeNull();

    await userEvent.click(button);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("badges the request when it stops at redirects, and turns following back on", async () => {
    const onChange = vi.fn();
    render(<FollowRedirectsControl follow={false} onChange={onChange} />);
    expect(screen.getByText("No redirects")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
