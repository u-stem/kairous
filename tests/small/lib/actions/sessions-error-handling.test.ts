import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Supabase クライアントのチェーン呼び出しを再現するヘルパー
// .single() なしでも await 可能 (update().eq() パターン)
function createChainMock(resolvedValue: { data: unknown; error: unknown }) {
  const makeChain = (): Record<string, unknown> => {
    const resolved = Promise.resolve(resolvedValue);
    const chain: Record<string, unknown> = {
      select: vi.fn().mockImplementation(() => makeChain()),
      insert: vi.fn().mockImplementation(() => makeChain()),
      update: vi.fn().mockImplementation(() => makeChain()),
      eq: vi.fn().mockImplementation(() => makeChain()),
      gt: vi.fn().mockImplementation(() => makeChain()),
      in: vi.fn().mockImplementation(() => makeChain()),
      single: vi.fn().mockReturnValue(resolved),
      then: resolved.then.bind(resolved),
    };
    return chain;
  };
  return makeChain();
}

type MockClient = {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
  functions: { invoke: ReturnType<typeof vi.fn> };
};

let mockClient: MockClient;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("completeSession compensation error logging (B3)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("logs compensation failure and returns error to user", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let fromCallCount = 0;
    mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: vi.fn().mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          // session SELECT (所有者・status確認)
          return createChainMock({
            data: { id: "s-1", started_at: "2026-04-05T10:00:00Z", status: "in_progress" },
            error: null,
          });
        }
        if (fromCallCount === 2) {
          // session UPDATE (completed) → 成功
          return createChainMock({ data: null, error: null });
        }
        // session UPDATE (compensation) → 失敗
        return createChainMock({
          data: null,
          error: { message: "connection refused" },
        });
      }),
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Edge Function timeout" },
        }),
      },
    };

    const { completeSession } = await import("@/lib/actions/sessions");
    const result = await completeSession(
      "a0000000-0000-4000-a000-000000000001",
      [
        {
          card_id: "b0000000-0000-4000-b000-000000000001",
          rating: 3,
          started_at: "2026-04-05T10:00:00.000Z",
          answered_at: "2026-04-05T10:00:05.000Z",
        },
      ],
      3,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("カードレビューの処理に失敗しました");
    }
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("compensation failed"),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });
});

describe("getSession card_reviews ownership filter (S3)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("queries card_reviews with sessions.user_id filter", async () => {
    const selectSpy = vi.fn();
    const eqSpy = vi.fn();

    // card_reviews 用のチェーンで select/eq の引数をキャプチャする
    const reviewsResolved = Promise.resolve({ data: [], error: null });
    const reviewsChain: Record<string, unknown> = {};
    reviewsChain.select = selectSpy.mockReturnValue(reviewsChain);
    reviewsChain.eq = eqSpy.mockReturnValue(reviewsChain);
    reviewsChain.then = reviewsResolved.then.bind(reviewsResolved);

    mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "sessions") {
          return createChainMock({
            data: {
              id: "s-1",
              method_id: "m-1",
              status: "completed",
              duration_sec: 120,
              self_rating: 3,
              started_at: "2026-04-05T10:00:00Z",
              ended_at: "2026-04-05T10:02:00Z",
              materials: null,
              learning_methods: { slug: "srs", name: "SRS" },
            },
            error: null,
          });
        }
        if (table === "card_reviews") {
          return reviewsChain;
        }
        return createChainMock({ data: [], error: null });
      }),
      functions: { invoke: vi.fn() },
    } as unknown as MockClient;

    const { getSession } = await import("@/lib/actions/sessions");
    await getSession("a0000000-0000-4000-a000-000000000001");

    // card_reviews の select に sessions!inner が含まれている
    expect(selectSpy).toHaveBeenCalledWith(
      expect.stringContaining("sessions!inner"),
    );
    // sessions.user_id でフィルタされている
    expect(eqSpy).toHaveBeenCalledWith("sessions.user_id", "user-1");
  });
});

describe("completeRestSession validation schema (S7)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects invalid session ID with Japanese error message", async () => {
    mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: vi.fn(),
      functions: { invoke: vi.fn() },
    };

    const { completeRestSession } = await import("@/lib/actions/sessions");
    const result = await completeRestSession("not-a-uuid");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("入力内容を確認してください");
    }
  });
});
