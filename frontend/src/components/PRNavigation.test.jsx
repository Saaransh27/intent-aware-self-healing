import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import PRNavigation from "./PRNavigation";

const PRS = [{ number: 10 }, { number: 20 }, { number: 30 }];

function renderNav(currentNumber) {
  return render(
    <MemoryRouter>
      <PRNavigation owner="octocat" repo="hello-world" pullRequests={PRS} currentNumber={currentNumber} />
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

  it("always links back to the PR list for the same repository", () => {
    renderNav(20);

    expect(screen.getByText("All PRs").closest("a")).toHaveAttribute("href", "/r/octocat/hello-world");
  });
});
