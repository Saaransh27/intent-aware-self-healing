import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import RepositoryList from "./RepositoryList";

const REPOS = [
  { full_name: "octocat/hello-world", name: "hello-world", owner: "octocat", private: false, default_branch: "main", html_url: "https://github.com/octocat/hello-world", updated_at: "2026-01-01T00:00:00Z" },
  { full_name: "octocat/secret-project", name: "secret-project", owner: "octocat", private: true, default_branch: "main", html_url: "https://github.com/octocat/secret-project", updated_at: "2026-01-02T00:00:00Z" },
];

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("RepositoryList", () => {
  it("shows a loading state", () => {
    renderWithRouter(<RepositoryList status="loading" repositories={[]} />);
    expect(screen.getByText("Loading repositories…")).toBeInTheDocument();
  });

  it("shows a real error message", () => {
    renderWithRouter(<RepositoryList status="error" repositories={[]} errorMessage="Your session has expired." />);
    expect(screen.getByText("Your session has expired.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no accessible repositories", () => {
    renderWithRouter(<RepositoryList status="success" repositories={[]} />);
    expect(screen.getByText("No accessible repositories")).toBeInTheDocument();
  });

  it("lists every real repository by full_name", () => {
    renderWithRouter(<RepositoryList status="success" repositories={REPOS} />);
    expect(screen.getByText("octocat/hello-world")).toBeInTheDocument();
    expect(screen.getByText("octocat/secret-project")).toBeInTheDocument();
  });

  it("links each repository to its own /r/:owner/:repo route", () => {
    renderWithRouter(<RepositoryList status="success" repositories={REPOS} />);
    expect(screen.getByText("octocat/hello-world").closest("a")).toHaveAttribute("href", "/r/octocat/hello-world");
  });
});
