import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanupTestData, deleteTestUser } from "./helpers/db";
import type { TestUserData } from "./helpers/types";

async function globalTeardown() {
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
