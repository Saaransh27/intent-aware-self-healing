import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RepositorySelector from "./RepositorySelector";

const REPOS = [
  { full_name: "octocat/hello-world", name: "hello-world", owner: "octocat", private: false },
  { full_name: "octocat/secret-project", name: "secret-project", owner: "octocat", private: true },
  { full_name: "acme/widgets", name: "widgets", owner: "acme", private: false },
];

describe("RepositorySelector", () => {
  it("starts with the currently-selected repositories checked", () => {
    render(
      <RepositorySelector
        repositories={REPOS}
        initialSelected={["octocat/hello-world"]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("checkbox", { name: "octocat/hello-world" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "octocat/secret-project" })).not.toBeChecked();
  });

  it("lets a repository be selected and reports it on save", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <RepositorySelector repositories={REPOS} initialSelected={[]} onConfirm={onConfirm} onClose={vi.fn()} />
    );

    await user.click(screen.getByRole("checkbox", { name: "acme/widgets" }));
    await user.click(screen.getByRole("button", { name: "Save selection" }));

    expect(onConfirm).toHaveBeenCalledWith(["acme/widgets"]);
  });

  it("lets a repository be deselected and reports it on save", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <RepositorySelector
        repositories={REPOS}
        initialSelected={["octocat/hello-world", "acme/widgets"]}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "octocat/hello-world" }));
    await user.click(screen.getByRole("button", { name: "Save selection" }));

    expect(onConfirm).toHaveBeenCalledWith(["acme/widgets"]);
  });

  it("selects all currently-visible (filtered) repositories, not hidden ones", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <RepositorySelector repositories={REPOS} initialSelected={[]} onConfirm={onConfirm} onClose={vi.fn()} />
    );

    await user.type(screen.getByLabelText("Search repositories"), "octocat");
    await user.click(screen.getByRole("button", { name: "Select all visible" }));
    await user.click(screen.getByRole("button", { name: "Save selection" }));

    const [saved] = onConfirm.mock.calls[0];
    expect(saved.sort()).toEqual(["octocat/hello-world", "octocat/secret-project"]);
  });

  it("clears every selection, not just the visible ones", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <RepositorySelector
        repositories={REPOS}
        initialSelected={["octocat/hello-world", "acme/widgets"]}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    await user.click(screen.getByRole("button", { name: "Save selection" }));

    expect(onConfirm).toHaveBeenCalledWith([]);
  });

  it("filters the list by search text", async () => {
    const user = userEvent.setup();

    render(
      <RepositorySelector repositories={REPOS} initialSelected={[]} onConfirm={vi.fn()} onClose={vi.fn()} />
    );

    await user.type(screen.getByLabelText("Search repositories"), "acme");

    expect(screen.getByText("acme/widgets")).toBeInTheDocument();
    expect(screen.queryByText("octocat/hello-world")).not.toBeInTheDocument();
  });

  it("does not save anything when cancelled", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <RepositorySelector repositories={REPOS} initialSelected={[]} onConfirm={onConfirm} onClose={onClose} />
    );

    await user.click(screen.getByRole("checkbox", { name: "acme/widgets" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
