import { assert, describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const rpcMock = vi.fn();
const authMock = {
  getUser: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: authMock,
      rpc: rpcMock,
    }),
  ),
}));

// dynamic import to ensure mocks are registered
const { removeMaterialMethod } = await import(
  "@/lib/actions/material-methods"
);

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
  });
});

describe("removeMaterialMethod", () => {
  it("returns auth error when user is not authenticated", async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null } });

    const result = await removeMaterialMethod("mat-1", "method-1");

    assert(!result.success);
    expect(result.error).toBe("認証が必要です");
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
