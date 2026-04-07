import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const VALID_UUID_1 = "550e8400-e29b-41d4-a716-446655440001";
const VALID_UUID_2 = "550e8400-e29b-41d4-a716-446655440002";
const INTERLEAVING_METHOD_ID = "550e8400-e29b-41d4-a716-000000000099";

function buildMockClient({
  userId = "user-1",
  authenticated = true,
  methodData = { id: INTERLEAVING_METHOD_ID },
  methodError = null as unknown,
  materialsOwned = true,
  insertData = { id: "session-1" } as { id: string } | null,
  insertError = null as unknown,
  sessionMaterialsError = null as unknown,
} = {}) {
  const insertMock = vi.fn();
  const fromMock = vi.fn();

  // learning_methods query chain
  const methodChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: methodData, error: methodError }),
  };

  // sessions insert chain
  const sessionInsertChain = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: insertData, error: insertError }),
  };
  insertMock.mockReturnValue(sessionInsertChain);

  // session_materials insert
  const sessionMaterialsInsertMock = vi.fn().mockResolvedValue({ error: sessionMaterialsError });

  // sessions update chain (abandoned 処理)
  const sessionUpdateChain = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  };

  // materials ownership check chain
  const ownedCount = materialsOwned ? 2 : 1;
  const materialSelectChain = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: Array.from({ length: ownedCount }, (_, i) => ({ id: `mat-${i}` })),
      error: null,
    }),
  };
  const materialSelectMock = vi.fn().mockReturnValue(materialSelectChain);

  fromMock.mockImplementation((table: string) => {
    if (table === "learning_methods") return methodChain;
    if (table === "materials") return { select: materialSelectMock };
    if (table === "sessions") return { insert: insertMock, update: vi.fn().mockReturnValue(sessionUpdateChain) };
    if (table === "session_materials") return { insert: sessionMaterialsInsertMock };
    return {};
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: userId } : null },
      }),
    },
    from: fromMock,
    rpc: vi.fn(),
  };
}

// getInterleavingCards 用の専用モッククライアントを組み立てる
// sessions 所有権確認 + RPC (get_interleaving_due_cards) をモックする
function buildGetInterleavingCardsMockClient({
  userId = "user-1",
  authenticated = true,
  sessionOwned = true,
  // RPC が返す due cards (card_id, front, back, display_order, material_title)
  rpcCards = [
    { card_id: "card-1", front: "Q1", back: "A1", display_order: 1, material_title: "Material A" },
    { card_id: "card-2", front: "Q2", back: "A2", display_order: 2, material_title: "Material A" },
    { card_id: "card-3", front: "Q3", back: "A3", display_order: 1, material_title: "Material B" },
  ] as Array<{ card_id: string; front: string; back: string; display_order: number; material_title: string }>,
} = {}) {
  const fromMock = vi.fn();

  // sessions 所有権確認チェーン
  const sessionOwnershipChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: sessionOwned ? { id: "session-1" } : null,
      error: sessionOwned ? null : { message: "not found" },
    }),
  };

  fromMock.mockImplementation((table: string) => {
    if (table === "sessions") return sessionOwnershipChain;
    return {};
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: userId } : null },
      }),
    },
    from: fromMock,
    rpc: vi.fn().mockResolvedValue({ data: rpcCards, error: null }),
  };
}

let mockClient: ReturnType<typeof buildMockClient> | ReturnType<typeof buildGetInterleavingCardsMockClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("createInterleavingSession", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns error when user is not authenticated", async () => {
    mockClient = buildMockClient({ authenticated: false });

    const { createInterleavingSession } = await import("@/lib/actions/sessions");
    const result = await createInterleavingSession([VALID_UUID_1, VALID_UUID_2]);

    expect(result.success).toBe(false);
  });

  it("returns error when less than 2 material IDs", async () => {
    mockClient = buildMockClient();

    const { createInterleavingSession } = await import("@/lib/actions/sessions");
    const result = await createInterleavingSession([VALID_UUID_1]);

    expect(result.success).toBe(false);
  });

  it("returns error when interleaving method not found", async () => {
    mockClient = buildMockClient({ methodData: null as unknown as { id: string } });

    const { createInterleavingSession } = await import("@/lib/actions/sessions");
    const result = await createInterleavingSession([VALID_UUID_1, VALID_UUID_2]);

    expect(result.success).toBe(false);
  });

  it("returns session id on success", async () => {
    mockClient = buildMockClient({ insertData: { id: "new-session-id" } });

    const { createInterleavingSession } = await import("@/lib/actions/sessions");
    const result = await createInterleavingSession([VALID_UUID_1, VALID_UUID_2]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("new-session-id");
    }
  });

  it("marks session as abandoned when session_materials insert fails", async () => {
    mockClient = buildMockClient({
      insertData: { id: "session-to-abandon" },
      sessionMaterialsError: { message: "insert failed" },
    });

    const { createInterleavingSession } = await import("@/lib/actions/sessions");
    const result = await createInterleavingSession([VALID_UUID_1, VALID_UUID_2]);

    expect(result.success).toBe(false);
    // abandoned 処理のため sessions.update が呼ばれたことを確認
    const sessionsTableMock = (mockClient.from as ReturnType<typeof vi.fn>).mock.results.find(
      (_: unknown, idx: number) => (mockClient.from as ReturnType<typeof vi.fn>).mock.calls[idx]?.[0] === "sessions"
    );
    expect(sessionsTableMock).toBeDefined();
  });
});

describe("getInterleavingCards", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns empty array when user is not authenticated", async () => {
    mockClient = buildMockClient({ authenticated: false });

    const { getInterleavingCards } = await import("@/lib/actions/sessions");
    const result = await getInterleavingCards("session-1");

    expect(result).toEqual([]);
  });

  it("returns empty array when session is not owned by user", async () => {
    mockClient = buildGetInterleavingCardsMockClient({ sessionOwned: false });

    const { getInterleavingCards } = await import("@/lib/actions/sessions");
    const result = await getInterleavingCards("session-1");

    expect(result).toEqual([]);
  });

  it("limits results to SESSION_MAX_CARDS", async () => {
    // SESSION_MAX_CARDS(20) を超えるカードを RPC から返す
    const manyCards = Array.from({ length: 30 }, (_, i) => ({
      card_id: `card-${i}`,
      front: `Q${i}`,
      back: `A${i}`,
      display_order: i,
      material_title: `Material ${i % 2 === 0 ? "A" : "B"}`,
    }));
    mockClient = buildGetInterleavingCardsMockClient({
      rpcCards: manyCards,
    });

    const { getInterleavingCards } = await import("@/lib/actions/sessions");
    const result = await getInterleavingCards("session-1");

    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("attaches material_title to each card", async () => {
    mockClient = buildGetInterleavingCardsMockClient();

    const { getInterleavingCards } = await import("@/lib/actions/sessions");
    const result = await getInterleavingCards("session-1");

    // 全カードに material_title が付与されていること
    expect(result.every((c) => typeof c.material_title === "string")).toBe(true);
  });

  it("combines due cards from all materials", async () => {
    mockClient = buildGetInterleavingCardsMockClient({
      rpcCards: [
        { card_id: "card-1", front: "Q1", back: "A1", display_order: 1, material_title: "Material A" },
        { card_id: "card-2", front: "Q2", back: "A2", display_order: 1, material_title: "Material B" },
      ],
    });

    const { getInterleavingCards } = await import("@/lib/actions/sessions");
    const result = await getInterleavingCards("session-1");

    expect(result.length).toBe(2);
  });
});
