#!/usr/bin/env bun
/**
 * worktree 作成/削除を自動化するコマンド。
 * 並列開発時の手順ミスとディレクトリ命名のブレを防ぐ目的で導入 (#265)。
 * 作成時に supabase/migrations の次番号を予約して標準出力 + .kairous/worktree.json
 * に記録する (#266)。複数 worktree で DB スキーマ変更が並走したときの番号衝突を防ぐ。
 *
 * 使い方:
 *   bun run worktree:create <issue-number> <branch-name>
 *   bun run worktree:cleanup <worktree-path>
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

/**
 * ブランチ名から type prefix (feat/, fix/...) と先頭の Issue 番号を剥がして
 * ディレクトリサフィックス用のスラッグを返す。
 *
 * 注意: 1 段の type prefix (`feat/`, `fix/`, `refactor/` 等) のみを想定する。
 * `refactor/core/123-foo` のような多段 prefix は `core/123-foo` → `foo` と
 * 期待と異なる結果になる。現運用は 1 段で統一されているため問題ない。
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

// supabase の migration ファイル命名規約: `NNNNN_name.sql`。5 桁以上の連番 (現状 5 桁固定だが
// 将来 6 桁以上になっても動くよう `{5,}` を許容する)
const MIGRATION_FILE_REGEX = /^(\d{5,})_.+\.sql$/;

/**
 * 既存マイグレーションファイル名の配列から最大番号を返す。
 * ファイル一覧を引数で受け取り pure 関数にすることでテスト容易性を確保。
 */
