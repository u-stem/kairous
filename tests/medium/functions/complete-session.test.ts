import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminClient, createTestUser, createUserClient, deleteTestUser } from "../setup";
import {
  createTestSubject,
  createTestMaterial,
  createTestCard,
  getSrsMethodId,
  linkMaterialMethod,
  createTestSrsState,
  createTestSession,
  cleanupTestData,
} from "../helpers/db";
import { getMethodIdBySlug } from "../../shared/helpers";

// supabase functions serve が起動中でなければテストをスキップ
let functionsAvailable = false;

const TEST_EMAIL = `test-fn-${Date.now()}@kairous.local`;
const TEST_PASSWORD = "test-password-12345";

let userId: string;
let srsMethodId: string;
// Edge Function は JWT 認証が必要。ユーザーとしてサインインしたクライアントで呼ぶ
let userClient: Awaited<ReturnType<typeof createUserClient>>;

beforeAll(async () => {
  userId = await createTestUser(TEST_EMAIL, TEST_PASSWORD);
  srsMethodId = await getSrsMethodId();

  // functions serve の起動確認
  try {
    const res = await fetch(
      "http://localhost:54321/functions/v1/complete-session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    // fetch が成功した時点でサーバーは起動中。接続不可なら catch に入る
    functionsAvailable = res.status > 0;
  } catch {
    functionsAvailable = false;
  }

  if (functionsAvailable) {
    userClient = await createUserClient(TEST_EMAIL, TEST_PASSWORD);
  }
});

afterAll(async () => {
  await cleanupTestData(userId);
  await deleteTestUser(userId);
});

describe("complete-session Edge Function (DB integration)", () => {
  it.skipIf(!functionsAvailable)(
    "creates card_reviews and new srs_states for new cards",
    async () => {
      const subject = await createTestSubject(userId, "FSRS-new");
      const material = await createTestMaterial(
        subject.id,
        userId,
        "FSRS-new-material",
      );
      await linkMaterialMethod(material.id, srsMethodId);
      const card = await createTestCard(material.id, "FSRS-Q", "FSRS-A", 100);
      const session = await createTestSession(
        userId,
        material.id,
        srsMethodId,
      );

      await getAdminClient()
        .from("sessions")
        .update({ status: "completed", duration_sec: 120 })
        .eq("id", session.id);

      // userClient は JWT 認証済みなので Authorization ヘッダーが自動付与される
      const result = await userClient.functions.invoke<{
        success: boolean;
      }>("complete-session", {
        body: {
          session_id: session.id,
          reviews: [
            {
              card_id: card.id,
              rating: 3,
              started_at: "2026-04-05T10:00:00.000Z",
              answered_at: "2026-04-05T10:00:05.000Z",
            },
          ],
        },
      });

      expect(result.error).toBeNull();

      // card_reviews が INSERT されている
      const { data: reviews } = await getAdminClient()
        .from("card_reviews")
        .select("rating, response_ms")
        .eq("session_id", session.id);

      expect(reviews).toHaveLength(1);
      const review = reviews![0] as { rating: number; response_ms: number };
      expect(review.rating).toBe(3);
      expect(review.response_ms).toBe(5000);

      // srs_states が新規作成されている
      const { data: state } = await getAdminClient()
        .from("srs_states")
        .select("reps, state")
        .eq("card_id", card.id)
        .eq("user_id", userId)
        .single();

      expect(state).not.toBeNull();
      const srsState = state as { reps: number; state: string };
      expect(srsState.reps).toBe(1);
      expect(srsState.state).not.toBe("New");

      // daily_logs が作成されている
      const { data: log } = await getAdminClient()
        .from("daily_logs")
        .select("cards_reviewed, session_count")
        .eq("user_id", userId)
        .eq("method_id", srsMethodId)
        .single();

      expect(log).not.toBeNull();
      const dailyLog = log as {
        cards_reviewed: number;
        session_count: number;
      };
      expect(dailyLog.cards_reviewed).toBe(1);
      expect(dailyLog.session_count).toBe(1);
    },
  );

  it.skipIf(!functionsAvailable)(
    "updates existing srs_states when card already has state",
    async () => {
      const subject = await createTestSubject(userId, "FSRS-existing");
      const material = await createTestMaterial(
        subject.id,
        userId,
        "FSRS-existing-material",
      );
      await linkMaterialMethod(material.id, srsMethodId);
      const card = await createTestCard(
        material.id,
        "FSRS-exist-Q",
        "FSRS-exist-A",
        0,
      );

      // 既存の srs_state を作成 (前回レビュー済みのカード)
      await createTestSrsState(card.id, userId, "2026-04-01", "Review");

      const session = await createTestSession(
        userId,
        material.id,
        srsMethodId,
      );
      await getAdminClient()
        .from("sessions")
        .update({ status: "completed", duration_sec: 60 })
        .eq("id", session.id);

      const result = await userClient.functions.invoke<{
        success: boolean;
      }>("complete-session", {
        body: {
          session_id: session.id,
          reviews: [
            {
              card_id: card.id,
              rating: 1,
              started_at: "2026-04-05T10:00:00.000Z",
              answered_at: "2026-04-05T10:00:08.000Z",
            },
          ],
        },
      });

      expect(result.error).toBeNull();

      // srs_states が UPDATE されている (rating=1 なので Relearning に遷移)
      const { data: state } = await getAdminClient()
        .from("srs_states")
        .select("reps, lapses, state, last_reviewed_at")
        .eq("card_id", card.id)
        .eq("user_id", userId)
        .single();

      expect(state).not.toBeNull();
      const srsState = state as {
        reps: number;
        lapses: number;
        state: string;
        last_reviewed_at: string;
      };
      // Again (1) は lapses を増やす
      expect(srsState.lapses).toBeGreaterThanOrEqual(1);
      expect(srsState.state).toBe("Relearning");
      expect(srsState.last_reviewed_at).not.toBeNull();
    },
  );

  it.skipIf(!functionsAvailable)(
    "inserts card_elaborations when methodSlug is elaboration",
    async () => {
      const elaborationMethodId = await getMethodIdBySlug("elaboration");
      const subject = await createTestSubject(userId, "Elab-insert");
      const material = await createTestMaterial(
        subject.id,
        userId,
        "Elab-insert-material",
      );
      await linkMaterialMethod(material.id, elaborationMethodId);
      const card = await createTestCard(material.id, "Elab-Q", "Elab-A", 100);
      const session = await createTestSession(
        userId,
        material.id,
        elaborationMethodId,
      );

      await getAdminClient()
        .from("sessions")
        .update({ status: "completed", duration_sec: 300 })
        .eq("id", session.id);

      const result = await userClient.functions.invoke<{ success: boolean }>(
        "complete-session",
        {
          body: {
            session_id: session.id,
            reviews: [
              {
                card_id: card.id,
                rating: 3,
                started_at: "2026-04-05T10:00:00.000Z",
                answered_at: "2026-04-05T10:00:10.000Z",
              },
            ],
            elaborations: [
              { card_id: card.id, text: "既知の概念との関連を自分の言葉で説明" },
            ],
          },
        },
      );

      expect(result.error).toBeNull();

      // card_elaborations に行が挿入されている
      const { data: elabs } = await getAdminClient()
        .from("card_elaborations")
        .select("card_id, elaboration_text")
        .eq("session_id", session.id);

      expect(elabs).toHaveLength(1);
      const elab = elabs![0] as { card_id: string; elaboration_text: string };
      expect(elab.card_id).toBe(card.id);
      expect(elab.elaboration_text).toBe("既知の概念との関連を自分の言葉で説明");

      // sessions.meta に elaborations は保存されない (正規化テーブルへ移行済み)
      const { data: sess } = await getAdminClient()
        .from("sessions")
        .select("meta")
        .eq("id", session.id)
        .single();
      const sessRow = sess as { meta: Record<string, unknown> | null };
      expect(sessRow.meta?.elaborations).toBeUndefined();
    },
  );

  it.skipIf(!functionsAvailable)(
    "succeeds with empty elaborations array for elaboration method",
    async () => {
      const elaborationMethodId = await getMethodIdBySlug("elaboration");
      const subject = await createTestSubject(userId, "Elab-empty");
      const material = await createTestMaterial(
        subject.id,
        userId,
        "Elab-empty-material",
      );
      await linkMaterialMethod(material.id, elaborationMethodId);
      const card = await createTestCard(material.id, "Elab-Q2", "Elab-A2", 100);
      const session = await createTestSession(
        userId,
        material.id,
        elaborationMethodId,
      );

      await getAdminClient()
        .from("sessions")
        .update({ status: "completed", duration_sec: 120 })
        .eq("id", session.id);

      const result = await userClient.functions.invoke<{ success: boolean }>(
        "complete-session",
        {
          body: {
            session_id: session.id,
            reviews: [
              {
                card_id: card.id,
                rating: 3,
                started_at: "2026-04-05T10:00:00.000Z",
                answered_at: "2026-04-05T10:00:05.000Z",
              },
            ],
            elaborations: [],
          },
        },
      );

      expect(result.error).toBeNull();

      const { data: elabs } = await getAdminClient()
        .from("card_elaborations")
        .select("id")
        .eq("session_id", session.id);
      expect(elabs ?? []).toHaveLength(0);
    },
  );
});
