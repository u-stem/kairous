#!/usr/bin/env bun
// @ts-check
/**
 * src/app/**\/page.tsx と lighthouserc.json の URL 差分を検出する。
 * 未登録ルートまたは存在しない URL があれば exit 1。
 * 意図的除外は scripts/lighthouse-coverage-allowlist.json で管理する。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

export interface Allowlist {
  routes: string[];
}

/**
 * src/app/xxx/page.tsx のパスから Next.js App Router の URL パターンに変換する。
 * (group) は URL から除外し、[param] は動的セグメントとして保持する。
 */
export function pageFileToRoutePattern(relativePath: string): string {
  const withoutPrefix = relativePath
    .replace(/^src\/app\//, "")
    .replace(/\/page\.tsx$/, "");
  if (withoutPrefix === "" || withoutPrefix === "page.tsx") return "/";
  const segments = withoutPrefix
    .split("/")
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  if (segments.length === 0) return "/";
  return "/" + segments.join("/");
}

/**
 * lighthouserc URL の pathname を、page.tsx 由来のパターン集合に照合する。
 * 動的セグメントはワイルドカードとして扱う。静的セグメントが一致する方を優先する。
 */
export function urlToRoutePattern(
  url: string,
  allKnownPatterns: string[],
): string {
  const pathname = new URL(url).pathname;
  // 静的優先: [param] を含まないパターンを先にマッチさせる
  const staticFirst = [...allKnownPatterns].sort((a, b) => {
    const aDynamic = (a.match(/\[/g) ?? []).length;
    const bDynamic = (b.match(/\[/g) ?? []).length;
    return aDynamic - bDynamic;
  });
  for (const pattern of staticFirst) {
    const regex = new RegExp(
      "^" + pattern.replace(/\[[^\]]+\]/g, "[^/]+") + "$",
    );
    if (regex.test(pathname)) return pattern;
  }
  return pathname; // orphan
}

/**
 * page.tsx 群と lighthouserc URL 群の差分を返す。
 * missing: page.tsx にあるが URL に未登録 (allowlist 除く)
 * orphan: URL にあるが page.tsx に対応なし
 */
export function checkCoverage(
  pages: string[],
  lhUrls: string[],
  allowlist: Allowlist,
): { missing: string[]; orphan: string[] } {
  const pagePatterns = pages.map(pageFileToRoutePattern);
  const allowSet = new Set(allowlist.routes);
  const urlPatterns = lhUrls.map((u) => urlToRoutePattern(u, pagePatterns));
  const covered = new Set(urlPatterns);
  const missing = pagePatterns.filter(
    (p) => !covered.has(p) && !allowSet.has(p),
  );
  const orphan = urlPatterns.filter((p) => !pagePatterns.includes(p));
  return { missing, orphan };
}

// src/app の下を再帰的に走査し page.tsx を列挙する (外部ライブラリ不使用)
function scanPageFiles(dir: string, repoRoot: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...scanPageFiles(full, repoRoot));
    } else if (entry === "page.tsx") {
      results.push(relative(repoRoot, full));
    }
  }
  return results;
}

function main() {
  const repoRoot = resolve(__dirname, "..");

  // src/app/**/page.tsx を列挙
  const pages = scanPageFiles(resolve(repoRoot, "src/app"), repoRoot);

  // lighthouserc.json の URL 配列を読む
  const lhConfig = JSON.parse(
    readFileSync(resolve(repoRoot, "lighthouserc.json"), "utf-8"),
  ) as { ci: { collect: { url: string[] } } };
  const urls = lhConfig.ci.collect.url;

  // allowlist
  const allowlist = JSON.parse(
    readFileSync(
      resolve(repoRoot, "scripts/lighthouse-coverage-allowlist.json"),
      "utf-8",
    ),
  ) as Allowlist;

  const { missing, orphan } = checkCoverage(pages, urls, allowlist);

  if (missing.length === 0 && orphan.length === 0) {
    console.log(
      `✓ Lighthouse coverage OK (${pages.length} pages, ${urls.length} URLs)`,
    );
    return;
  }

  if (missing.length > 0) {
    console.error(
      `✗ lighthouserc.json に未登録のルート (${missing.length} 件):`,
    );
    for (const p of missing) console.error(`    ${p}`);
    console.error(
      `  対応: lighthouserc.json に URL を追加するか、scripts/lighthouse-coverage-allowlist.json の routes に追記してください`,
    );
  }
  if (orphan.length > 0) {
    console.error(`✗ page.tsx に対応しない URL (${orphan.length} 件):`);
    for (const p of orphan) console.error(`    ${p}`);
    console.error(
      `  対応: lighthouserc.json から削除するか、対応 page.tsx を追加してください`,
    );
  }
  process.exit(1);
}

// CLI として実行された場合のみ main を呼ぶ (test import では実行しない)
// fileURLToPath で import.meta.url をパスに変換し、実行ファイルと照合する
const thisFile = new URL(import.meta.url).pathname;
if (process.argv[1] === thisFile) {
  main();
}
