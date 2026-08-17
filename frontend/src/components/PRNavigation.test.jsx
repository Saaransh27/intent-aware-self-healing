import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import PRNavigation from "./PRNavigation";

const PRS = [
  { number: 10, title: "First PR" },
  { number: 20, title: "Second PR" },
  { number: 30, title: "Third PR" },
];

function renderNav(currentNumber) {
  return render(
    <MemoryRouter>
      <PRNavigation owner="octocat" repo="hello-world" pullRequests={PRS} reviewCache={new Map()} currentNumber={currentNumber} />
    </MemoryRouter>
  );
}

describe("PRNavigation", () => {
  it("links to the correct previous and next PR in the middle of the list", () => {
    renderNav(20);

    expect(screen.getByText("Previous PR").closest("a")).toHaveAttribute("href", "/r/octocat/hello-world/pull/10");
    expect(screen.getByText("Next PR").closest("a")).toHaveAttribute("href", "/r/octocat/hello-world/pull/30");
  });

  it("disables Previous PR on the first PR in the list", () => {
    renderNav(10);

    expect(screen.getByText("Previous PR").closest("a, span").tagName).toBe("SPAN");
    expect(screen.getByText("Next PR").closest("a")).toHaveAttribute("href", "/r/octocat/hello-world/pull/20");
  });

  it("disables Next PR on the last PR in the list", () => {
    renderNav(30);

    expect(screen.getByText("Next PR").closest("a, span").tagName).toBe("SPAN");
    expect(screen.getByText("Previous PR").closest("a")).toHaveAttribute("href", "/r/octocat/hello-world/pull/20");
  });

  it("disables both controls when the current PR isn't in the list at all", () => {
    renderNav(999);

    expect(screen.getByText("Previous PR").closest("a, span").tagName).toBe("SPAN");
    expect(screen.getByText("Next PR").closest("a, span").tagName).toBe("SPAN");
  });

  // Milestone 9 (UI refinement): "All PRs" no longer navigates away from
  // the PR being reviewed -- it opens a translucent overlay on top of the
  // current page, so switching PRs never means losing your place.
  it("opens an overlay listing every PR, rather than navigating away, when All PRs is clicked", async () => {
    renderNav(20);

    expect(screen.queryByRole("dialog", { name: "All pull requests" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("All PRs"));

    const dialog = screen.getByRole("dialog", { name: "All pull requests" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("First PR")).toBeInTheDocument();
    expect(screen.getByText("Second PR")).toBeInTheDocument();
    expect(screen.getByText("Third PR")).toBeInTheDocument();
  });

  it("closes the All PRs overlay when its close button is clicked", async () => {
    renderNav(20);

    await userEvent.click(screen.getByText("All PRs"));
    expect(screen.getByRole("dialog", { name: "All pull requests" })).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByRole("dialog", { name: "All pull requests" })).not.toBeInTheDocument();
  });
});