export function findMaxMigrationNumber(files: readonly string[]): number {
  let max = 0;
  for (const f of files) {
    const m = MIGRATION_FILE_REGEX.exec(f);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return max;
}

/**
 * 次に使う migration 番号 (最大 + 1) を返す。
 * .kairous/worktree.json に記録済みの予約済み番号は採番対象から除外する。
 */
export function nextMigrationNumber(
  files: readonly string[],
  reservedNumbers: readonly number[] = [],
): number {
  const baseline = findMaxMigrationNumber(files);
  const reservedMax = reservedNumbers.reduce(
    (acc, n) => (n > acc ? n : acc),
    0,
  );
  return Math.max(baseline, reservedMax) + 1;
}

type WorktreeRecord = {
  path: string;
  branch: string;
  // 予約済み migration 番号。将来 range 対応のため配列で保持
  reservedMigrations: number[];
};

type WorktreeManifest = {
  version: 1;
  worktrees: WorktreeRecord[];
};

const MANIFEST_REL_PATH = ".kairous/worktree.json";

/**
 * manifest JSON をパースする。破損/未存在時は空の manifest を返す。
 * 人手編集で reservedMigrations が配列でない不正レコードが混入してもクラッシュしないよう、
 * 各レコードを最小限バリデートして不正要素は除外する (後続の flatMap / filter の保護)。
 */
export function readManifest(contents: string | null): WorktreeManifest {
  if (!contents) return { version: 1, worktrees: [] };
  try {
    const parsed = JSON.parse(contents) as Partial<WorktreeManifest>;
    if (parsed.version !== 1 || !Array.isArray(parsed.worktrees)) {
      return { version: 1, worktrees: [] };
    }
    const worktrees = parsed.worktrees.filter((w): w is WorktreeRecord => {
      if (typeof w !== "object" || w === null) return false;
      const record = w as Record<string, unknown>;
      return (
        typeof record.path === "string" &&
        typeof record.branch === "string" &&
        Array.isArray(record.reservedMigrations) &&
        record.reservedMigrations.every(
          (n) => typeof n === "number" && Number.isInteger(n),
        )
      );
    });
    return { version: 1, worktrees };
  } catch {
    return { version: 1, worktrees: [] };
  }
}

/**
 * 同一 path のレコードは置換し、それ以外は保持した manifest を返す。
 */
export function upsertWorktreeRecord(
  manifest: WorktreeManifest,
  record: WorktreeRecord,
): WorktreeManifest {
  const others = manifest.worktrees.filter((w) => w.path !== record.path);
  return { version: 1, worktrees: [...others, record] };
}

/**
 * manifest に含まれるすべての予約済み番号を flat 化して返す。
 */
export function collectReservedMigrations(
  manifest: WorktreeManifest,
): number[] {
  return manifest.worktrees.flatMap((w) => w.reservedMigrations);
}

export type WorktreeRow = {
  path: string;
  branch: string;
  reservedMigrations: number[];
  hasUncommittedChanges: boolean;
  // status コマンドが失敗したケース (worktree 不在 / 権限なし等)。"clean" 誤表示を防ぐ
  statusUnavailable?: boolean;
  isMain: boolean;
};

/**
 * `git worktree list --porcelain` の出力をパースする。
 * ブロック間は空行で区切られ、各ブロックは `worktree <path>` と `branch refs/heads/<name>` を含む。
 * detached HEAD の worktree は `branch` 行が欠如する。
 */
export function parseGitWorktreeList(
  porcelain: string,
): Array<{ path: string; branch: string }> {
  const result: Array<{ path: string; branch: string }> = [];
  for (const block of porcelain.split(/\n\s*\n/)) {
    const lines = block.trim().split("\n");
    const pathLine = lines.find((l) => l.startsWith("worktree "));
    if (!pathLine) continue;
    const path = pathLine.slice("worktree ".length).trim();
    // `branch refs/heads/<name>` のみをブランチとみなす。tag checkout 等の
    // `branch refs/tags/xxx` は detached HEAD 相当として扱う (誤ったブランチ名を出さない)
    const branchLine = lines.find((l) => l.startsWith("branch refs/heads/"));
    const branch = branchLine
      ? branchLine.slice("branch refs/heads/".length).trim()
      : "(detached)";
    result.push({ path, branch });
  }
  return result;
}

/**
 * worktree 一覧を人間可読なテーブルに整形する。
 * main worktree は先頭カラムに `*` が付く。予約番号は 5 桁ゼロ埋めで `,` 区切り。
 */
export function formatWorktreeTable(rows: readonly WorktreeRow[]): string {
  if (rows.length === 0) return "(no worktrees)";
  const headers = ["", "Branch", "Path", "Reserved", "Changes"];
  const body = rows.map((r) => [
    r.isMain ? "*" : " ",
    r.branch,
    r.path,
    r.reservedMigrations.length > 0
      ? r.reservedMigrations
          .map((n) => String(n).padStart(5, "0"))
          .join(",")
      : "-",
    r.statusUnavailable
      ? "unknown"
      : r.hasUncommittedChanges
        ? "modified"
        : "clean",
  ]);
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...body.map((row) => row[i].length)),
  );
  const pad = (row: string[]) =>
    row.map((c, i) => c.padEnd(widths[i])).join(" | ");
  const separator = widths.map((w) => "-".repeat(w)).join("-+-");
  return [pad(headers), separator, ...body.map(pad)].join("\n");
}

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) {
    // signal kill 時は result.status が null / result.signal に シグナル名 が入る
    const reason = result.signal
      ? `signal ${result.signal}`
      : `exit ${result.status}`;
    throw new Error(`${cmd} ${args.join(" ")} failed (${reason})`);
  }
}

function loadManifest(root: string): WorktreeManifest {
  const manifestPath = join(root, MANIFEST_REL_PATH);
  const contents = existsSync(manifestPath)
    ? readFileSync(manifestPath, "utf8")
    : null;
  return readManifest(contents);
}

