import { describe, it, expect, vi, beforeEach } from "vitest";

// revalidatePath は Server Action 内で呼ばれるためモック
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// redirect は throw で実装されている
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// Supabase チェーンを再現するヘルパー
function createChainMock(resolvedValue: { data: unknown; error: unknown }) {
  const makeChain = (): Record<string, unknown> => {
    const resolved = Promise.resolve(resolvedValue);
    const chain: Record<string, unknown> = {
      insert: vi.fn().mockImplementation(() => makeChain()),
      select: vi.fn().mockImplementation(() => makeChain()),
      eq: vi.fn().mockImplementation(() => makeChain()),
      order: vi.fn().mockReturnValue(resolved),
      single: vi.fn().mockReturnValue(resolved),
      then: resolved.then.bind(resolved),
    };
    return chain;
  };
  return makeChain();
}

function buildMockClient(options: {
  user: { id: string } | null;
  queryResult?: { data: unknown; error: unknown };
}) {
  const authMock = {
    getUser: vi.fn().mockResolvedValue({
      data: { user: options.user },
    }),
  };
  const queryResult = options.queryResult ?? { data: null, error: null };

  return {
    auth: authMock,
    from: vi.fn().mockReturnValue(createChainMock(queryResult)),
    rpc: vi.fn(),
  };
}

let mockClient: ReturnType<typeof buildMockClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("createCategory", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns validation error when name is empty", async () => {
    mockClient = buildMockClient({ user: { id: "user-1" } });
    const formData = new FormData();
    formData.set("name", "");

    const { createCategory } = await import("@/lib/actions/categories");
    const result = await createCategory(formData);

    expect(result.success).toBe(false);
  });

  it("returns INVALID_INPUT error code when name is empty", async () => {
    mockClient = buildMockClient({ user: { id: "user-1" } });
    const formData = new FormData();
    formData.set("name", "");

    const { createCategory } = await import("@/lib/actions/categories");
    const result = await createCategory(formData);

    const { ACTION_ERRORS } = await import("@/lib/constants");
    expect(result.success === false && result.error).toBe(
      ACTION_ERRORS.INVALID_INPUT,
    );
  });

  it("redirects to /auth/login when user is not logged in", async () => {
    mockClient = buildMockClient({ user: null });
    const formData = new FormData();
    formData.set("name", "英語");

    const { createCategory } = await import("@/lib/actions/categories");

    await expect(createCategory(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login",
    );
  });

  it("returns success true with category data on valid input", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: { id: "cat-1", name: "英語" }, error: null },
    });
    const formData = new FormData();
    formData.set("name", "英語");

    const { createCategory } = await import("@/lib/actions/categories");
    const result = await createCategory(formData);

    expect(result.success).toBe(true);
  });

  it("returns created category id when creation succeeds", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: { id: "cat-1", name: "英語" }, error: null },
    });
    const formData = new FormData();
    formData.set("name", "英語");

    const { createCategory } = await import("@/lib/actions/categories");
    const result = await createCategory(formData);

    expect(result.success === true && result.data.id).toBe("cat-1");
  });

  it("creates child category when parent_id is provided", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: { id: "a0000000-0000-4000-a000-000000000002", name: "Python" }, error: null },
    });
    const formData = new FormData();
    formData.set("name", "Python");
    // parent_id は UUID 形式でなければバリデーションを通過しない
    formData.set("parent_id", "a0000000-0000-4000-a000-000000000001");

    const { createCategory } = await import("@/lib/actions/categories");
    const result = await createCategory(formData);

    expect(result.success === true && result.data.id).toBe("a0000000-0000-4000-a000-000000000002");
  });

  it("returns CREATE_FAILED error when database insert fails", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: {
        data: null,
        error: { message: "duplicate key" },
      },
    });
    const formData = new FormData();
    formData.set("name", "英語");

    const { createCategory } = await import("@/lib/actions/categories");
    const result = await createCategory(formData);

    const { ACTION_ERRORS } = await import("@/lib/constants");
    expect(result.success === false && result.error).toBe(
      ACTION_ERRORS.CREATE_FAILED("カテゴリ"),
    );
  });
});

describe("getCategories", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects to /auth/login when user is not authenticated", async () => {
    mockClient = buildMockClient({ user: null });

    const { getCategories } = await import("@/lib/actions/categories");

    await expect(getCategories()).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });

  it("returns categories array when user is authenticated", async () => {
    const categories = [
      { id: "cat-1", name: "英語", user_id: "user-1", display_order: 0 },
      { id: "cat-2", name: "数学", user_id: "user-1", display_order: 1 },
    ];
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: categories, error: null },
    });

    const { getCategories } = await import("@/lib/actions/categories");
    const result = await getCategories();

    expect(result).toHaveLength(2);
  });

  it("returns first category correctly when user is authenticated", async () => {
    const categories = [
      { id: "cat-1", name: "英語", user_id: "user-1", display_order: 0 },
    ];
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: categories, error: null },
    });

    const { getCategories } = await import("@/lib/actions/categories");
    const result = await getCategories();

    expect(result[0].id).toBe("cat-1");
  });

  it("returns empty array when no categories exist", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: null, error: null },
    });

    const { getCategories } = await import("@/lib/actions/categories");
    const result = await getCategories();

    expect(result).toEqual([]);
  });
});
