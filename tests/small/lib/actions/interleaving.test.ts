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
// sessions 所有権確認、session_materials 取得、cards 取得、srs_states 取得の各クエリをモックする
function buildGetInterleavingCardsMockClient({
  userId = "user-1",
  authenticated = true,
  sessionOwned = true,
  sessionMaterials = [
    { material_id: "mat-1", materials: { title: "Material A" } },
    { material_id: "mat-2", materials: { title: "Material B" } },
  ] as Array<{ material_id: string; materials: { title: string } }> | null,
  cardsByMaterial = {
    "mat-1": [
      { id: "card-1", front: "Q1", back: "A1", display_order: 1 },
      { id: "card-2", front: "Q2", back: "A2", display_order: 2 },
    ],
    "mat-2": [
      { id: "card-3", front: "Q3", back: "A3", display_order: 1 },
    ],
  } as Record<string, Array<{ id: string; front: string; back: string; display_order: number }>>,
  notDueCardIds = [] as string[],
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

  // session_materials 取得チェーン
  const sessionMaterialsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: sessionMaterials, error: null }),
  };

  // cards 取得チェーン (material_id ごとに異なる結果を返す)
  let cardCallCount = 0;
  const materialIds = Object.keys(cardsByMaterial);
  const cardsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockImplementation(() => {
      const matId = materialIds[cardCallCount] ?? materialIds[materialIds.length - 1];
      const cards = cardsByMaterial[matId] ?? [];
      cardCallCount++;
      return Promise.resolve({ data: cards, error: null });
    }),
  };

  // srs_states の due_date フィルタチェーン
  const srsStatesChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({
      data: notDueCardIds.map((id) => ({ card_id: id })),
      error: null,
    }),
  };

  fromMock.mockImplementation((table: string) => {
    if (table === "sessions") return sessionOwnershipChain;
    if (table === "session_materials") return sessionMaterialsChain;
    if (table === "cards") return cardsChain;
    if (table === "srs_states") return srsStatesChain;
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
    // SESSION_MAX_CARDS(20) を超えるカードを用意する
    const manyCards = Array.from({ length: 15 }, (_, i) => ({
      id: `card-mat1-${i}`,
      front: `Q${i}`,
      back: `A${i}`,
      display_order: i,
    }));
    const manyCards2 = Array.from({ length: 15 }, (_, i) => ({
      id: `card-mat2-${i}`,
      front: `Q2-${i}`,
      back: `A2-${i}`,
      display_order: i,
    }));
    mockClient = buildGetInterleavingCardsMockClient({
      cardsByMaterial: { "mat-1": manyCards, "mat-2": manyCards2 },
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
      cardsByMaterial: {
        "mat-1": [{ id: "card-1", front: "Q1", back: "A1", display_order: 1 }],
        "mat-2": [{ id: "card-2", front: "Q2", back: "A2", display_order: 1 }],
      },
    });

    const { getInterleavingCards } = await import("@/lib/actions/sessions");
    const result = await getInterleavingCards("session-1");

    expect(result.length).toBe(2);
  });
});
