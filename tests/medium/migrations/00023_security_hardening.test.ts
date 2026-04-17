import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getAdminClient,
  createTestUser,
  createUserClient,
  deleteTestUser,
} from "../setup";
import {
  createTestSubject,
  createTestMaterial,
  createTestCard,
  createTestSession,
  cleanupTestData,
} from "../helpers/db";
import { getMethodIdBySlug } from "../../shared/helpers";

type SupabaseLikeRpc = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

// Epic #288 PBI-1: Security High 指摘 (S2, S3) の検証
describe("migration 00023: security hardening", () => {
  const TEST_EMAIL = `security-00023-${Date.now()}@kairous.local`;
  const TEST_PASSWORD = "test-password-12345";
  let userId: string;
  let userClient: Awaited<ReturnType<typeof createUserClient>>;

  beforeAll(async () => {
    userId = await createTestUser(TEST_EMAIL, TEST_PASSWORD);
    userClient = await createUserClient(TEST_EMAIL, TEST_PASSWORD);
  });

  afterAll(async () => {
    await cleanupTestData(userId);
    await deleteTestUser(userId);
  });

  describe("S2: batch_upsert_srs_states DROP", () => {
    it("関数が PostgREST スキーマから消えている", async () => {
      // DROP 済みの関数を呼ぶと PostgREST は PGRST202 (function not found in schema cache) を返す
      const adminClient = getAdminClient() as unknown as SupabaseLikeRpc;
      const { data, error } = await adminClient.rpc("batch_upsert_srs_states", { p_states: [] });
      expect(error).not.toBeNull();
      // コードで検証する。メッセージ文字列は Supabase のバージョンで変わりうる
      expect(error?.code).toBe("PGRST202");
      expect(data).toBeNull();
    });
  });

  describe("S3: card_elaborations の UPDATE/DELETE 拒否", () => {
    it("認証ユーザーによる UPDATE は 0 行更新 (RLS で暗黙拒否)", async () => {
      // テスト用 elaboration を service_role で事前作成
      const subject = await createTestSubject(userId, "S3-test");
      const material = await createTestMaterial(subject.id, userId, "S3-test-material");
      const elaborationMethodId = await getMethodIdBySlug("elaboration");
      const card = await createTestCard(material.id, "S3-Q", "S3-A", 100);
      const session = await createTestSession(userId, material.id, elaborationMethodId);

      const insertResult = await getAdminClient()
        .from("card_elaborations")
        .insert({
          user_id: userId,
          session_id: session.id,
          card_id: card.id,
          elaboration_text: "original text",
        })
        .select("id")
        .single();
      expect(insertResult.error).toBeNull();
      const elaborationId = (insertResult.data as { id: string }).id;

      // 認証ユーザーからの UPDATE は RLS で拒否されて 0 行更新になる
      const updateResult = await userClient
        .from("card_elaborations")
        .update({ elaboration_text: "tampered text" })
        .eq("id", elaborationId)
        .select();
      expect(updateResult.error).toBeNull();
      expect(updateResult.data ?? []).toHaveLength(0);

      // DB 上の値は元のまま
      const verifyResult = await getAdminClient()
        .from("card_elaborations")
        .select("elaboration_text")
        .eq("id", elaborationId)
        .single();
      expect((verifyResult.data as { elaboration_text: string }).elaboration_text).toBe(
        "original text",
      );
    });

    it("認証ユーザーによる DELETE は 0 行削除 (RLS で暗黙拒否)", async () => {
      const subject = await createTestSubject(userId, "S3-delete");
      const material = await createTestMaterial(subject.id, userId, "S3-delete-material");
      const elaborationMethodId = await getMethodIdBySlug("elaboration");
      const card = await createTestCard(material.id, "S3-DQ", "S3-DA", 100);
      const session = await createTestSession(userId, material.id, elaborationMethodId);

      const insertResult = await getAdminClient()
        .from("card_elaborations")
        .insert({
          user_id: userId,
          session_id: session.id,
          card_id: card.id,
          elaboration_text: "persistent text",
        })
        .select("id")
        .single();
      expect(insertResult.error).toBeNull();
      const elaborationId = (insertResult.data as { id: string }).id;

      const deleteResult = await userClient
        .from("card_elaborations")
        .delete()
        .eq("id", elaborationId)
        .select();
      expect(deleteResult.error).toBeNull();
      expect(deleteResult.data ?? []).toHaveLength(0);

      // 行はまだ存在する
      const verifyResult = await getAdminClient()
        .from("card_elaborations")
        .select("id")
        .eq("id", elaborationId)
        .single();
      expect(verifyResult.error).toBeNull();
      expect(verifyResult.data).not.toBeNull();
    });

    it("SELECT は従来通り自身の elaboration を参照できる (既存ポリシーへの regress がない)", async () => {
      const subject = await createTestSubject(userId, "S3-select");
      const material = await createTestMaterial(subject.id, userId, "S3-select-material");
      const elaborationMethodId = await getMethodIdBySlug("elaboration");
      const card = await createTestCard(material.id, "S3-SQ", "S3-SA", 100);
      const session = await createTestSession(userId, material.id, elaborationMethodId);

      await getAdminClient().from("card_elaborations").insert({
        user_id: userId,
        session_id: session.id,
        card_id: card.id,
        elaboration_text: "readable text",
      });

      const result = await userClient
        .from("card_elaborations")
        .select("elaboration_text")
        .eq("session_id", session.id);
      expect(result.error).toBeNull();
      expect(result.data ?? []).toHaveLength(1);
    });
  });
});
