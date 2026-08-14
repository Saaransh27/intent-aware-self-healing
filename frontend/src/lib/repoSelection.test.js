import { beforeEach, describe, expect, it } from "vitest";
import { readStoredSelection, writeStoredSelection, reconcileSelection } from "./repoSelection";

const STORAGE_KEY = "pr-review:selected-repos";

beforeEach(() => {
  window.localStorage.clear();
});

describe("readStoredSelection", () => {
  it("reports no selection when nothing has ever been saved", () => {
    expect(readStoredSelection()).toEqual({ hasSelection: false, fullNames: [] });
  });

  it("reports a real selection has been saved, distinct from never-selected", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["octocat/hello-world"]));
    expect(readStoredSelection()).toEqual({ hasSelection: true, fullNames: ["octocat/hello-world"] });
  });

  it("reports hasSelection: true for a deliberately-saved empty selection (not the same as never-selected)", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    expect(readStoredSelection()).toEqual({ hasSelection: true, fullNames: [] });
  });

  it("falls back to no-selection for corrupt storage instead of throwing", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(readStoredSelection()).toEqual({ hasSelection: false, fullNames: [] });
  });

  it("falls back to no-selection when the stored value isn't an array", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: "an array" }));
    expect(readStoredSelection()).toEqual({ hasSelection: false, fullNames: [] });
  });
});

describe("writeStoredSelection / readStoredSelection round trip", () => {
  it("persists and restores a real selection", () => {
    writeStoredSelection(["octocat/hello-world", "octocat/other"]);
    expect(readStoredSelection()).toEqual({
      hasSelection: true,
      fullNames: ["octocat/hello-world", "octocat/other"],
    });
  });
});

describe("reconcileSelection", () => {
  it("keeps a selected repository that is still accessible", () => {
    const result = reconcileSelection(
      ["octocat/hello-world"],
      [{ full_name: "octocat/hello-world" }, { full_name: "octocat/other" }]
    );
    expect(result).toEqual(["octocat/hello-world"]);
  });

  it("removes a previously-selected repository that is no longer accessible", () => {
    const result = reconcileSelection(
      ["octocat/hello-world", "octocat/gone"],
      [{ full_name: "octocat/hello-world" }]
    );
    expect(result).toEqual(["octocat/hello-world"]);
  });

  it("never auto-selects a newly-accessible repository", () => {
    const result = reconcileSelection(
      ["octocat/hello-world"],
      [{ full_name: "octocat/hello-world" }, { full_name: "octocat/brand-new" }]
    );
    expect(result).toEqual(["octocat/hello-world"]);
    expect(result).not.toContain("octocat/brand-new");
  });
});
