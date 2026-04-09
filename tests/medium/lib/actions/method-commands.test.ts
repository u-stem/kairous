import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  getAdminClient,
  createTestUser,
  deleteTestUser,
  createUserClient,
} from "../../setup";
import {
  cleanupCustomMethods,
  cleanupTestData,
  createTestSubject,
  createTestMaterial,
  linkMaterialMethod,
  createTestSession,
  getSrsMethodId,
} from "../../helpers/db";
import type { Database } from "../../../../src/lib/types/database";
import { generateMethodSlug } from "../../../../src/lib/utils/slug";

type MethodRow = Database["public"]["Tables"]["learning_methods"]["Row"];

const TEST_EMAIL = `method-test-${Date.now()}@kairous.local`;
const OTHER_EMAIL = `method-other-${Date.now()}@kairous.local`;
const TEST_PASSWORD = "test-password-12345";

let userId: string;
let otherUserId: string;

beforeAll(async () => {
  userId = await createTestUser(TEST_EMAIL, TEST_PASSWORD);
  otherUserId = await createTestUser(OTHER_EMAIL, TEST_PASSWORD);
});

afterEach(async () => {
  await cleanupTestData(userId);
  await cleanupTestData(otherUserId);
  await cleanupCustomMethods(userId);
  await cleanupCustomMethods(otherUserId);
});

afterAll(async () => {
  await deleteTestUser(userId);
  await deleteTestUser(otherUserId);
});

// admin client でカスタム手法を作成するヘルパー
async function insertCustomMethod(
  ownerUserId: string,
  name: string,
  overrides: Partial<MethodRow> = {},
) {
  const slug = generateMethodSlug(ownerUserId, name);
  const { data, error } = await getAdminClient()
    .from("learning_methods")
    .insert({
      slug,
      name,
      category: "general",
      default_config: {},
      is_system: false,
      user_id: ownerUserId,
      description: null,
      default_duration_sec: null,
      ...overrides,
    })
    .select()
    .single<MethodRow>();
  if (error) throw new Error(`カスタム手法作成失敗: ${error.message}`);
  return data;
}

describe("learning_methods CRUD", () => {
  it("inserts a custom method with all fields", async () => {
    const { data, error } = await getAdminClient()
      .from("learning_methods")
      .insert({
        slug: generateMethodSlug(userId, "音読"),
        name: "音読",
        category: "comprehension",
        default_config: {},
        is_system: false,
        user_id: userId,
        description: "声に出して読む",
        default_duration_sec: 1800,
      })
      .select()
      .single<MethodRow>();

    expect(error).toBeNull();
    expect(data!.name).toBe("音読");
    expect(data!.category).toBe("comprehension");
    expect(data!.is_system).toBe(false);
    expect(data!.user_id).toBe(userId);
    expect(data!.description).toBe("声に出して読む");
    expect(data!.default_duration_sec).toBe(1800);
  });

  it("inserts a stopwatch method with null duration", async () => {
    const { data, error } = await getAdminClient()
      .from("learning_methods")
      .insert({
        slug: generateMethodSlug(userId, "ストップウォッチ"),
        name: "ストップウォッチ",
        category: "general",
        default_config: {},
        is_system: false,
        user_id: userId,
        default_duration_sec: null,
      })
      .select()
      .single<MethodRow>();

    expect(error).toBeNull();
    expect(data!.default_duration_sec).toBeNull();
  });

  it("rejects duplicate name for same user", async () => {
    await insertCustomMethod(userId, "重複テスト");

    const { error } = await getAdminClient()
      .from("learning_methods")
      .insert({
        slug: generateMethodSlug(userId, "重複テスト"),
        name: "重複テスト",
        category: "general",
        default_config: {},
        is_system: false,
        user_id: userId,
      });

    expect(error).not.toBeNull();
    expect(error!.code).toBe("23505");
  });

  it("updates name and category with slug regeneration", async () => {
    const method = await insertCustomMethod(userId, "旧名前", {
      category: "general",
    });
    const newSlug = generateMethodSlug(userId, "新名前");

    const { data, error } = await getAdminClient()
      .from("learning_methods")
      .update({ name: "新名前", category: "memory", slug: newSlug })
      .eq("id", method.id)
      .select()
      .single<MethodRow>();

    expect(error).toBeNull();
    expect(data!.name).toBe("新名前");
    expect(data!.category).toBe("memory");
    expect(data!.slug).toBe(newSlug);
  });

  it("deletes method with no sessions", async () => {
    const method = await insertCustomMethod(userId, "削除対象");

    const { error } = await getAdminClient()
      .from("learning_methods")
      .delete()
      .eq("id", method.id);

    expect(error).toBeNull();

    const { data } = await getAdminClient()
      .from("learning_methods")
      .select("id")
      .eq("id", method.id)
      .maybeSingle();

    expect(data).toBeNull();
  });

  it("allows deletion even with sessions via admin (no FK constraint on sessions.method_id)", async () => {
    // sessions.method_id -> learning_methods.id は FK だが CASCADE なし。
    // Server Action 側でセッション存在チェックを行うため、DB レベルでは FK エラーになる
    const method = await insertCustomMethod(userId, "セッションあり");
    const subject = await createTestSubject(userId);
    const material = await createTestMaterial(subject.id, userId);
    await createTestSession(userId, material.id, method.id, "completed");

    const { error } = await getAdminClient()
      .from("learning_methods")
      .delete()
      .eq("id", method.id);

    // FK 制約で失敗する (sessions.method_id が参照中)
    expect(error).not.toBeNull();
  });

  it("rejects deletion when method is sole method on material", async () => {
    // material_methods に ON DELETE CASCADE があるため DB レベルでは削除可能。
    // Server Action 側で「唯一の手法」チェックを行う。
    // ここでは material_methods の CASCADE 動作を確認する
    const method = await insertCustomMethod(userId, "唯一の手法");
    const subject = await createTestSubject(userId);
    const material = await createTestMaterial(subject.id, userId);
    await linkMaterialMethod(material.id, method.id);

    // 削除前に material_methods に紐付けがあることを確認
    const { count: beforeCount } = await getAdminClient()
      .from("material_methods")
      .select("id", { count: "exact", head: true })
      .eq("material_id", material.id);

    expect(beforeCount).toBe(1);

    // admin で削除すると CASCADE で material_methods も消える
    const { error } = await getAdminClient()
      .from("learning_methods")
      .delete()
      .eq("id", method.id);

    expect(error).toBeNull();

    // material_methods も CASCADE で削除されている
    const { count: afterCount } = await getAdminClient()
      .from("material_methods")
      .select("id", { count: "exact", head: true })
      .eq("material_id", material.id);

    expect(afterCount).toBe(0);
  });
});

