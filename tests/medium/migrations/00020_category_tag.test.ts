import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAdminClient, createTestUser, deleteTestUser } from "../../shared/db";

type CategoryRow = { id: string; name: string; color: string; user_id: string; parent_id: string | null };
type MaterialRow = { id: string; title: string; category_id: string; user_id: string };
type TagRow = { id: string; name: string; color: string; user_id: string };

describe("migration 00020: category + tags", () => {
  let userId: string;
  beforeAll(async () => {
    userId = await createTestUser();
  });
  afterAll(async () => {
    await deleteTestUser(userId);
  });

  it("categories テーブルが存在し parent_id を持つ", async () => {
    const db = getAdminClient();
    const parent = await db.from("categories").insert({ user_id: userId, name: "仕事" }).select().single();
    expect(parent.error).toBeNull();
    const parentData = parent.data as CategoryRow;
    const child = await db
      .from("categories")
      .insert({ user_id: userId, name: "Python", parent_id: parentData.id })
      .select()
      .single();
    expect(child.error).toBeNull();
  });

  it("depth > 2 を INSERT すると REJECT される", async () => {
    const db = getAdminClient();
    const lv1 = await db.from("categories").insert({ user_id: userId, name: "A" }).select().single();
    const lv1Data = lv1.data as CategoryRow;
    const lv2 = await db
      .from("categories")
      .insert({ user_id: userId, name: "B", parent_id: lv1Data.id })
      .select()
      .single();
    const lv2Data = lv2.data as CategoryRow;
    const lv3 = await db
      .from("categories")
      .insert({ user_id: userId, name: "C", parent_id: lv2Data.id })
      .select()
      .single();
    expect(lv3.error?.message).toMatch(/depth/i);
  });

  // admin client は service_role で RLS をバイパスする。
  // RLS の実動作検証 (anon/authed client で別ユーザーのデータが見えないこと) は PBI-2 以降の専用テストで担う。
  it("tags が INSERT 可能で color デフォルトが設定される", async () => {
    const db = getAdminClient();
    const tag = await db.from("tags").insert({ user_id: userId, name: "重要" }).select().single();
    expect(tag.error).toBeNull();
    const tagData = tag.data as TagRow;
    expect(tagData.color).toBeTruthy();
  });

  it("materials.category_id に外部キーで紐付く", async () => {
    const db = getAdminClient();
    const cat = await db.from("categories").insert({ user_id: userId, name: "Cat" }).select().single();
    const catData = cat.data as CategoryRow;
    const mat = await db
      .from("materials")
      .insert({ user_id: userId, category_id: catData.id, title: "M1" })
      .select()
      .single();
    expect(mat.error).toBeNull();
    const matData = mat.data as MaterialRow;
    expect(matData.category_id).toBe(catData.id);
  });

  it("自分自身を parent_id に指定できない", async () => {
    const db = getAdminClient();
    const cat = await db.from("categories").insert({ user_id: userId, name: "Self" }).select().single();
    const catData = cat.data as CategoryRow;
    const update = await db
      .from("categories")
      .update({ parent_id: catData.id })
      .eq("id", catData.id);
    expect(update.error?.message).toMatch(/own parent/i);
  });

  it("他ユーザーのカテゴリを親にできない", async () => {
    const db = getAdminClient();
    const otherUser = await createTestUser();
    try {
      const otherCat = await db.from("categories").insert({ user_id: otherUser, name: "Other" }).select().single();
      const otherCatData = otherCat.data as CategoryRow;
      const mine = await db
        .from("categories")
        .insert({ user_id: userId, name: "Mine", parent_id: otherCatData.id })
        .select()
        .single();
      expect(mine.error?.message).toMatch(/different user/i);
    } finally {
      await deleteTestUser(otherUser);
    }
  });
});
