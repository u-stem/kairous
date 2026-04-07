import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

function buildMockClient(options?: {
  user?: { id: string } | null;
}) {
  const user = options?.user !== undefined ? options.user : { id: "user-1" };
  const authMock = {
    getUser: vi.fn().mockResolvedValue({
      data: { user },
    }),
  };

  // チェーン呼び出しを再現するヘルパー
  const makeChain = (resolvedValue?: {
    data: unknown;
    error: unknown;
  }): Record<string, unknown> => {
    const resolved = Promise.resolve(
      resolvedValue ?? { data: null, error: null },
    );
    const chain: Record<string, unknown> = {
      select: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
      insert: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
      update: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
      delete: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
      eq: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
      single: vi.fn().mockReturnValue(resolved),
      order: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
      ilike: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
      lte: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
      in: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
      limit: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
      then: resolved.then.bind(resolved),
    };
    return chain;
  };

  return {
    auth: authMock,
    from: vi.fn().mockReturnValue(makeChain()),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

let mockClient: ReturnType<typeof buildMockClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("createMaterial", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns validation error when title is empty", async () => {
    mockClient = buildMockClient();
    const { createMaterial } = await import("@/lib/actions/materials");

    const formData = new FormData();
    formData.set("title", "");
    formData.set("subject_id", "sub-1");
    formData.set("method_ids", JSON.stringify(["method-1"]));

    const result = await createMaterial(formData);

    expect(result.success).toBe(false);
  });

  it("returns INVALID_INPUT error constant when title is empty", async () => {
    mockClient = buildMockClient();
    const [{ createMaterial }, { ACTION_ERRORS }] = await Promise.all([
      import("@/lib/actions/materials"),
      import("@/lib/constants"),
    ]);

    const formData = new FormData();
    formData.set("title", "");
    formData.set("subject_id", "sub-1");
    formData.set("method_ids", JSON.stringify(["method-1"]));

    const result = await createMaterial(formData);

    expect(result).toMatchObject({
      success: false,
      error: ACTION_ERRORS.INVALID_INPUT,
    });
  });

  it("returns UNAUTHENTICATED error when user is not authenticated", async () => {
    mockClient = buildMockClient({ user: null });
    const [{ createMaterial }, { ACTION_ERRORS }] = await Promise.all([
      import("@/lib/actions/materials"),
      import("@/lib/constants"),
    ]);

    const formData = new FormData();
    formData.set("title", "英単語帳");
    // バリデーションを通過させて auth チェックに到達させるため UUID を渡す
    formData.set("subject_id", "a0000000-0000-4000-a000-000000000001");
    formData.set(
      "method_ids",
      JSON.stringify(["b0000000-0000-4000-b000-000000000001"]),
    );

    const result = await createMaterial(formData);

    expect(result).toEqual({
      success: false,
      error: ACTION_ERRORS.UNAUTHENTICATED,
    });
  });
});

describe("getMaterials", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects to /auth/login when not authenticated", async () => {
    mockClient = buildMockClient({ user: null });
    const { getMaterials } = await import("@/lib/actions/materials");

    await expect(getMaterials()).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login",
    );
  });

  it("throws when Supabase query returns an error", async () => {
    mockClient = buildMockClient();
    const makeErrorChain = (
      resolvedValue?: { data: unknown; error: unknown },
    ): Record<string, unknown> => {
      const resolved = Promise.resolve(
        resolvedValue ?? { data: null, error: null },
      );
      const chain: Record<string, unknown> = {
        select: vi.fn().mockImplementation(() => makeErrorChain(resolvedValue)),
        eq: vi.fn().mockImplementation(() => makeErrorChain(resolvedValue)),
        order: vi.fn().mockImplementation(() =>
          makeErrorChain(resolvedValue),
        ),
        then: resolved.then.bind(resolved),
      };
      return chain;
    };

    mockClient = {
      ...buildMockClient(),
      from: vi.fn().mockReturnValue(
        makeErrorChain({ data: null, error: { message: "DB error" } }),
      ),
    };

    const { getMaterials } = await import("@/lib/actions/materials");

    await expect(getMaterials()).rejects.toThrow("getMaterials failed: DB error");
  });
});

describe("getMaterial", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects to /auth/login when not authenticated", async () => {
    mockClient = buildMockClient({ user: null });
    const { getMaterial } = await import("@/lib/actions/materials");

    await expect(getMaterial("mat-1")).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login",
    );
  });

  it("returns null when material is not found", async () => {
    // getMaterial の .single() が data: null を返すチェーンを組み立てる
    const makeChain = (
      resolvedValue?: { data: unknown; error: unknown },
    ): Record<string, unknown> => {
      const resolved = Promise.resolve(
        resolvedValue ?? { data: null, error: null },
      );
      const chain: Record<string, unknown> = {
        select: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
        insert: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
        update: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
        delete: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
        eq: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
        single: vi.fn().mockReturnValue(resolved),
        order: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
        ilike: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
        lte: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
        in: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
        limit: vi.fn().mockImplementation(() => makeChain(resolvedValue)),
        then: resolved.then.bind(resolved),
      };
      return chain;
    };

    mockClient = {
      ...buildMockClient(),
      from: vi.fn().mockReturnValue(makeChain({ data: null, error: null })),
    };

    const { getMaterial } = await import("@/lib/actions/materials");
    const result = await getMaterial("mat-1");

    expect(result).toBeNull();
  });
});

describe("updateMaterial", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns UNAUTHENTICATED error when user is not authenticated", async () => {
    mockClient = buildMockClient({ user: null });
    const [{ updateMaterial }, { ACTION_ERRORS }] = await Promise.all([
      import("@/lib/actions/materials"),
      import("@/lib/constants"),
    ]);

    const formData = new FormData();
    formData.set("title", "新しいタイトル");
    // subject_id は UUID 形式が必須（バリデーションより先に認証エラーが発生するようにする）
    formData.set("subject_id", "a0000000-0000-4000-a000-000000000001");

    const result = await updateMaterial("mat-1", formData);

    expect(result).toEqual({
      success: false,
      error: ACTION_ERRORS.UNAUTHENTICATED,
    });
  });
});

describe("deleteMaterial", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns UNAUTHENTICATED error when user is not authenticated", async () => {
    mockClient = buildMockClient({ user: null });
    const [{ deleteMaterial }, { ACTION_ERRORS }] = await Promise.all([
      import("@/lib/actions/materials"),
      import("@/lib/constants"),
    ]);

    const result = await deleteMaterial("mat-1");

    expect(result).toEqual({
      success: false,
      error: ACTION_ERRORS.UNAUTHENTICATED,
    });
  });
});
