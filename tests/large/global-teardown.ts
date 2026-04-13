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

  const userPath = resolve(__dirname, ".auth", "test-user.json");
  let user: TestUserData;
  try {
    user = JSON.parse(readFileSync(userPath, "utf-8")) as TestUserData;
  } catch {
    // test-user.json がない場合: global-setup が失敗したケース
    return;
  }
  // アプリデータを先に削除 (CASCADE でない FK がある場合の安全策)
  await cleanupTestData(user.id);
  await deleteTestUser(user.id);
}

export default globalTeardown;
