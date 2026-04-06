import { describe, it, expect, vi, beforeEach } from "vitest";

// next/cache をモック（revalidatePath が Server Action 内で呼ばれる）
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Supabase クライアントのチェーン呼び出しを再現するヘルパー
function createChainMock(resolvedValue: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  return chain;
}

// from() 呼び出しごとに異なるレスポンスを返すモッククライアントを組み立てる
function buildMockClient(fromResponses: Record<string, { data: unknown; error: unknown }>) {
  const rpcMock = vi.fn().mockImplementation((fnName: string) => {
    if (fnName === "create_card_with_order") return Promise.resolve({ data: "card-new", error: null });
    return Promise.resolve({ data: null, error: null });
  });
  const authMock = {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "user-1" } },
    }),
  };

  const fromMock = vi.fn().mockImplementation((table: string) => {
    const response = fromResponses[table] ?? { data: null, error: null };
    const chain = createChainMock(response);
    // rpc はクライアント直下のメソッドなのでチェーンには不要だが念のため
    return chain;
  });

  return {
    auth: authMock,
    from: fromMock,
    rpc: rpcMock,
  };
}

let mockClient: ReturnType<typeof buildMockClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("createCard atomically increments total_cards", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls rpc('increment_total_cards') with p_delta: 1", async () => {
    mockClient = buildMockClient({
      materials: { data: { id: "mat-1", total_cards: 5 }, error: null },
      cards: { data: { id: "card-new" }, error: null },
      material_methods: { data: [], error: null },
    });

    const { createCard } = await import("@/lib/actions/cards");
    const formData = new FormData();
    formData.set("front", "Question");
    formData.set("back", "Answer");

    const result = await createCard("mat-1", formData);

    expect(result.success).toBe(true);
    expect(mockClient.rpc).toHaveBeenCalledWith("increment_total_cards", {
      p_material_id: "mat-1",
      p_delta: 1,
    });
  });
});

describe("deleteCard atomically decrements total_cards", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls rpc('increment_total_cards') with p_delta: -1", async () => {
    mockClient = buildMockClient({
      cards: {
        data: {
          id: "card-1",
          material_id: "mat-1",
          materials: { user_id: "user-1" },
        },
        error: null,
      },
    });

    const { deleteCard } = await import("@/lib/actions/cards");
    const result = await deleteCard("card-1");

    expect(result.success).toBe(true);
    expect(mockClient.rpc).toHaveBeenCalledWith("increment_total_cards", {
      p_material_id: "mat-1",
      p_delta: -1,
    });
  });
});
