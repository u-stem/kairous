import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// チェーン可能なモッククライアントを組み立てる。
// 最終的に解決される data/error をオプションで受け取る
function buildMockClient(options?: {
  user?: { id: string } | null;
  data?: unknown;
  error?: unknown;
}) {
  const user = options?.user !== undefined ? options.user : { id: "user-1" };
  const authMock = {
    getUser: vi.fn().mockResolvedValue({ data: { user } }),
  };

  const resolved = Promise.resolve({
    data: options?.data ?? null,
    error: options?.error ?? null,
  });
  const makeChain = (): Record<string, unknown> => ({
    select: vi.fn().mockImplementation(() => makeChain()),
    eq: vi.fn().mockImplementation(() => makeChain()),
    order: vi.fn().mockReturnValue(resolved),
    then: resolved.then.bind(resolved),
  });

  return {
    auth: authMock,
    from: vi.fn().mockReturnValue(makeChain()),
  };
}

let mockClient: ReturnType<typeof buildMockClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("getMaterialElaborations", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns elaborations mapped to MaterialElaboration shape", async () => {
    mockClient = buildMockClient({
      data: [
        {
          id: "elab-1",
          card_id: "card-1",
          elaboration_text: "これはテスト記述です",
          created_at: "2026-04-10T10:00:00Z",
          cards: { front: "問題文1", material_id: "mat-1" },
        },
      ],
    });

    const { getMaterialElaborations } = await import("@/lib/actions/elaborations");
    const result = await getMaterialElaborations("mat-1");

    expect(result).toEqual([
      {
        id: "elab-1",
        card_id: "card-1",
        card_front: "問題文1",
        elaboration_text: "これはテスト記述です",
        created_at: "2026-04-10T10:00:00Z",
      },
    ]);
  });

  it("returns empty array when no elaborations exist", async () => {
    mockClient = buildMockClient({ data: null });

    const { getMaterialElaborations } = await import("@/lib/actions/elaborations");
    const result = await getMaterialElaborations("mat-1");

    expect(result).toEqual([]);
  });

  it("redirects to /auth/login when user is not authenticated", async () => {
    mockClient = buildMockClient({ user: null });

    const { getMaterialElaborations } = await import("@/lib/actions/elaborations");

    await expect(getMaterialElaborations("mat-1")).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login",
    );
  });
});
