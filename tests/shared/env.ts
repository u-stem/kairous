import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * .env.local から環境変数を読み込む。
 * vitest / Playwright は Next.js の自動読み込みを持たないため手動で実行する。
 * CI では環境変数が直接設定されるためファイル不在でも問題ない。
 */
export function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  try {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex);
      // = 以降全体が値 (値に = を含む URL 等に対応)
      const value = trimmed.slice(eqIndex + 1).replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local がない場合は環境変数が既に設定されている前提 (CI)
  }
}
