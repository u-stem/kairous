import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  createTestUser,
  createTestSubject,
  createTestMaterial,
  createTestCard,
  createTestSession,
  linkMaterialMethod,
  getSrsMethodId,
} from "./helpers/db";
import { E2E_PASSWORD } from "./helpers/types";

// Lighthouse CI が動的ルート (/materials/[id], /cards/[cardId] 等) を計測するための固定 UUID。
// lighthouserc.json でハードコードされており、ここで作成する material/card と一致する必要がある
export const LIGHTHOUSE_MATERIAL_ID = "00000000-0000-4000-8000-000000000001";
export const LIGHTHOUSE_CARD_ID = "00000000-0000-4000-8000-000000000002";

// セッション系動的ルート (/session/[id], /summary, /rest/[id]) 計測用。
// /session/[id] は in_progress、/summary は completed が必要なため 2 セッション seed する
export const LIGHTHOUSE_SESSION_IN_PROGRESS_ID = "00000000-0000-4000-8000-000000000003";
export const LIGHTHOUSE_SESSION_COMPLETED_ID = "00000000-0000-4000-8000-000000000004";

async function globalSetup() {
  const email = `e2e-${Date.now()}@kairous.local`;
  const userId = await createTestUser(email, E2E_PASSWORD);

  // Lighthouse CI で動的ルート (/materials/[id], cards/[cardId]) を計測するため
  // test user 配下に固定 UUID で 1 教材 + 1 カードを seed する。
  // 各 PR の CI run は fresh user で動作し、global-teardown で cascade 削除されるため冪等
  const subject = await createTestSubject(userId, "Lighthouse seed分野");
  await createTestMaterial(
    subject.id,
    userId,
    "Lighthouse seed教材",
    LIGHTHOUSE_MATERIAL_ID,
  );
  const srsMethodId = await getSrsMethodId();
  await linkMaterialMethod(LIGHTHOUSE_MATERIAL_ID, srsMethodId);
  await createTestCard(
    LIGHTHOUSE_MATERIAL_ID,
    "Lighthouse seed 表",
    "Lighthouse seed 裏",
    0,
    LIGHTHOUSE_CARD_ID,
  );

  // セッション系動的ルート計測用に in_progress / completed の 2 セッションを seed。
  // /rest/[id] は DB lookup なしのため in_progress session の UUID を流用する
  await createTestSession(
    userId,
    LIGHTHOUSE_MATERIAL_ID,
    srsMethodId,
    "in_progress",
    LIGHTHOUSE_SESSION_IN_PROGRESS_ID,
  );
  await createTestSession(
    userId,
    LIGHTHOUSE_MATERIAL_ID,
    srsMethodId,
    "completed",
    LIGHTHOUSE_SESSION_COMPLETED_ID,
    { ended_at: new Date().toISOString(), duration_sec: 300 },
  );

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
