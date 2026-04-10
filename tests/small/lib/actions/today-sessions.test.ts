import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase チェーンモックのヘルパー
function createChainMock(resolvedValue: { data: unknown; error: unknown }) {
  const makeChain = (): Record<string, unknown> => {
    const resolved = Promise.resolve(resolvedValue);
    const chain: Record<string, unknown> = {
      select: vi.fn().mockImplementation(() => makeChain()),
      eq: vi.fn().mockImplementation(() => makeChain()),
      gte: vi.fn().mockImplementation(() => makeChain()),
      order: vi.fn().mockImplementation(() => makeChain()),
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
};

let mockClient: MockClient;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("getTodaySessions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns today's completed sessions", async () => {
    mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: vi.fn().mockImplementation(() =>
        createChainMock({
          data: [
            {
              id: "s-1",
              duration_sec: 300,
              started_at: "2026-04-10T09:00:00Z",
              learning_methods: { name: "SRS" },
              materials: { title: "Test-Material-A" },
            },
          ],
          error: null,
        }),
      ),
    };

    const { getTodaySessions } = await import("@/lib/actions/session-queries");
    const sessions = await getTodaySessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].methodName).toBe("SRS");
    expect(sessions[0].materialTitle).toBe("Test-Material-A");
    expect(sessions[0].durationSec).toBe(300);
  });

  it("returns empty array when no sessions exist", async () => {
    mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: vi.fn().mockImplementation(() =>
        createChainMock({ data: [], error: null }),
      ),
    };

    const { getTodaySessions } = await import("@/lib/actions/session-queries");
    const sessions = await getTodaySessions();

    expect(sessions).toHaveLength(0);
  });
});
