import { describe, expect, it } from "vitest";
import {
  buildWorktreePath,
  collectReservedMigrations,
  findMaxMigrationNumber,
  nextMigrationNumber,
  readManifest,
  slugifyBranch,
  upsertWorktreeRecord,
} from "../../../scripts/worktree";

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

describe("findMaxMigrationNumber", () => {
  it("returns the highest numeric prefix among .sql files", () => {
    expect(
      findMaxMigrationNumber([
        "00015_notifications.sql",
        "00016_methods.sql",
        "00024_search_path_hardening.sql",
        "README.md",
      ]),
    ).toBe(24);
  });

  it("returns 0 when no migration files match the pattern", () => {
    expect(findMaxMigrationNumber(["notes.md", "readme.txt"])).toBe(0);
    expect(findMaxMigrationNumber([])).toBe(0);
  });

  it("ignores malformed filenames without the leading 5-digit prefix", () => {
    expect(findMaxMigrationNumber(["99_too_short.sql", "abc_foo.sql"])).toBe(0);
  });
});

describe("nextMigrationNumber", () => {
  it("returns max+1 when no reservations exist", () => {
    expect(nextMigrationNumber(["00024_foo.sql"])).toBe(25);
  });

  it("skips already reserved numbers to avoid concurrent worktree collisions", () => {
    // worktree A が 25 を予約済。既存最大は 24 でも B には 26 が払い出される
    expect(nextMigrationNumber(["00024_foo.sql"], [25])).toBe(26);
  });

  it("respects reservations even when file-level max is lower", () => {
    expect(nextMigrationNumber([], [25, 27])).toBe(28);
  });
});

describe("readManifest", () => {
  it("returns empty manifest for null input", () => {
    expect(readManifest(null)).toEqual({ version: 1, worktrees: [] });
  });

  it("returns empty manifest when JSON is malformed", () => {
    expect(readManifest("{broken")).toEqual({ version: 1, worktrees: [] });
  });

  it("rejects unknown version to force migration on breaking changes", () => {
    const contents = JSON.stringify({ version: 2, worktrees: [] });
    expect(readManifest(contents)).toEqual({ version: 1, worktrees: [] });
  });

  it("preserves existing records when parsing succeeds", () => {
    const contents = JSON.stringify({
      version: 1,
      worktrees: [
        { path: "../kairous-1-foo", branch: "feat/1-foo", reservedMigrations: [25] },
      ],
    });
    expect(readManifest(contents).worktrees).toHaveLength(1);
  });

  it("filters out records with invalid shape (hand-edited corruption)", () => {
    // reservedMigrations が配列でない不正レコードは除外する
    const contents = JSON.stringify({
      version: 1,
      worktrees: [
        { path: "valid", branch: "feat/v", reservedMigrations: [25] },
        { path: "invalid", branch: "feat/b", reservedMigrations: "not-array" },
        { path: "missing-field" },
      ],
    });
    const parsed = readManifest(contents);
    expect(parsed.worktrees).toHaveLength(1);
    expect(parsed.worktrees[0].path).toBe("valid");
  });
});

describe("upsertWorktreeRecord", () => {
  it("replaces the record that matches path and keeps others", () => {
    const manifest = {
      version: 1 as const,
      worktrees: [
        { path: "../kairous-1-a", branch: "feat/1-a", reservedMigrations: [25] },
        { path: "../kairous-2-b", branch: "feat/2-b", reservedMigrations: [26] },
      ],
    };
    const updated = upsertWorktreeRecord(manifest, {
      path: "../kairous-1-a",
      branch: "feat/1-a",
      reservedMigrations: [25, 27],
    });
    expect(updated.worktrees).toHaveLength(2);
    expect(
      updated.worktrees.find((w) => w.path === "../kairous-1-a")
        ?.reservedMigrations,
    ).toEqual([25, 27]);
  });
});

describe("collectReservedMigrations", () => {
  it("flattens reservations across all worktrees", () => {
    const manifest = {
      version: 1 as const,
      worktrees: [
        { path: "a", branch: "feat/a", reservedMigrations: [25, 26] },
        { path: "b", branch: "feat/b", reservedMigrations: [27] },
      ],
    };
    expect(collectReservedMigrations(manifest)).toEqual([25, 26, 27]);
  });
});
