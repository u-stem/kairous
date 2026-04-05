import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

let mockClient: ReturnType<typeof buildMockClient>;

function buildMockClient(overrides: {
  dailyLogs?: { data: unknown[]; error: null };
  subjects?: { data: unknown[]; error: null };
  methods?: { data: unknown[]; error: null };
} = {}) {
  const defaultLogs = { data: [], error: null };
  const defaultSubjects = { data: [], error: null };
  const defaultMethods = { data: [], error: null };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.lt = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockImplementation(() => {
        if (table === "daily_logs") return Promise.resolve(overrides.dailyLogs ?? defaultLogs);
        if (table === "subjects") return Promise.resolve(overrides.subjects ?? defaultSubjects);
        if (table === "learning_methods") return Promise.resolve(overrides.methods ?? defaultMethods);
        return Promise.resolve(defaultLogs);
      });
      return chain;
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("getStats", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns empty stats when no daily_logs exist", async () => {
    mockClient = buildMockClient();
    const { getStats } = await import("@/lib/actions/stats");
    const result = await getStats(7);

    expect(result.summary.totalSec).toBe(0);
    expect(result.summary.sessionCount).toBe(0);
    expect(result.summary.cardsReviewed).toBe(0);
    expect(result.daily).toEqual([]);
    expect(result.bySubject).toEqual([]);
    expect(result.byMethod).toEqual([]);
  });

  it("aggregates daily_logs and computes summary with previous period", async () => {
    mockClient = buildMockClient({
      dailyLogs: {
        data: [
          { log_date: "2026-04-05", total_sec: 3600, session_count: 2, cards_reviewed: 20, subject_id: "s1", method_id: "m1" },
          { log_date: "2026-04-04", total_sec: 1800, session_count: 1, cards_reviewed: 10, subject_id: "s1", method_id: "m1" },
          { log_date: "2026-03-30", total_sec: 900, session_count: 1, cards_reviewed: 5, subject_id: "s1", method_id: "m1" },
        ],
        error: null,
      },
      subjects: {
        data: [{ id: "s1", name: "English" }],
        error: null,
      },
      methods: {
        data: [{ id: "m1", name: "SRS" }],
        error: null,
      },
    });
    const { getStats } = await import("@/lib/actions/stats");
    const result = await getStats(7);

    expect(result.summary.totalSec).toBe(6300);
    expect(result.summary.sessionCount).toBe(4);
    expect(result.summary.cardsReviewed).toBe(35);
    expect(result.bySubject).toHaveLength(1);
    expect(result.bySubject[0].name).toBe("English");
    expect(result.byMethod).toHaveLength(1);
    expect(result.byMethod[0].name).toBe("SRS");
  });

  it("returns empty stats when user is not authenticated", async () => {
    mockClient = buildMockClient();
    mockClient.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: null },
    });
    const { getStats } = await import("@/lib/actions/stats");
    const result = await getStats(7);

    expect(result.summary.totalSec).toBe(0);
    expect(result.daily).toEqual([]);
  });
});
