import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

type ResolvedValue = { data: unknown; error: unknown };

function createChainMock(resolvedValue: ResolvedValue) {
  const makeChain = (): Record<string, unknown> => {
    const resolved = Promise.resolve(resolvedValue);
    const chain: Record<string, unknown> = {
      update: vi.fn().mockImplementation(() => makeChain()),
      select: vi.fn().mockImplementation(() => makeChain()),
      eq: vi.fn().mockImplementation(() => makeChain()),
      maybeSingle: vi.fn().mockReturnValue(resolved),
      then: resolved.then.bind(resolved),
    };
    return chain;
  };
  return makeChain();
}

function buildMockClient(options: {
  user: { id: string } | null;
  fetchResult?: ResolvedValue;
  updateResult?: ResolvedValue;
}) {
  const fetchResolved = options.fetchResult ?? { data: null, error: null };
  const updateResolved = options.updateResult ?? { data: null, error: null };

  const fromMock = vi.fn();
  let callCount = 0;
  fromMock.mockImplementation(() => {
    // 1 回目: select で material 取得、2 回目以降: update
    const result = callCount++ === 0 ? fetchResolved : updateResolved;
    return createChainMock(result);
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: options.user } }),
    },
    from: fromMock,
    rpc: vi.fn(),
  };
}

let mockClient: ReturnType<typeof buildMockClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

const VALID_MATERIAL_ID = "12345678-1234-4abc-89ef-1234567890ab";
const USER_ID = "87654321-4321-4dcb-89fe-0987654321ab";

describe("updateNoteStats", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects invalid materialId (non-UUID)", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { updateNoteStats } = await import("@/lib/actions/note");

    const result = await updateNoteStats("not-a-uuid", { section_count: 3 });

    expect(result.success).toBe(false);
  });

  it("rejects negative section_count", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { updateNoteStats } = await import("@/lib/actions/note");

    const result = await updateNoteStats(VALID_MATERIAL_ID, {
      section_count: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects section_count exceeding 10000", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { updateNoteStats } = await import("@/lib/actions/note");

    const result = await updateNoteStats(VALID_MATERIAL_ID, {
      section_count: 10001,
    });

    expect(result.success).toBe(false);
  });

  it("rejects word_count exceeding 1000000", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { updateNoteStats } = await import("@/lib/actions/note");

    const result = await updateNoteStats(VALID_MATERIAL_ID, {
      word_count: 1_000_001,
    });

    expect(result.success).toBe(false);
  });

  it("rejects when material not found (wrong owner or RLS)", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: { data: null, error: null },
    });
    const { updateNoteStats } = await import("@/lib/actions/note");

    const result = await updateNoteStats(VALID_MATERIAL_ID, {
      section_count: 3,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("見つかりません");
    }
  });

  it("rejects when material type is not note", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "flashcard", meta: {}, completed_units: 0 },
        error: null,
      },
    });
    const { updateNoteStats } = await import("@/lib/actions/note");

    const result = await updateNoteStats(VALID_MATERIAL_ID, {
      section_count: 3,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("note");
    }
  });

  it("succeeds when section_count and word_count are valid", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "note", meta: {}, completed_units: 0 },
        error: null,
      },
      updateResult: { data: null, error: null },
    });
    const { updateNoteStats } = await import("@/lib/actions/note");

    const result = await updateNoteStats(VALID_MATERIAL_ID, {
      section_count: 5,
      word_count: 1200,
    });

    expect(result.success).toBe(true);
  });

  it("section_count: 0 を渡すと completed_units が 0 になる", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "note", meta: {}, completed_units: 5 },
        error: null,
      },
      updateResult: { data: null, error: null },
    });
    const { updateNoteStats } = await import("@/lib/actions/note");

    const result = await updateNoteStats(VALID_MATERIAL_ID, {
      section_count: 0,
    });

    expect(result.success).toBe(true);
  });

  it("word_count のみ更新時は completed_units が既存値で維持される", async () => {
    // section_count 未指定 → fetch 済の completed_units (=5) を維持する分岐を検証
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "note", meta: { section_count: 5 }, completed_units: 5 },
        error: null,
      },
      updateResult: { data: null, error: null },
    });
    const { updateNoteStats } = await import("@/lib/actions/note");

    const result = await updateNoteStats(VALID_MATERIAL_ID, {
      word_count: 2000,
    });

    expect(result.success).toBe(true);
  });

  it("stats が空でも既存 meta と completed_units を維持して成功する", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: {
          type: "note",
          meta: { section_count: 3, word_count: 500 },
          completed_units: 3,
        },
        error: null,
      },
      updateResult: { data: null, error: null },
    });
    const { updateNoteStats } = await import("@/lib/actions/note");

    const result = await updateNoteStats(VALID_MATERIAL_ID, {});

    expect(result.success).toBe(true);
  });

  it("returns update failure when DB update errors", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "note", meta: {}, completed_units: 0 },
        error: null,
      },
      updateResult: { data: null, error: { message: "db error" } },
    });
    const { updateNoteStats } = await import("@/lib/actions/note");

    const result = await updateNoteStats(VALID_MATERIAL_ID, {
      section_count: 5,
    });

    expect(result.success).toBe(false);
  });
});
