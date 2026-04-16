import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAdminClient, createTestUser, deleteTestUser } from "../../shared/db";
import {
  createTestCategory,
  createTestMaterial,
  createTestCard,
  createTestSrsState,
  createTestSession,
  linkMaterialMethod,
  getMethodIdBySlug,
  cleanupTestData,
} from "../../shared/helpers";

type DueCategoryRow = { category_name: string; due_count: number };
type InterleavingCardRow = {
  card_id: string;
  front: string;
  back: string;
  display_order: number;
  material_title: string;
};
type DailyLogRow = {
  total_sec: number;
  cards_reviewed: number;
  session_count: number;
};
type RpcResult<T> = { data: T | null; error: { message: string } | null };

describe("migration 00021: category_tag_rpcs", () => {
  let userId: string;

  beforeAll(async () => {
    userId = await createTestUser();
  });

  afterAll(async () => {
    await cleanupTestData(userId);
    await deleteTestUser(userId);
  });

  // get_due_counts_by_category テスト
  describe("get_due_counts_by_category", () => {
    it("親カテゴリ選択時に子カテゴリの due も集約する", async () => {
      const db = getAdminClient();
      const today = new Date().toISOString().split("T")[0];

      // 親カテゴリを作成
      const parent = await createTestCategory(userId, "RPC-親カテゴリ-due集約");
      // 子カテゴリを作成
      const child = await createTestCategory(userId, "RPC-子カテゴリ-due集約", parent.id);

      // 子カテゴリに属する教材とカードを作成
      const mat = await createTestMaterial(child.id, userId, "RPC-子教材-due集約");
      await createTestCard(mat.id, "表面A", "裏面A", 0);

      // due カードが存在する状態で集計
      const { data, error } = await db.rpc("get_due_counts_by_category", {
        p_user_id: userId,
        p_target_date: today,
      }) as RpcResult<DueCategoryRow[]>;

      expect(error).toBeNull();
      const rows = data ?? [];

      // 子カテゴリの due が親カテゴリ名でロールアップされる
      const parentRow = rows.find((r) => r.category_name === "RPC-親カテゴリ-due集約");
      expect(parentRow).toBeDefined();
      expect(Number(parentRow?.due_count)).toBeGreaterThan(0);
    });

    it("子カテゴリ独自の due も集計される", async () => {
      const db = getAdminClient();
      const today = new Date().toISOString().split("T")[0];

      const child = await createTestCategory(userId, "RPC-単独子-due集約");
      const mat = await createTestMaterial(child.id, userId, "RPC-単独子教材");
      await createTestCard(mat.id, "表面B", "裏面B", 0);

      const { data, error } = await db.rpc("get_due_counts_by_category", {
        p_user_id: userId,
        p_target_date: today,
      }) as RpcResult<DueCategoryRow[]>;

      expect(error).toBeNull();
      const rows = data ?? [];
      // 子カテゴリとして due_date が未来のカードを除外したカテゴリ名がある
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  // get_interleaving_due_cards テスト
  describe("get_interleaving_due_cards", () => {
    let interleavingMethodId: string;
    let sessionId: string;
    let catA: { id: string };
    let catB: { id: string };
    let tagId1: string;
    let tagId2: string;
    let matWithBothTags: { id: string };
    let matWithOneTag: { id: string };

    beforeAll(async () => {
      const db = getAdminClient();
      interleavingMethodId = await getMethodIdBySlug("interleaving");

      // カテゴリ A と B を作成
      catA = await createTestCategory(userId, "RPC-InterleavingCatA");
      catB = await createTestCategory(userId, "RPC-InterleavingCatB");

      // タグ 2 件を作成
      const tag1 = await db
        .from("tags")
        .insert({ user_id: userId, name: "RPC-tag1" })
        .select()
        .single();
      const tag2 = await db
        .from("tags")
        .insert({ user_id: userId, name: "RPC-tag2" })
        .select()
        .single();
      tagId1 = (tag1.data as { id: string }).id;
      tagId2 = (tag2.data as { id: string }).id;

      // catA: タグ1+タグ2 の教材
      matWithBothTags = await createTestMaterial(catA.id, userId, "RPC-両タグ教材");
      await createTestCard(matWithBothTags.id, "両タグ表面", "両タグ裏面", 0);
      await linkMaterialMethod(matWithBothTags.id, interleavingMethodId);
      await db.from("material_tags").insert([
        { material_id: matWithBothTags.id, tag_id: tagId1 },
        { material_id: matWithBothTags.id, tag_id: tagId2 },
      ]);

      // catB: タグ1 のみの教材
      matWithOneTag = await createTestMaterial(catB.id, userId, "RPC-タグ1教材");
      await createTestCard(matWithOneTag.id, "タグ1表面", "タグ1裏面", 0);
      await linkMaterialMethod(matWithOneTag.id, interleavingMethodId);
      await db.from("material_tags").insert({ material_id: matWithOneTag.id, tag_id: tagId1 });

      // Interleaving セッションを作成 (material_id=NULL)
      const session = await db
        .from("sessions")
        .insert({
          user_id: userId,
          material_id: null,
          method_id: interleavingMethodId,
          status: "in_progress",
        })
        .select()
        .single();
      sessionId = (session.data as { id: string }).id;

      // 両教材を session_materials に登録
      await db.from("session_materials").insert([
        { session_id: sessionId, material_id: matWithBothTags.id },
        { session_id: sessionId, material_id: matWithOneTag.id },
      ]);
    });

    it("category_id/tag_ids 両方 NULL で全教材のカードを返す", async () => {
      const db = getAdminClient();
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await db.rpc("get_interleaving_due_cards", {
        p_session_id: sessionId,
        p_user_id: userId,
        p_today: today,
      }) as RpcResult<InterleavingCardRow[]>;

      expect(error).toBeNull();
      const cards = data ?? [];
      expect(cards.length).toBe(2);
    });

    it("category_id で catA に絞り込むと catA の教材カードのみ返す", async () => {
      const db = getAdminClient();
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await db.rpc("get_interleaving_due_cards", {
        p_session_id: sessionId,
        p_user_id: userId,
        p_today: today,
        p_category_id: catA.id,
      }) as RpcResult<InterleavingCardRow[]>;

      expect(error).toBeNull();
      const cards = data ?? [];
      expect(cards.length).toBe(1);
      expect(cards[0].material_title).toBe("RPC-両タグ教材");
    });

    it("tag_ids でタグ1のみ指定すると両方の教材カードを返す", async () => {
      const db = getAdminClient();
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await db.rpc("get_interleaving_due_cards", {
        p_session_id: sessionId,
        p_user_id: userId,
        p_today: today,
        p_tag_ids: [tagId1],
      }) as RpcResult<InterleavingCardRow[]>;

      expect(error).toBeNull();
      const cards = data ?? [];
      expect(cards.length).toBe(2);
    });

    it("tag_ids でタグ1+タグ2 の AND 指定すると両タグ教材のカードのみ返す", async () => {
      const db = getAdminClient();
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await db.rpc("get_interleaving_due_cards", {
        p_session_id: sessionId,
        p_user_id: userId,
        p_today: today,
        p_tag_ids: [tagId1, tagId2],
      }) as RpcResult<InterleavingCardRow[]>;

      expect(error).toBeNull();
      const cards = data ?? [];
      expect(cards.length).toBe(1);
      expect(cards[0].material_title).toBe("RPC-両タグ教材");
    });

    it("category_id + tag_ids 両方指定すると AND 絞り込みになる", async () => {
      const db = getAdminClient();
      const today = new Date().toISOString().split("T")[0];

      // catA + タグ2 → catA に属しかつタグ2 を持つ教材 (matWithBothTags のみ)
      const { data, error } = await db.rpc("get_interleaving_due_cards", {
        p_session_id: sessionId,
        p_user_id: userId,
        p_today: today,
        p_category_id: catA.id,
        p_tag_ids: [tagId2],
      }) as RpcResult<InterleavingCardRow[]>;

      expect(error).toBeNull();
      const cards = data ?? [];
      expect(cards.length).toBe(1);
      expect(cards[0].material_title).toBe("RPC-両タグ教材");
    });
  });

  // upsert_daily_log テスト
  describe("upsert_daily_log", () => {
    it("p_category_id 引数で daily_logs を upsert できる", async () => {
      const db = getAdminClient();
      const srsMethodId = await getMethodIdBySlug("srs");
      const cat = await createTestCategory(userId, "RPC-UpsertLog-カテゴリ");
      const today = new Date().toISOString().split("T")[0];

      const { error } = await db.rpc("upsert_daily_log", {
        p_user_id: userId,
        p_category_id: cat.id,
        p_method_id: srsMethodId,
        p_log_date: today,
        p_duration_sec: 600,
        p_cards_reviewed: 10,
      });

      expect(error).toBeNull();

      const { data: logs } = await db
        .from("daily_logs")
        .select("*")
        .eq("user_id", userId)
        .eq("category_id", cat.id)
        .eq("method_id", srsMethodId) as { data: DailyLogRow[] | null; error: null };

      expect(logs?.length).toBe(1);
      expect(logs?.[0].total_sec).toBe(600);
      expect(logs?.[0].cards_reviewed).toBe(10);
    });

    it("同日同カテゴリ同メソッドの upsert でカウントが累積する", async () => {
      const db = getAdminClient();
      const srsMethodId = await getMethodIdBySlug("srs");
      const cat = await createTestCategory(userId, "RPC-UpsertLog-累積カテゴリ");
      const today = new Date().toISOString().split("T")[0];

      // 1回目
      await db.rpc("upsert_daily_log", {
        p_user_id: userId,
        p_category_id: cat.id,
        p_method_id: srsMethodId,
        p_log_date: today,
        p_duration_sec: 300,
        p_cards_reviewed: 5,
      });

      // 2回目 (同日)
      await db.rpc("upsert_daily_log", {
        p_user_id: userId,
        p_category_id: cat.id,
        p_method_id: srsMethodId,
        p_log_date: today,
        p_duration_sec: 300,
        p_cards_reviewed: 5,
      });

      const { data: logs } = await db
        .from("daily_logs")
        .select("*")
        .eq("user_id", userId)
        .eq("category_id", cat.id)
        .eq("method_id", srsMethodId) as { data: DailyLogRow[] | null; error: null };

      expect(logs?.length).toBe(1);
      expect(logs?.[0].total_sec).toBe(600);
      expect(logs?.[0].cards_reviewed).toBe(10);
      expect(logs?.[0].session_count).toBe(2);
    });

    it("別ユーザーの category_id を指定するとエラーになる", async () => {
      const db = getAdminClient();
      const srsMethodId = await getMethodIdBySlug("srs");

      // 別ユーザーを作成して、そのカテゴリを使用する
      const otherUserId = await createTestUser();
      const otherCat = await createTestCategory(otherUserId, "別ユーザーカテゴリ");
      const today = new Date().toISOString().split("T")[0];

      const { error } = await db.rpc("upsert_daily_log", {
        p_user_id: userId,
        p_category_id: otherCat.id,
        p_method_id: srsMethodId,
        p_log_date: today,
        p_duration_sec: 300,
        p_cards_reviewed: 5,
      });

      // 別ユーザーのカテゴリ指定はエラーになる
      expect(error).not.toBeNull();
      expect(error?.message).toContain("not owned by user");

      // クリーンアップ
      await deleteTestUser(otherUserId);
    });
  });
});
