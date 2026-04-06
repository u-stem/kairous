import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

function buildMockClient(params: {
  materialsData?: { data: unknown; error: unknown };
  materialMethodsData?: { data: unknown; error: unknown };
  // create_card_with_order RPC の戻り値 (UUID string)
  createCardResult?: { data: unknown; error: unknown };
  // increment_total_cards RPC の戻り値
  incrementResult?: { data: unknown; error: unknown };
}) {
  const {
    materialsData = { data: { id: "mat-1" }, error: null },
    materialMethodsData = { data: [], error: null },
    createCardResult = { data: "card-new-uuid", error: null },
    incrementResult = { data: null, error: null },
  } = params;

  const authMock = {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "user-1" } },
    }),
  };

  const rpcMock = vi.fn().mockImplementation((fnName: string) => {
    if (fnName === "create_card_with_order") return Promise.resolve(createCardResult);
    if (fnName === "increment_total_cards") return Promise.resolve(incrementResult);
    return Promise.resolve({ data: null, error: null });
  });

  function createChain(resolvedValue: { data: unknown; error: unknown }) {
    const c: Record<string, ReturnType<typeof vi.fn>> = {};
    c.select = vi.fn().mockReturnValue(c);
    c.insert = vi.fn().mockReturnValue(c);
    c.eq = vi.fn().mockReturnValue(c);
    c.single = vi.fn().mockResolvedValue(resolvedValue);
    return c;
  }

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === "materials") return createChain(materialsData);
    if (table === "material_methods") return createChain(materialMethodsData);
    return createChain({ data: null, error: null });
  });

  return { auth: authMock, from: fromMock, rpc: rpcMock };
}

let mockClient: ReturnType<typeof buildMockClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("createCard uses create_card_with_order RPC for atomic ordering", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls rpc('create_card_with_order') with material_id, front, back", async () => {
    mockClient = buildMockClient({});

    const { createCard } = await import("@/lib/actions/cards");
    const formData = new FormData();
    formData.set("front", "Question");
    formData.set("back", "Answer");

    const result = await createCard("mat-1", formData);

    expect(result.success).toBe(true);
    expect(mockClient.rpc).toHaveBeenCalledWith("create_card_with_order", {
      p_material_id: "mat-1",
      p_front: "Question",
      p_back: "Answer",
    });
  });

  it("returns error when create_card_with_order RPC fails", async () => {
    mockClient = buildMockClient({
      createCardResult: { data: null, error: { message: "function not found" } },
    });

    const { createCard } = await import("@/lib/actions/cards");
    const formData = new FormData();
    formData.set("front", "Q");
    formData.set("back", "A");

    const result = await createCard("mat-1", formData);

    expect(result.success).toBe(false);
  });

  it("does not call from('cards').insert() directly", async () => {
    mockClient = buildMockClient({});

    const { createCard } = await import("@/lib/actions/cards");
    const formData = new FormData();
    formData.set("front", "Q");
    formData.set("back", "A");

    await createCard("mat-1", formData);

    // cards テーブルへの直接 insert は行わない (RPC に移行済み)
    const cardsFromCalls = mockClient.from.mock.calls.filter(
      (args: unknown[]) => args[0] === "cards",
    );
    expect(cardsFromCalls).toHaveLength(0);
  });
});
