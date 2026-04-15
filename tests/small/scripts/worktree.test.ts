import { describe, expect, it } from "vitest";
import { buildWorktreePath, slugifyBranch } from "../../../scripts/worktree";

describe("slugifyBranch", () => {
  it("strips type prefix and leading issue number", () => {
    expect(slugifyBranch("feat/265-worktree-scripts")).toBe("worktree-scripts");
  });

  it("handles fix prefix", () => {
    expect(slugifyBranch("fix/53-stats-timezone")).toBe("stats-timezone");
  });

  it("keeps branch name when there is no type prefix", () => {
    expect(slugifyBranch("hotfix-42")).toBe("hotfix-42");
  });

  it("throws when branch is empty", () => {
    expect(() => slugifyBranch("")).toThrow(/branch/i);
  });
});

describe("buildWorktreePath", () => {
  it("returns sibling directory with issue and slug", () => {
    expect(buildWorktreePath(265, "feat/265-worktree-scripts")).toBe(
      "../kairous-265-worktree-scripts",
    );
  });

  it("rejects non-positive issue numbers", () => {
    expect(() => buildWorktreePath(0, "feat/x")).toThrow(/issue/i);
    expect(() => buildWorktreePath(-1, "feat/x")).toThrow(/issue/i);
  });
});
