import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Supabase クライアントのチェーン呼び出しを再現するヘルパー
function createChainMock(resolvedValue: { data: unknown; error: unknown }) {
  const makeChain = (): Record<string, unknown> => {
    const resolved = Promise.resolve(resolvedValue);
    const chain: Record<string, unknown> = {
      select: vi.fn().mockImplementation(() => makeChain()),
      insert: vi.fn().mockImplementation(() => makeChain()),
      update: vi.fn().mockImplementation(() => makeChain()),
      eq: vi.fn().mockImplementation(() => makeChain()),
      single: vi.fn().mockReturnValue(resolved),
      rpc: vi.fn().mockReturnValue(resolved),
      then: resolved.then.bind(resolved),
    };
    return chain;
  };
  return makeChain();
}

type MockClient = {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  functions: { invoke: ReturnType<typeof vi.fn> };
};

let mockClient: MockClient;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

const VALID_SESSION_ID = "a0000000-0000-4000-a000-000000000001";

describe("completeFreeStudySession", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("completes session with null self_rating", async () => {
    let fromCallCount = 0;
    const updateMock = vi.fn();
    mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: vi.fn().mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          // session SELECT (所有者・status・method確認)
          return createChainMock({
            data: {
              id: "s-1",
              started_at: "2026-04-05T10:00:00Z",
              status: "in_progress",
              material_id: "mat-1",
              method_id: "method-1",
              learning_methods: { slug: "free_study" },
            },
            error: null,
          });
        }
        if (fromCallCount === 2) {
          // session UPDATE → 成功
          const chain = createChainMock({ data: null, error: null });
          const originalUpdate = chain.update as (...args: unknown[]) => unknown;
          chain.update = vi.fn().mockImplementation((...args: unknown[]) => {
            updateMock(...args);
            return originalUpdate(...args);
          });
          return chain;
        }
        // material SELECT (daily_log 用)
        return createChainMock({
          data: { category_id: "subj-1" },
          error: null,
        });
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      functions: { invoke: vi.fn() },
    };

    const { completeFreeStudySession } = await import("@/lib/actions/session-commands");
    const result = await completeFreeStudySession(VALID_SESSION_ID, 120);

    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ self_rating: null }),
    );
  });

  it("rejects non-free_study method sessions", async () => {
    mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: vi.fn().mockImplementation(() => {
        return createChainMock({
          data: {
            id: "s-1",
            started_at: "2026-04-05T10:00:00Z",
            status: "in_progress",
            material_id: "mat-1",
            method_id: "method-1",
            learning_methods: { slug: "pomodoro" },
          },
          error: null,
        });
      }),
      rpc: vi.fn(),
      functions: { invoke: vi.fn() },
    };

    const { completeFreeStudySession } = await import("@/lib/actions/session-commands");
    const result = await completeFreeStudySession(VALID_SESSION_ID, 120);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("自由学習セッションではありません");
    }
  });

  it("upserts daily_log on completion", async () => {
    let fromCallCount = 0;
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
    mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: vi.fn().mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          return createChainMock({
            data: {
              id: "s-1",
              started_at: "2026-04-05T10:00:00Z",
              status: "in_progress",
              material_id: "mat-1",
              method_id: "method-1",
              learning_methods: { slug: "free_study" },
            },
            error: null,
          });
        }
        if (fromCallCount === 2) {
          return createChainMock({ data: null, error: null });
        }
        return createChainMock({
          data: { category_id: "subj-1" },
          error: null,
        });
      }),
      rpc: rpcMock,
      functions: { invoke: vi.fn() },
    };

    const { completeFreeStudySession } = await import("@/lib/actions/session-commands");
    await completeFreeStudySession(VALID_SESSION_ID, 120);

    expect(rpcMock).toHaveBeenCalledWith(
      "upsert_daily_log",
      expect.objectContaining({
        p_user_id: "user-1",
        p_subject_id: "subj-1",
        p_method_id: "method-1",
        p_cards_reviewed: 0,
      }),
    );
  });
});
