import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createTestUser, deleteTestUser } from "../setup";
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

// supabase functions serve が起動中でなければテストをスキップ
let functionsAvailable = false;

let userId: string;
let srsMethodId: string;

beforeAll(async () => {
  userId = await createTestUser();
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
    functionsAvailable = res.status !== 0;
  } catch {
    functionsAvailable = false;
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

      await adminClient
        .from("sessions")
        .update({ status: "completed", duration_sec: 120 })
        .eq("id", session.id);

      const result = await adminClient.functions.invoke<{
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
      const { data: reviews } = await adminClient
        .from("card_reviews")
        .select("rating, response_ms")
        .eq("session_id", session.id);

      expect(reviews).toHaveLength(1);
      const review = reviews![0] as { rating: number; response_ms: number };
      expect(review.rating).toBe(3);
      expect(review.response_ms).toBe(5000);

      // srs_states が新規作成されている
      const { data: state } = await adminClient
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
      const { data: log } = await adminClient
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
      await adminClient
        .from("sessions")
        .update({ status: "completed", duration_sec: 60 })
        .eq("id", session.id);

      const result = await adminClient.functions.invoke<{
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
      const { data: state } = await adminClient
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
});
