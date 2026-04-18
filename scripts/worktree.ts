#!/usr/bin/env bun
/**
 * worktree 作成/削除を自動化するコマンド。
 * 並列開発時の手順ミスとディレクトリ命名のブレを防ぐ目的で導入。
 *
 * 使い方:
 *   bun run worktree:create <issue-number> <branch-name>
 *   bun run worktree:cleanup <worktree-path>
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * ブランチ名から type prefix (feat/, fix/...) と先頭の Issue 番号を剥がして
 * ディレクトリサフィックス用のスラッグを返す。
 */
export function slugifyBranch(branch: string): string {
  if (!branch) {
    throw new Error("branch name is required");
  }
  const withoutType = branch.replace(/^[^/]+\//, "");
  const withoutIssue = withoutType.replace(/^\d+-/, "");
  return withoutIssue;
}

/**
 * 兄弟ディレクトリ方式の worktree パスを組み立てる。
 * 例: buildWorktreePath(265, "feat/265-worktree-scripts") → "../kairous-265-worktree-scripts"
 */
export function buildWorktreePath(issueNumber: number, branch: string): string {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(
      `Expected positive integer for issue number, got: ${issueNumber}`,
    );
  }
  const slug = slugifyBranch(branch);
  return `../kairous-${issueNumber}-${slug}`;
}

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (exit ${result.status})`);
  }
}

function create(issueArg: string | undefined, branch: string | undefined): void {
  if (!issueArg || !branch) {
    throw new Error(
      "Usage: bun run worktree:create <issue-number> <branch-name>",
    );
  }
  const issueNumber = Number(issueArg);
  const path = buildWorktreePath(issueNumber, branch);
  run("git", ["worktree", "add", "-b", branch, path]);
  console.log(`\nWorktree ready: ${resolve(path)}`);
  console.log(`Branch: ${branch}`);
}

function cleanup(pathArg: string | undefined): void {
  if (!pathArg) {
    throw new Error("Usage: bun run worktree:cleanup <worktree-path>");
  }
  // ブランチ名は worktree 削除前に取得しないと消える
  const branchResult = spawnSync(
    "git",
    ["-C", pathArg, "rev-parse", "--abbrev-ref", "HEAD"],
    { encoding: "utf8" },
  );
  const branch = branchResult.stdout?.trim();
  run("git", ["worktree", "remove", pathArg]);
  if (branch && branch !== "HEAD") {
    // unmerged ブランチで -d は失敗するが、prune まで進めたいので警告に留める。
    // ユーザーが意図的に破棄したい場合は git branch -D を手動で実行する。
    const del = spawnSync("git", ["branch", "-d", branch], { stdio: "inherit" });
    if (del.status !== 0) {
      console.warn(
        `\nBranch "${branch}" could not be deleted (likely unmerged). Run: git branch -D ${branch}`,
      );
    }
  }
  run("git", ["worktree", "prune"]);
  console.log(`\nWorktree removed: ${pathArg}`);
}

function main(argv: string[]): void {
  const [command, ...rest] = argv;
  switch (command) {
    case "create":
      create(rest[0], rest[1]);
      break;
    case "cleanup":
      cleanup(rest[0]);
      break;
    default:
      throw new Error(
        `Unknown command: ${command ?? "(none)"}. Use "create" or "cleanup".`,
      );
  }
}

// 直接実行時のみ CLI として動作させる (test import では発火させない)。
// Bun 独自の import.meta.main を使う。TS 標準型には未定義なのでアサーションで参照。
if ((import.meta as { main?: boolean }).main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
