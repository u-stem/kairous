import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// .env.local から環境変数を読み込む
const envPath = resolve(process.cwd(), ".env.local");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1).replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local がない場合は環境変数が既に設定されている前提 (CI)
}

export { adminClient, createTestUser, deleteTestUser } from "../../shared/db";
export {
  createTestSubject,
  createTestMaterial,
  createTestCard,
  getSrsMethodId,
  getWakefulRestMethodId,
  linkMaterialMethod,
  createTestSrsState,
  createTestSession,
  cleanupTestData,
} from "../../shared/helpers";
