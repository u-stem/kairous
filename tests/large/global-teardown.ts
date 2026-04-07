import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deleteTestUser } from "./helpers/db";
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
  await deleteTestUser(user.id);
}

export default globalTeardown;
