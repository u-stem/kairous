import { describe, it, expect, vi, beforeEach } from "vitest";

// next/cache をモック（cards.ts 内で revalidatePath が参照される）
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

type ChainMock = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

// SELECT チェーン用のモック。最終的に single() が Promise を返す
function createSelectChain(resolvedValue: { data: unknown; error: unknown }): ChainMock {
  const chain = {} as ChainMock;
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  return chain;
}

type MockClient = {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
};

function buildMockClient(
  user: { id: string } | null,
  cardRow: unknown,
): MockClient {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn().mockImplementation(() =>
      createSelectChain({ data: cardRow, error: cardRow ? null : { message: "not found" } }),
    ),
  };
}

let mockClient: MockClient;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

const OWNER_ID = "user-owner";
const OTHER_USER_ID = "user-other";
const CARD_ID = "card-1";

const cardRow = {
  id: CARD_ID,
  material_id: "mat-1",
  front: "Q",
  back: "A",
  display_order: 1,
  created_at: "2026-01-01T00:00:00Z",
  materials: { user_id: OWNER_ID },
};

describe("getCard", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the card when authenticated and owner matches", async () => {
    mockClient = buildMockClient({ id: OWNER_ID }, cardRow);
    const { getCard } = await import("@/lib/actions/cards");

    const result = await getCard(CARD_ID);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(CARD_ID);
    expect(result?.front).toBe("Q");
    expect(result?.back).toBe("A");
    // materials フィールドは Card 型に含まれないため除外されていること
    expect((result as Record<string, unknown>)["materials"]).toBeUndefined();
  });

  it("returns null when not authenticated", async () => {
    mockClient = buildMockClient(null, cardRow);
    const { getCard } = await import("@/lib/actions/cards");

    const result = await getCard(CARD_ID);

    expect(result).toBeNull();
  });

  it("returns null when card belongs to another user", async () => {
    const otherUserCardRow = {
      ...cardRow,
      materials: { user_id: OTHER_USER_ID },
    };
    mockClient = buildMockClient({ id: OWNER_ID }, otherUserCardRow);
    const { getCard } = await import("@/lib/actions/cards");

    const result = await getCard(CARD_ID);

    expect(result).toBeNull();
  });

  it("returns null when card does not exist", async () => {
    mockClient = buildMockClient({ id: OWNER_ID }, null);
    const { getCard } = await import("@/lib/actions/cards");

    const result = await getCard(CARD_ID);

    expect(result).toBeNull();
  });
});
