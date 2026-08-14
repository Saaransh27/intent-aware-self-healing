import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import PRList from "./PRList";

const PRS = [
  {
    number: 42, title: "Fix the thing", author_login: "octocat",
    created_at: "2026-01-15T10:30:00Z", updated_at: "2026-01-15T10:30:00Z",
    head_ref: "feature", base_ref: "main", html_url: "https://github.com/octocat/hello-world/pull/42",
    state: "open", draft: false, additions: null, deletions: null, changed_files: null,
  },
  {
    number: 43, title: "WIP: another thing", author_login: "hubot",
    created_at: "2026-01-16T10:30:00Z", updated_at: "2026-01-16T10:30:00Z",
    head_ref: "wip", base_ref: "main", html_url: "https://github.com/octocat/hello-world/pull/43",
    state: "open", draft: true, additions: null, deletions: null, changed_files: null,
  },
];

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("PRList", () => {
  it("shows a loading state", () => {
    renderWithRouter(<PRList owner="octocat" repo="hello-world" status="loading" pullRequests={[]} />);
    expect(screen.getByText(/Loading pull requests/)).toBeInTheDocument();
  });

  it("shows a real error message", () => {
    renderWithRouter(
      <PRList owner="octocat" repo="hello-world" status="error" pullRequests={[]} errorMessage="Couldn't reach GitHub." />
    );
    expect(screen.getByText("Couldn't reach GitHub.")).toBeInTheDocument();
  });

  it("shows a real sign-in-again action on a 401, not just a stuck error", () => {
    renderWithRouter(
      <PRList
        owner="octocat" repo="hello-world" status="error" pullRequests={[]}
        errorMessage="Your session has expired." errorStatus={401}
      />
    );
    expect(screen.getByText("Sign in again")).toBeInTheDocument();
  });

  it("shows no sign-in action for a non-401 error", () => {
    renderWithRouter(
      <PRList
        owner="octocat" repo="hello-world" status="error" pullRequests={[]}
        errorMessage="Couldn't reach GitHub." errorStatus={502}
      />
    );
    expect(screen.queryByText("Sign in again")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no open PRs", () => {
    renderWithRouter(<PRList owner="octocat" repo="hello-world" status="success" pullRequests={[]} />);
    expect(screen.getByText("No open pull requests")).toBeInTheDocument();
  });

  it("lists every open PR with its real number, title, and author", () => {
    renderWithRouter(<PRList owner="octocat" repo="hello-world" status="success" pullRequests={PRS} />);

    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("Fix the thing")).toBeInTheDocument();
    expect(screen.getByText(/by octocat/)).toBeInTheDocument();
    expect(screen.getByText("#43")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("never shows fabricated additions/deletions/changed-files in the list", () => {
    renderWithRouter(<PRList owner="octocat" repo="hello-world" status="success" pullRequests={PRS} />);

    expect(screen.queryByText(/files changed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it("links each row to its own PR review route", () => {
    renderWithRouter(<PRList owner="octocat" repo="hello-world" status="success" pullRequests={PRS} />);

    expect(screen.getByText("Fix the thing").closest("a")).toHaveAttribute("href", "/r/octocat/hello-world/pull/42");
  });
});
