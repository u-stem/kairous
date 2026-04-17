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

describe("updatePageProgress", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects non-integer pagesRead", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { updatePageProgress } = await import("@/lib/actions/reading");

    const result = await updatePageProgress(VALID_MATERIAL_ID, 3.5);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.pagesRead).toBeDefined();
    }
  });

  it("rejects negative pagesRead", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { updatePageProgress } = await import("@/lib/actions/reading");

    const result = await updatePageProgress(VALID_MATERIAL_ID, -1);

    expect(result.success).toBe(false);
  });

  it("rejects invalid materialId (non-UUID)", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { updatePageProgress } = await import("@/lib/actions/reading");

    const result = await updatePageProgress("not-a-uuid", 10);

    expect(result.success).toBe(false);
  });

  it("rejects when material not found (RLS or wrong owner)", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: { data: null, error: null },
    });
    const { updatePageProgress } = await import("@/lib/actions/reading");

    const result = await updatePageProgress(VALID_MATERIAL_ID, 10);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("見つかりません");
    }
  });

  it("rejects when material type is not reading", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "flashcard", total_units: 10, meta: {} },
        error: null,
      },
    });
    const { updatePageProgress } = await import("@/lib/actions/reading");

    const result = await updatePageProgress(VALID_MATERIAL_ID, 10);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("reading");
    }
  });

  it("rejects when pagesRead exceeds meta.total_pages", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "reading", total_units: 0, meta: { total_pages: 300 } },
        error: null,
      },
    });
    const { updatePageProgress } = await import("@/lib/actions/reading");

    const result = await updatePageProgress(VALID_MATERIAL_ID, 350);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("300");
    }
  });

  it("succeeds when pagesRead is within total_pages", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "reading", total_units: 0, meta: { total_pages: 300 } },
        error: null,
      },
      updateResult: { data: null, error: null },
    });
    const { updatePageProgress } = await import("@/lib/actions/reading");

    const result = await updatePageProgress(VALID_MATERIAL_ID, 50);

    expect(result.success).toBe(true);
  });

  it("succeeds when total_pages is not set (no upper bound check)", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "reading", total_units: 0, meta: {} },
        error: null,
      },
      updateResult: { data: null, error: null },
    });
    const { updatePageProgress } = await import("@/lib/actions/reading");

    const result = await updatePageProgress(VALID_MATERIAL_ID, 9999);

    expect(result.success).toBe(true);
  });

  it("returns update failure when DB update errors", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "reading", total_units: 0, meta: { total_pages: 300 } },
        error: null,
      },
      updateResult: { data: null, error: { message: "db error" } },
    });
    const { updatePageProgress } = await import("@/lib/actions/reading");

    const result = await updatePageProgress(VALID_MATERIAL_ID, 50);

    expect(result.success).toBe(false);
  });
});
