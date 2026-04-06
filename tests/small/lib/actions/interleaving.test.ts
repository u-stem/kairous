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
    if (table === "sessions") return { insert: insertMock };
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

let mockClient: ReturnType<typeof buildMockClient>;

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
});
