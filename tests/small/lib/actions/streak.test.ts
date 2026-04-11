import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// 今日の日付をテスト間で固定し、結果が実行日に依存しないようにする
vi.mock("@/lib/utils/date", () => ({
  toJstDateString: vi.fn().mockReturnValue("2026-04-11"),
}));

let mockSupabase: ReturnType<typeof buildMockSupabase>;

function buildMockSupabase(logs: { log_date: string }[], error: null | { message: string } = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockResolvedValue({ data: error ? null : logs, error });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user" } },
      }),
    },
    from: vi.fn().mockReturnValue(chain),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}));

describe("getStreak", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns zero streak when no logs exist", async () => {
    mockSupabase = buildMockSupabase([]);
    const { getStreak } = await import("@/lib/actions/stats");

    const result = await getStreak();

    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.isActiveToday).toBe(false);
  });

  it("returns correct streak for consecutive logs", async () => {
    // 今日含む3日連続でログがある場合
    mockSupabase = buildMockSupabase([
      { log_date: "2026-04-11" },
      { log_date: "2026-04-10" },
      { log_date: "2026-04-09" },
    ]);
    const { getStreak } = await import("@/lib/actions/stats");

    const result = await getStreak();

    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(3);
    expect(result.isActiveToday).toBe(true);
  });

  it("throws when Supabase returns an error", async () => {
    mockSupabase = buildMockSupabase([], { message: "DB connection failed" });
    const { getStreak } = await import("@/lib/actions/stats");

    await expect(getStreak()).rejects.toThrow("getStreak failed: DB connection failed");
  });
});
