import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createTestUser } from "./helpers/db";

const E2E_EMAIL = `e2e-${Date.now()}@kairous.local`;
const E2E_PASSWORD = "e2e-test-password-12345";

async function globalSetup() {
  const userId = await createTestUser(E2E_EMAIL, E2E_PASSWORD);

  // auth.setup.ts と global-teardown.ts で使うためファイルに保存
  const authDir = resolve(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    resolve(authDir, "test-user.json"),
    JSON.stringify({ id: userId, email: E2E_EMAIL, password: E2E_PASSWORD }),
  );
}

export default globalSetup;
