import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deleteTestUser } from "./helpers/db";

interface TestUserData {
  id: string;
  email: string;
  password: string;
}

async function globalTeardown() {
  const userPath = resolve(__dirname, ".auth", "test-user.json");
  try {
    const user = JSON.parse(readFileSync(userPath, "utf-8")) as TestUserData;
    await deleteTestUser(user.id);
  } catch {
    // ファイルがない場合はスキップ (テストが途中で失敗した可能性)
  }
}

export default globalTeardown;
