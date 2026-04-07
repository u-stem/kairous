import { describe, it, expect, vi, beforeEach } from "vitest";

// next/cache をモック（revalidatePath が Server Action 内で呼ばれる）
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// requireAuth は未認証時に redirect で throw するためモックが必要
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// RPC 呼び出しのモッククライアントを組み立てる
function buildMockClientWithRpc(rpcResult: { data: unknown; error: unknown }) {
  const rpcMock = vi.fn().mockResolvedValue(rpcResult);
  const authMock = {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "user-1" } },
    }),
  };

  return {
    auth: authMock,
    from: vi.fn(),
    rpc: rpcMock,
  };
}

let mockClient: ReturnType<typeof buildMockClientWithRpc>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("getDueMaterials", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("calls rpc('get_due_materials') with p_user_id and p_today", async () => {
    mockClient = buildMockClientWithRpc({ data: [], error: null });

    const { getDueMaterials } = await import("@/lib/actions/session-queries");
    await getDueMaterials();

    expect(mockClient.rpc).toHaveBeenCalledWith(
      "get_due_materials",
      expect.objectContaining({ p_user_id: "user-1" }),
    );
    // p_today が渡されていることを別途確認
    const rpcArgs = (mockClient.rpc as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { p_user_id: string; p_today: string },
    ];
    expect(typeof rpcArgs[1].p_today).toBe("string");
  });

  it("redirects to /auth/login when user is not authenticated", async () => {
    mockClient = buildMockClientWithRpc({ data: null, error: null });
    (mockClient.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { getDueMaterials } = await import("@/lib/actions/session-queries");

    await expect(getDueMaterials()).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });

  it("returns empty array when rpc returns null", async () => {
    mockClient = buildMockClientWithRpc({ data: null, error: null });

    const { getDueMaterials } = await import("@/lib/actions/session-queries");
    const result = await getDueMaterials();

    expect(result).toEqual([]);
  });

  it("returns empty array when rpc returns empty array", async () => {
    mockClient = buildMockClientWithRpc({ data: [], error: null });

    const { getDueMaterials } = await import("@/lib/actions/session-queries");
    const result = await getDueMaterials();

    expect(result).toEqual([]);
  });

  it("maps rpc rows to DueMaterial array", async () => {
    const rpcRows = [
      {
        material_id: "mat-1",
        title: "英単語",
        subject_id: "sub-1",
        subject_name: "英語",
        subject_color: "#6366f1",
        method_id: "method-srs-uuid",
        method_slug: "srs",
        method_name: "SRS",
        due_count: 5,
      },
      {
        material_id: "mat-2",
        title: "数学問題集",
        subject_id: "sub-2",
        subject_name: "数学",
        subject_color: "#10b981",
        method_id: "method-srs-uuid",
        method_slug: "srs",
        method_name: "SRS",
        due_count: 3,
      },
    ];
    mockClient = buildMockClientWithRpc({ data: rpcRows, error: null });

    const { getDueMaterials } = await import("@/lib/actions/session-queries");
    const result = await getDueMaterials();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "mat-1",
      title: "英単語",
      subject: { id: "sub-1", name: "英語", color: "#6366f1" },
      srs_method_id: "method-srs-uuid",
      due_count: 5,
    });
    expect(result[1]).toEqual({
      id: "mat-2",
      title: "数学問題集",
      subject: { id: "sub-2", name: "数学", color: "#10b981" },
      srs_method_id: "method-srs-uuid",
      due_count: 3,
    });
  });

  it("p_today is in YYYY-MM-DD format", async () => {
    mockClient = buildMockClientWithRpc({ data: [], error: null });

    const { getDueMaterials } = await import("@/lib/actions/session-queries");
    await getDueMaterials();

    const rpcCallArgs = (mockClient.rpc as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { p_user_id: string; p_today: string },
    ];
    expect(rpcCallArgs[1].p_today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns empty array when rpc returns error", async () => {
    mockClient = buildMockClientWithRpc({
      data: null,
      error: { message: "connection refused" },
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getDueMaterials } = await import("@/lib/actions/session-queries");
    const result = await getDueMaterials();

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      "getDueMaterials RPC failed:",
      "connection refused",
    );
    consoleSpy.mockRestore();
  });
});

// Supabase チェーン呼び出しを再現するヘルパー
function createChainMock(resolvedValue: { data: unknown; error: unknown }) {
  const makeChain = (): Record<string, unknown> => {
    const resolved = Promise.resolve(resolvedValue);
    const chain: Record<string, unknown> = {
      select: vi.fn().mockImplementation(() => makeChain()),
      eq: vi.fn().mockImplementation(() => makeChain()),
      single: vi.fn().mockReturnValue(resolved),
      then: resolved.then.bind(resolved),
    };
    return chain;
  };
  return makeChain();
}

describe("getSessionInfo", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects to /auth/login when user is not authenticated", async () => {
    mockClient = buildMockClientWithRpc({ data: null, error: null });
    (mockClient.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { getSessionInfo } = await import("@/lib/actions/session-queries");

    await expect(
      getSessionInfo("a0000000-0000-4000-a000-000000000001"),
    ).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });

  it("returns null when session does not exist", async () => {
    mockClient = {
      ...buildMockClientWithRpc({ data: null, error: null }),
      from: vi.fn().mockReturnValue(createChainMock({ data: null, error: null })),
    };

    const { getSessionInfo } = await import("@/lib/actions/session-queries");
    const result = await getSessionInfo("a0000000-0000-4000-a000-000000000001");

    expect(result).toBeNull();
  });

  it("returns null when learning_methods is null (orphaned session)", async () => {
    mockClient = {
      ...buildMockClientWithRpc({ data: null, error: null }),
      from: vi.fn().mockReturnValue(
        createChainMock({
          data: { id: "s-1", material_id: "mat-1", learning_methods: null },
          error: null,
        }),
      ),
    };

    const { getSessionInfo } = await import("@/lib/actions/session-queries");
    const result = await getSessionInfo("a0000000-0000-4000-a000-000000000001");

    expect(result).toBeNull();
  });

  it("returns SessionInfo with correct methodSlug for a valid session", async () => {
    mockClient = {
      ...buildMockClientWithRpc({ data: null, error: null }),
      from: vi.fn().mockReturnValue(
        createChainMock({
          data: {
            id: "a0000000-0000-4000-a000-000000000001",
            material_id: "mat-1",
            learning_methods: { slug: "srs" },
          },
          error: null,
        }),
      ),
    };

    const { getSessionInfo } = await import("@/lib/actions/session-queries");
    const result = await getSessionInfo("a0000000-0000-4000-a000-000000000001");

    expect(result).toEqual({
      id: "a0000000-0000-4000-a000-000000000001",
      methodSlug: "srs",
      materialId: "mat-1",
    });
  });
});