function saveManifest(root: string, manifest: WorktreeManifest): void {
  const dir = join(root, ".kairous");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(root, MANIFEST_REL_PATH),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function create(issueArg: string | undefined, branch: string | undefined): void {
  if (!issueArg || !branch) {
    throw new Error(
      "Usage: bun run worktree:create <issue-number> <branch-name>",
    );
  }
  const issueNumber = Number(issueArg);
  if (Number.isNaN(issueNumber)) {
    // "abc" 等の非数値は早期に弾いてユーザーに元の値をエラーで見せる
    // (そのまま buildWorktreePath に渡すと `got: NaN` というわかりにくいメッセージになる)
    throw new Error(`Issue number must be a number, got: "${issueArg}"`);
  }
  const path = buildWorktreePath(issueNumber, branch);
  run("git", ["worktree", "add", "-b", branch, path]);

  // migration 番号の予約: 既存最大 + manifest で既に予約済みの番号を超える連番を払い出す
  const root = process.cwd();
  const migrationsDir = join(root, "supabase", "migrations");
  const migrationFiles = existsSync(migrationsDir)
    ? readdirSync(migrationsDir)
    : [];
  const manifest = loadManifest(root);
  const reserved = collectReservedMigrations(manifest);
  const next = nextMigrationNumber(migrationFiles, reserved);

  const updated = upsertWorktreeRecord(manifest, {
    path,
    branch,
    reservedMigrations: [next],
  });
  saveManifest(root, updated);

  const padded = String(next).padStart(5, "0");
  console.log(`\nWorktree ready: ${resolve(path)}`);
  console.log(`Branch: ${branch}`);
  console.log(`Reserved migration number: ${padded}`);
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

  // manifest から該当 path のレコードを削除 (予約番号の占有を解放)。
  // pathArg が末尾 `/` 付きだったり絶対パスだったりすると manifest の保存時と一致しないため、
  // どちらも resolve() で正規化してから比較する
  const root = process.cwd();
  const manifest = loadManifest(root);
  const normalizedTarget = resolve(root, pathArg);
  const remaining = manifest.worktrees.filter(
    (w) => resolve(root, w.path) !== normalizedTarget,
  );
  if (remaining.length !== manifest.worktrees.length) {
    saveManifest(root, { version: 1, worktrees: remaining });
  }

  console.log(`\nWorktree removed: ${pathArg}`);
}

function list(): void {
  const root = process.cwd();
  const gitOut = spawnSync("git", ["worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  // git リポジトリ外での実行等で失敗した場合、空出力 → "(no worktrees)" と
  // 表示されて原因が分かりにくいため、非ゼロ exit は明示的に throw する
  if (gitOut.status !== 0) {
    throw new Error(
      `git worktree list failed (exit ${gitOut.status}). git リポジトリ内で実行されているか確認してください。`,
    );
  }
  const parsed = parseGitWorktreeList(gitOut.stdout ?? "");
  const manifest = loadManifest(root);

  // manifest の relative path (`../kairous-xxx`) と git が返す absolute path を突合するため
  // main worktree の cwd() を起点に resolve して比較する
  const reservations = new Map<string, number[]>();
  for (const w of manifest.worktrees) {
    reservations.set(resolve(root, w.path), w.reservedMigrations);
  }

  const rows: WorktreeRow[] = parsed.map((entry) => {
    const abs = resolve(entry.path);
    const statusOut = spawnSync(
      "git",
      ["-C", entry.path, "status", "--porcelain"],
      { encoding: "utf8" },
    );
    // status が失敗する (worktree 削除済み / 権限なし等) と stdout が空で false → "clean" に
    // 誤表示されるため、status が非ゼロ exit なら unknown 扱いにする
    const statusOk = statusOut.status === 0;
    return {
      path: entry.path,
      branch: entry.branch,
      reservedMigrations: reservations.get(abs) ?? [],
      hasUncommittedChanges: statusOk
        ? (statusOut.stdout ?? "").trim().length > 0
        : false,
      statusUnavailable: !statusOk,
      isMain: abs === resolve(root),
    };
  });

  console.log(formatWorktreeTable(rows));
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
    case "list":
      list();
      break;
    default:
      throw new Error(
        `Unknown command: ${command ?? "(none)"}. Use "create", "cleanup", or "list".`,
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
