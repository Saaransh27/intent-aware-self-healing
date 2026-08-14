import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import * as authApi from "./lib/authApi";

vi.mock("./lib/authApi");

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("App — authentication gate", () => {
  it("shows a checking-session state before the auth check resolves", () => {
    authApi.fetchCurrentUser.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(screen.getByText("Checking your session…")).toBeInTheDocument();
  });

  it("shows the login gate when there is no valid session", async () => {
    authApi.fetchCurrentUser.mockRejectedValue(Object.assign(new Error("not authenticated"), { status: 401 }));

    render(<App />);

    await waitFor(() => expect(screen.getByText("Sign in with GitHub")).toBeInTheDocument());
  });

  it("shows the authenticated shell with a repository-selection prompt on first use (Milestone 7A)", async () => {
    authApi.fetchCurrentUser.mockResolvedValue({ login: "octocat", name: "The Octocat", avatar_url: "https://example.com/a.png" });
    authApi.fetchRepositories.mockResolvedValue([
      { full_name: "octocat/hello-world", name: "hello-world", owner: "octocat", private: false, default_branch: "main", html_url: "https://github.com/octocat/hello-world", updated_at: "2026-01-01T00:00:00Z" },
    ]);

    render(<App />);

    await waitFor(() => expect(screen.getByText("The Octocat")).toBeInTheDocument());
    // Milestone 7A: with no saved selection yet, accessible repositories
    // are never dumped straight into the sidebar — an onboarding prompt
    // is shown instead.
    await waitFor(() => expect(screen.getByRole("button", { name: "Select repositories" })).toBeInTheDocument());
    expect(screen.queryByText("octocat/hello-world")).not.toBeInTheDocument();
    expect(screen.getByText("Select a repository")).toBeInTheDocument();
  });

  it("shows only previously-selected repositories in the sidebar once a selection exists (Milestone 7A)", async () => {
    window.localStorage.setItem("pr-review:selected-repos", JSON.stringify(["octocat/hello-world"]));
    authApi.fetchCurrentUser.mockResolvedValue({ login: "octocat", name: "The Octocat", avatar_url: "https://example.com/a.png" });
    authApi.fetchRepositories.mockResolvedValue([
      { full_name: "octocat/hello-world", name: "hello-world", owner: "octocat", private: false, default_branch: "main", html_url: "https://github.com/octocat/hello-world", updated_at: "2026-01-01T00:00:00Z" },
      { full_name: "octocat/other-repo", name: "other-repo", owner: "octocat", private: false, default_branch: "main", html_url: "https://github.com/octocat/other-repo", updated_at: "2026-01-01T00:00:00Z" },
    ]);

    render(<App />);

    await waitFor(() => expect(screen.getByText("octocat/hello-world")).toBeInTheDocument());
    expect(screen.queryByText("octocat/other-repo")).not.toBeInTheDocument();
  });

  it("removes a previously-selected repository from the saved selection once it's no longer accessible (Milestone 7A)", async () => {
    window.localStorage.setItem("pr-review:selected-repos", JSON.stringify(["octocat/hello-world", "octocat/gone-repo"]));
    authApi.fetchCurrentUser.mockResolvedValue({ login: "octocat", name: "The Octocat", avatar_url: "https://example.com/a.png" });
    authApi.fetchRepositories.mockResolvedValue([
      { full_name: "octocat/hello-world", name: "hello-world", owner: "octocat", private: false, default_branch: "main", html_url: "https://github.com/octocat/hello-world", updated_at: "2026-01-01T00:00:00Z" },
    ]);

    render(<App />);

    await waitFor(() => expect(screen.getByText("octocat/hello-world")).toBeInTheDocument());
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem("pr-review:selected-repos"))).toEqual(["octocat/hello-world"])
    );
  });

  it("returns to the login gate when the session expires mid-browsing, not a stuck sidebar error", async () => {
    // Milestone 5: real gap fixed here — a 401 from the repos fetch used
    // to leave the sidebar showing a text error forever, with no way
    // back to LoginGate short of a full page reload.
    authApi.fetchCurrentUser.mockResolvedValue({ login: "octocat", name: null, avatar_url: "https://example.com/a.png" });
    authApi.fetchRepositories.mockRejectedValue(
      Object.assign(new Error("Your session has expired. Please sign in again."), { status: 401 })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("Sign in with GitHub")).toBeInTheDocument());
  });

  it("returns to the login gate after logging out", async () => {
    authApi.fetchCurrentUser.mockResolvedValue({ login: "octocat", name: null, avatar_url: "https://example.com/a.png" });
    authApi.fetchRepositories.mockResolvedValue([]);
    authApi.logout.mockResolvedValue({ status: "logged_out" });

    render(<App />);
    await waitFor(() => expect(screen.getByText("octocat")).toBeInTheDocument());

    screen.getByRole("button", { name: "Sign out" }).click();

    await waitFor(() => expect(screen.getByText("Sign in with GitHub")).toBeInTheDocument());
    expect(authApi.logout).toHaveBeenCalledTimes(1);
  });
});

