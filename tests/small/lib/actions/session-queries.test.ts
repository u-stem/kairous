import { describe, it, expect, vi, beforeEach } from "vitest";

// requireAuth は未認証時に redirect で throw するためモックが必要
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// Supabase チェーンモックのヘルパー
function createChainMock(resolvedValue: { data: unknown; error: unknown }) {
  const makeChain = (): Record<string, unknown> => {
    const resolved = Promise.resolve(resolvedValue);
    const chain: Record<string, unknown> = {
      select: vi.fn().mockImplementation(() => makeChain()),
      eq: vi.fn().mockImplementation(() => makeChain()),
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

describe("getSessionElaborations", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns elaborations with card_front from joined cards table", async () => {
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
              card_id: "card-1",
              elaboration_text: "詳細な説明テキスト",
              created_at: "2026-04-11T09:00:00Z",
              cards: { front: "カードの表面" },
            },
          ],
          error: null,
        }),
      ),
    };

    const { getSessionElaborations } = await import("@/lib/actions/session-queries");
    const result = await getSessionElaborations("session-1");

    expect(result).toHaveLength(1);
    expect(result[0].card_id).toBe("card-1");
    expect(result[0].card_front).toBe("カードの表面");
    expect(result[0].elaboration_text).toBe("詳細な説明テキスト");
    expect(result[0].created_at).toBe("2026-04-11T09:00:00Z");
  });

  it("returns empty array when no elaborations exist", async () => {
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

    const { getSessionElaborations } = await import("@/lib/actions/session-queries");
    const result = await getSessionElaborations("session-1");

    expect(result).toEqual([]);
  });

  it("redirects to /auth/login when user is not authenticated", async () => {
    mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
        }),
      },
      from: vi.fn(),
    };

    const { getSessionElaborations } = await import("@/lib/actions/session-queries");

    await expect(getSessionElaborations("session-1")).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login",
    );
  });
});
