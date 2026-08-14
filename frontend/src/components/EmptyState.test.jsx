import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EmptyState from "./EmptyState";

describe("EmptyState", () => {
  it("renders the title and body", () => {
    render(<EmptyState tone="empty" title="No open pull requests" body="octocat/hello-world has none right now." />);

    expect(screen.getByText("No open pull requests")).toBeInTheDocument();
    expect(screen.getByText("octocat/hello-world has none right now.")).toBeInTheDocument();
  });

  it("renders without a body when none is given", () => {
    render(<EmptyState tone="loading" title="Loading…" />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("uses role=alert only for the error tone", () => {
    const { rerender } = render(<EmptyState tone="error" title="Couldn't load" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<EmptyState tone="empty" title="Nothing here" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a real action link when given one", () => {
    render(<EmptyState tone="error" title="Your session has expired." action={{ label: "Sign in again", href: "https://api.example.com/github/login" }} />);

    const link = screen.getByText("Sign in again");
    expect(link.closest("a")).toHaveAttribute("href", "https://api.example.com/github/login");
  });

  it("renders no action link when none is given", () => {
    render(<EmptyState tone="error" title="Couldn't load" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