describe("App — repository selection (Milestone 7A)", () => {
  it("lets the user open the manage-repositories selector, select a repository, and see the sidebar update", async () => {
    const user = userEvent.setup();
    authApi.fetchCurrentUser.mockResolvedValue({ login: "octocat", name: "The Octocat", avatar_url: "https://example.com/a.png" });
    authApi.fetchRepositories.mockResolvedValue([
      { full_name: "octocat/hello-world", name: "hello-world", owner: "octocat", private: false, default_branch: "main", html_url: "https://github.com/octocat/hello-world", updated_at: "2026-01-01T00:00:00Z" },
    ]);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Select repositories" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Select repositories" }));

    expect(screen.getByRole("dialog", { name: "Manage repositories" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "octocat/hello-world" }));
    await user.click(screen.getByRole("button", { name: "Save selection" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("octocat/hello-world").length).toBeGreaterThan(0));
    expect(JSON.parse(window.localStorage.getItem("pr-review:selected-repos"))).toEqual(["octocat/hello-world"]);
  });

  it("reopens the selector via 'Manage repositories' once a selection already exists", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("pr-review:selected-repos", JSON.stringify(["octocat/hello-world"]));
    authApi.fetchCurrentUser.mockResolvedValue({ login: "octocat", name: "The Octocat", avatar_url: "https://example.com/a.png" });
    authApi.fetchRepositories.mockResolvedValue([
      { full_name: "octocat/hello-world", name: "hello-world", owner: "octocat", private: false, default_branch: "main", html_url: "https://github.com/octocat/hello-world", updated_at: "2026-01-01T00:00:00Z" },
    ]);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Manage repositories" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Manage repositories" }));

    expect(screen.getByRole("dialog", { name: "Manage repositories" })).toBeInTheDocument();
  });

  it("navigates a selected repository to its own PR list", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("pr-review:selected-repos", JSON.stringify(["octocat/hello-world"]));
    authApi.fetchCurrentUser.mockResolvedValue({ login: "octocat", name: "The Octocat", avatar_url: "https://example.com/a.png" });
    authApi.fetchRepositories.mockResolvedValue([
      { full_name: "octocat/hello-world", name: "hello-world", owner: "octocat", private: false, default_branch: "main", html_url: "https://github.com/octocat/hello-world", updated_at: "2026-01-01T00:00:00Z" },
    ]);
    authApi.fetchOpenPullRequests.mockResolvedValue([]);

    render(<App />);

    await waitFor(() => expect(screen.getByText("octocat/hello-world")).toBeInTheDocument());
    await user.click(screen.getByText("octocat/hello-world"));

    await waitFor(() => expect(authApi.fetchOpenPullRequests).toHaveBeenCalledWith("octocat", "hello-world"));
  });
});
