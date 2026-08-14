import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PRHeader from "./PRHeader";

const PR = {
  number: 42,
  title: "Fix the thing",
  author_login: "octocat",
  html_url: "https://github.com/octocat/hello-world/pull/42",
  state: "open",
  draft: false,
  additions: 120,
  deletions: 45,
  changed_files: 7,
};

describe("PRHeader", () => {
  it("renders nothing while the PR hasn't loaded yet", () => {
    const { container } = render(<PRHeader owner="octocat" repo="hello-world" pr={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the repo, PR number, title, and author — each exactly once", () => {
    render(<PRHeader owner="octocat" repo="hello-world" pr={PR} />);

    expect(screen.getByText("octocat/hello-world")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("Fix the thing")).toBeInTheDocument();
    expect(screen.getByText("by octocat")).toBeInTheDocument();
  });

  it("shows real additions/deletions/changed-files stats when present", () => {
    render(<PRHeader owner="octocat" repo="hello-world" pr={PR} />);

    expect(screen.getByText("7 files changed")).toBeInTheDocument();
    expect(screen.getByText("+120")).toBeInTheDocument();
    expect(screen.getByText("-45")).toBeInTheDocument();
  });

  it("omits stats entirely (never a fabricated 0) when the backend hasn't provided them", () => {
    render(<PRHeader owner="octocat" repo="hello-world" pr={{ ...PR, additions: null, deletions: null, changed_files: null }} />);

    expect(screen.queryByText(/files changed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("shows a Draft badge for a draft PR and Open otherwise", () => {
    const { rerender } = render(<PRHeader owner="octocat" repo="hello-world" pr={PR} />);
    expect(screen.getByText("Open")).toBeInTheDocument();

    rerender(<PRHeader owner="octocat" repo="hello-world" pr={{ ...PR, draft: true }} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("shows Closed for a real closed/merged PR, never a stale Open/Draft default", () => {
    // Real bug fixed in Milestone 5: reachable via prev/next navigation
    // into a PR that gets merged mid-session, or a stale bookmark.
    render(<PRHeader owner="octocat" repo="hello-world" pr={{ ...PR, state: "closed", draft: false }} />);

    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.queryByText("Open")).not.toBeInTheDocument();
  });

  it("a closed PR never shows Draft even if the draft flag is stale/true", () => {
    render(<PRHeader owner="octocat" repo="hello-world" pr={{ ...PR, state: "closed", draft: true }} />);

    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
  });

  it("links to the real GitHub PR URL", () => {
    render(<PRHeader owner="octocat" repo="hello-world" pr={PR} />);

    expect(screen.getByText("View on GitHub").closest("a")).toHaveAttribute("href", PR.html_url);
  });
});
