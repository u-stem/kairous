import { assert, describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// requireAuth は未認証時に redirect で throw するためモックが必要
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const rpcMock = vi.fn();
const authMock = {
  getUser: vi.fn(),
};

const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: authMock,
      rpc: rpcMock,
      from: fromMock,
    }),
  ),
}));

// dynamic import to ensure mocks are registered
const { removeMaterialMethod, getMethods } = await import(
  "@/lib/actions/material-methods"
);

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
  });
});

describe("removeMaterialMethod", () => {
  it("redirects to /auth/login when user is not authenticated", async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null } });

    await expect(removeMaterialMethod("mat-1", "method-1")).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login",
    );
  });

  it("calls remove_material_method RPC with correct parameters", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await removeMaterialMethod("mat-1", "method-1");

    expect(rpcMock).toHaveBeenCalledWith("remove_material_method", {
      p_material_id: "mat-1",
      p_method_id: "method-1",
      p_user_id: "user-1",
    });
  });

  it("returns success when RPC succeeds", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const result = await removeMaterialMethod("mat-1", "method-1");

    expect(result.success).toBe(true);
  });

  it("returns ownership error when material is not owned by user", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "material mat-1 not owned by user user-1" },
    });

    const result = await removeMaterialMethod("mat-1", "method-1");

    assert(!result.success);
    expect(result.error).toBe("教材が見つかりません");
  });

  it("returns minimum method error when only one method remains", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "at least one method required for material mat-1" },
    });

    const result = await removeMaterialMethod("mat-1", "method-1");

    assert(!result.success);
    expect(result.error).toBe("最低1つの学習手法が必要です");
  });

  it("returns not-found error when method is not linked to material", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "method method-1 not found for material mat-1" },
    });

    const result = await removeMaterialMethod("mat-1", "method-1");

    assert(!result.success);
    expect(result.error).toBe("この手法は紐付けされていません");
  });

  it("returns generic error for unexpected RPC failures", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "unexpected database error" },
    });

    const result = await removeMaterialMethod("mat-1", "method-1");

    assert(!result.success);
    expect(result.error).toBe("学習手法の削除に失敗しました");
  });
});

describe("getMethods", () => {
  // getMethods の実装は from().select().order(is_system).order(category) の 2 段 order chain。
  // 2 段目の戻り値を thenable にして Promise として resolve させる擬似 query builder。
  function setupQuery(result: { data: unknown; error: unknown }) {
    const orderSecond = { then: (cb: (v: typeof result) => unknown) => Promise.resolve(cb(result)) };
    const orderFirst = { order: vi.fn().mockReturnValue(orderSecond) };
    const select = { select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue(orderFirst) }) };
    fromMock.mockReturnValue(select);
  }

  it("returns the method list when the query succeeds", async () => {
    const methods = [{ id: "m1", slug: "srs", name: "SRS" }];
    setupQuery({ data: methods, error: null });

    const result = await getMethods();

    expect(result).toEqual(methods);
  });

  it("throws when the query returns an error so the caller can surface it", async () => {
    setupQuery({ data: null, error: { message: "connection refused" } });

    await expect(getMethods()).rejects.toThrow(/学習手法の取得に失敗しました/);
  });

  it("returns empty array when no methods exist", async () => {
    setupQuery({ data: [], error: null });

    const result = await getMethods();

    expect(result).toEqual([]);
  });
});
