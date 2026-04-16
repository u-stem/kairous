import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

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
      upsert: vi.fn().mockImplementation(() => makeChain()),
      delete: vi.fn().mockImplementation(() => makeChain()),
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
  };
}

let mockClient: ReturnType<typeof buildMockClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("getTags", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects to /auth/login when user is not logged in", async () => {
    mockClient = buildMockClient({ user: null });
    const { getTags } = await import("@/lib/actions/tags");
    await expect(getTags()).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });

  it("returns empty array when no tags exist", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: [], error: null },
    });
    const { getTags } = await import("@/lib/actions/tags");
    const result = await getTags();
    expect(result).toEqual([]);
  });

  it("returns tags sorted by name", async () => {
    const tags = [
      { id: "t-1", user_id: "user-1", name: "Python", color: "#94a3b8", created_at: "2024-01-01" },
      { id: "t-2", user_id: "user-1", name: "JavaScript", color: "#f87171", created_at: "2024-01-02" },
    ];
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: tags, error: null },
    });
    const { getTags } = await import("@/lib/actions/tags");
    const result = await getTags();
    expect(result).toHaveLength(2);
  });
});

describe("createTag", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects to /auth/login when user is not logged in", async () => {
    mockClient = buildMockClient({ user: null });
    const { createTag } = await import("@/lib/actions/tags");
    await expect(createTag("Python")).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });

  it("returns validation error when name is empty", async () => {
    mockClient = buildMockClient({ user: { id: "user-1" } });
    const { createTag } = await import("@/lib/actions/tags");
    const result = await createTag("");

    expect(result.success).toBe(false);
  });

  it("returns validation error when name exceeds 50 characters", async () => {
    mockClient = buildMockClient({ user: { id: "user-1" } });
    const { createTag } = await import("@/lib/actions/tags");
    const result = await createTag("a".repeat(51));

    expect(result.success).toBe(false);
  });

  it("returns success with created tag on valid input", async () => {
    const newTag = { id: "t-new", user_id: "user-1", name: "Python", color: "#94a3b8", created_at: "2024-01-01" };
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: newTag, error: null },
    });
    const { createTag } = await import("@/lib/actions/tags");
    const result = await createTag("Python");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Python");
    }
  });

  it("returns duplicate error when tag name already exists (code 23505)", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: null, error: { code: "23505", message: "unique violation" } },
    });
    const { createTag } = await import("@/lib/actions/tags");
    const result = await createTag("Python");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("同名のタグが既に存在します");
    }
  });
});

describe("deleteTag", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects to /auth/login when user is not logged in", async () => {
    mockClient = buildMockClient({ user: null });
    const { deleteTag } = await import("@/lib/actions/tags");
    await expect(deleteTag("t-1")).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });

  it("returns success when tag is deleted", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: null, error: null },
    });
    const { deleteTag } = await import("@/lib/actions/tags");
    const result = await deleteTag("t-1");

    expect(result.success).toBe(true);
  });

  it("returns error when deletion fails", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: null, error: { code: "PGRST204", message: "deletion failed" } },
    });
    const { deleteTag } = await import("@/lib/actions/tags");
    const result = await deleteTag("t-1");

    expect(result.success).toBe(false);
  });
});

describe("addTagToMaterial", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects to /auth/login when user is not logged in", async () => {
    mockClient = buildMockClient({ user: null });
    const { addTagToMaterial } = await import("@/lib/actions/tags");
    await expect(addTagToMaterial("m-1", "t-1")).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });

  it("returns success when tag is added to material", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: null, error: null },
    });
    const { addTagToMaterial } = await import("@/lib/actions/tags");
    const result = await addTagToMaterial("m-1", "t-1");

    expect(result.success).toBe(true);
  });
});

describe("removeTagFromMaterial", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects to /auth/login when user is not logged in", async () => {
    mockClient = buildMockClient({ user: null });
    const { removeTagFromMaterial } = await import("@/lib/actions/tags");
    await expect(removeTagFromMaterial("m-1", "t-1")).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });

  it("returns success when tag is removed from material", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: null, error: null },
    });
    const { removeTagFromMaterial } = await import("@/lib/actions/tags");
    const result = await removeTagFromMaterial("m-1", "t-1");

    expect(result.success).toBe(true);
  });
});
