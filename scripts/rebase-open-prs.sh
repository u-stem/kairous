#!/usr/bin/env bash
# 自分宛で open な PR の feature branch を順次 main と同期する。
#
# workflow.yml 等が main に merge された直後は、既存 feat branch の workflow 内容が
# default branch と不一致で Claude PR Review が 401 Workflow validation failed になる。
# 本 script で各 PR の branch に main を merge + push することで全 PR の review を復活させる。
#
# Usage:
#   ./scripts/rebase-open-prs.sh        # ドライラン (実行内容のみ表示)
#   ./scripts/rebase-open-prs.sh --run  # 実際に merge + push する

set -euo pipefail

RUN_MODE="dryrun"
if [ "${1:-}" = "--run" ]; then
  RUN_MODE="run"
fi

# 実行前の branch を退避して終了時に戻す
ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
trap 'git checkout "$ORIGINAL_BRANCH" >/dev/null 2>&1 || true' EXIT

# 未コミットの変更があると checkout が失敗するため事前チェック
if ! git diff-index --quiet HEAD --; then
  echo "ERROR: 未コミットの変更があります。commit or stash してから再実行してください。"
  exit 1
fi

git fetch origin main --quiet

# 自分宛で open な PR の head branch を列挙。fork PR は同一リポ前提のため除外は不要
# (headRepositoryOwner.login が自分かどうかで絞ってもよいが、gh auth の user 単位で OK)
# set -e 下で gh の失敗 (認証切れ、ネットワーク等) をユーザー向けメッセージでラップする。
# process substitution `<(...)` はサブシェルで実行され exit code が mapfile に伝搬しないため、
# 一時変数 + 明示的な `|| { ... }` で成否を判定する必要がある。
PR_OUTPUT=$(
  gh pr list --state open --author "@me" --json headRefName,number \
    --jq '.[] | "\(.number) \(.headRefName)"'
) || {
  echo "ERROR: gh pr list に失敗しました。gh auth status を確認してください。"
  exit 1
}
if [ -z "$PR_OUTPUT" ]; then
  BRANCHES=()
else
  mapfile -t BRANCHES <<< "$PR_OUTPUT"
fi

if [ ${#BRANCHES[@]} -eq 0 ]; then
  echo "open PR なし。何もしません。"
  exit 0
fi

echo "対象 PR: ${#BRANCHES[@]} 件"
for entry in "${BRANCHES[@]}"; do
  pr_number="${entry%% *}"
  branch="${entry#* }"
  echo ""
  echo "--- PR #$pr_number ($branch) ---"

  if [ "$RUN_MODE" = "dryrun" ]; then
    echo "  [dryrun] git checkout $branch && git merge origin/main && git push"
    continue
  fi

  # checkout 失敗は local に branch 未 fetch のケースが多い。リモートから対象 branch を
  # fetch してから再試行することで成功率を上げる (失敗しても続行)
  git fetch origin "$branch" --quiet 2>/dev/null || true
  if ! git checkout "$branch" >/dev/null 2>&1; then
    echo "  SKIP: branch checkout 失敗 ($branch 不在 or local 未 fetch)"
    continue
  fi

  # conflict 発生時は merge --abort して次へ。手動解決を促す
  if ! git merge --no-edit origin/main >/dev/null 2>&1; then
    git merge --abort >/dev/null 2>&1 || true
    echo "  CONFLICT: $branch は main と競合。手動で解決してください。"
    continue
  fi

  if ! git push >/dev/null 2>&1; then
    echo "  WARN: push 失敗 ($branch)。権限や upstream 設定を確認"
    continue
  fi

  echo "  OK: $branch を main と同期して push"
done

echo ""
if [ "$RUN_MODE" = "dryrun" ]; then
  echo "ドライラン完了。実際に実行するには --run を付けて再実行してください。"
else
  echo "完了。"
fi
