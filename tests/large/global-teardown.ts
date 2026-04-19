import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanupTestData, deleteTestUser } from "./helpers/db";
import type { TestUserData } from "./helpers/types";

async function globalTeardown() {
  // Lighthouse CI 用に setup のみ実行する場合はユーザーを残す必要がある。
  // storageState 生成後に teardown で消すと、Lighthouse が無効なセッションで
  // /auth/login にリダイレクトされてしまい、意図した画面を計測できない。
  if (process.env.LHCI_SKIP_TEARDOWN === "1") {
    return;
  }

  // 共有 E2E ユーザー と auth-tests 専用ユーザーの双方を削除する (#242)
  const cleanup = async (fileName: string) => {
    const userPath = resolve(__dirname, ".auth", fileName);
    let user: TestUserData;
    try {
      user = JSON.parse(readFileSync(userPath, "utf-8")) as TestUserData;
    } catch {
      // ファイル不在: global-setup が途中で失敗したケース → skip
      return;
    }
    // アプリデータを先に削除 (CASCADE でない FK がある場合の安全策)。
    // 失敗は次回実行のゴミデータに繋がるため console.error で記録する
    try {
      await cleanupTestData(user.id);
      await deleteTestUser(user.id);
    } catch (e) {
      console.error(`teardown ${fileName} failed:`, e);
    }
  };

  await cleanup("test-user.json");
  await cleanup("auth-test-user.json");
}

export default globalTeardown;
