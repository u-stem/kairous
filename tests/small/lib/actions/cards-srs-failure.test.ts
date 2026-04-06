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
      eq: vi.fn().mockImplementation(() => makeChain()),
      single: vi.fn().mockReturnValue(resolved),
      then: resolved.then.bind(resolved),
    };
    return chain;
  };
  return makeChain();
}

let mockClient: {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("createCard when srs_states INSERT fails (B4)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns success: false and logs error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "materials") {
          return createChainMock({ data: { id: "mat-1" }, error: null });
        }
        if (table === "material_methods") {
          return createChainMock({
            data: [
              {
                learning_methods: {
                  slug: "srs",
                  default_config: null,
                },
              },
            ],
            error: null,
          });
        }
        if (table === "srs_states") {
          return createChainMock({
            data: null,
            error: { message: "unique constraint violation" },
          });
        }
        return createChainMock({ data: null, error: null });
      }),
      rpc: vi.fn()
        .mockResolvedValueOnce({ data: "card-1", error: null })
        .mockResolvedValueOnce({ data: null, error: null }),
    };

    const { createCard } = await import("@/lib/actions/cards");
    const formData = new FormData();
    formData.set("front", "Question");
    formData.set("back", "Answer");

    const result = await createCard("mat-1", formData);

    expect(result.success).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("srs_states insert failed"),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });
});
