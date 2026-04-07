import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createTestUser } from "./helpers/db";
import { E2E_PASSWORD } from "./helpers/types";

async function globalSetup() {
  const email = `e2e-${Date.now()}@kairous.local`;
  const userId = await createTestUser(email, E2E_PASSWORD);

  // auth.setup.ts と global-teardown.ts で使うためファイルに保存
  // パスワードはファイルに書き出さず、定数として共有する
  const authDir = resolve(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    resolve(authDir, "test-user.json"),
    JSON.stringify({ id: userId, email }),
  );
}

export default globalSetup;