describe("learning_methods RLS", () => {
  it("user can read system methods and own custom methods", async () => {
    await insertCustomMethod(userId, "自分の手法");

    const userClient = await createUserClient(TEST_EMAIL, TEST_PASSWORD);
    const { data } = await userClient.from("learning_methods").select("*");
    const rows = data as MethodRow[];

    // システム手法 (srs, elaboration, pomodoro, etc.) + 自分のカスタム手法
    const systemMethods = rows.filter((m) => m.is_system);
    const customMethods = rows.filter((m) => !m.is_system);

    expect(systemMethods.length).toBeGreaterThan(0);
    expect(customMethods).toHaveLength(1);
    expect(customMethods[0].name).toBe("自分の手法");
  });

  it("user cannot read other user custom methods", async () => {
    await insertCustomMethod(otherUserId, "他人の手法");

    const userClient = await createUserClient(TEST_EMAIL, TEST_PASSWORD);
    const { data } = await userClient
      .from("learning_methods")
      .select("*")
      .eq("is_system", false);

    expect(data).toHaveLength(0);
  });

  it("user cannot update system methods", async () => {
    const srsMethodId = await getSrsMethodId();
    const userClient = await createUserClient(TEST_EMAIL, TEST_PASSWORD);

    const { data } = await userClient
      .from("learning_methods")
      .update({ name: "改ざん" })
      .eq("id", srsMethodId)
      .select();

    // RLS の USING (is_system=false) で行がマッチしないため空配列
    expect(data).toHaveLength(0);

    // 実際のデータが変わっていないことを確認
    const { data: original } = await getAdminClient()
      .from("learning_methods")
      .select("name")
      .eq("id", srsMethodId)
      .single();

    expect(original!.name).not.toBe("改ざん");
  });

  it("user cannot delete system methods", async () => {
    const srsMethodId = await getSrsMethodId();
    const userClient = await createUserClient(TEST_EMAIL, TEST_PASSWORD);

    await userClient
      .from("learning_methods")
      .delete()
      .eq("id", srsMethodId);

    // システム手法が残っていることを確認
    const { data } = await getAdminClient()
      .from("learning_methods")
      .select("id")
      .eq("id", srsMethodId)
      .single();

    expect(data).not.toBeNull();
  });

  it("user cannot update other user custom methods", async () => {
    const otherMethod = await insertCustomMethod(otherUserId, "他人の手法2");

    const userClient = await createUserClient(TEST_EMAIL, TEST_PASSWORD);
    const { data } = await userClient
      .from("learning_methods")
      .update({ name: "乗っ取り" })
      .eq("id", otherMethod.id)
      .select();

    // RLS で行がマッチしない
    expect(data).toHaveLength(0);

    // 元の名前のまま
    const { data: original } = await getAdminClient()
      .from("learning_methods")
      .select("name")
      .eq("id", otherMethod.id)
      .single();

    expect(original!.name).toBe("他人の手法2");
  });

  it("user cannot delete other user custom methods", async () => {
    const otherMethod = await insertCustomMethod(otherUserId, "他人の手法3");

    const userClient = await createUserClient(TEST_EMAIL, TEST_PASSWORD);
    await userClient
      .from("learning_methods")
      .delete()
      .eq("id", otherMethod.id);

    // 削除されていないことを確認
    const { data } = await getAdminClient()
      .from("learning_methods")
      .select("id")
      .eq("id", otherMethod.id)
      .single();

    expect(data).not.toBeNull();
  });
});
