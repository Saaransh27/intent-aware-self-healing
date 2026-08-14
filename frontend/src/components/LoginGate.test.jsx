import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LoginGate from "./LoginGate";
import { API_BASE_URL } from "../lib/api";

describe("LoginGate", () => {
  it("links sign-in to the real backend OAuth login route, not a fetch call", () => {
    render(<LoginGate />);

    const link = screen.getByText("Sign in with GitHub").closest("a");
    expect(link).toHaveAttribute("href", `${API_BASE_URL}/github/login`);
  });
});
