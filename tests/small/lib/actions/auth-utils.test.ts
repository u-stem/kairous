import { describe, it, expect, vi, beforeEach } from "vitest";

// redirect は内部で throw するため、モックも throw させる
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

function buildMockClient(user: { id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
      }),
    },
  };
}

let mockClient: ReturnType<typeof buildMockClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("requireAuth", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns user and supabase when authenticated", async () => {
    mockClient = buildMockClient({ id: "user-1" });

    const { requireAuth } = await import("@/lib/actions/auth-utils");
    const result = await requireAuth();

    expect(result.user).toEqual({ id: "user-1" });
    expect(result.supabase).toBe(mockClient);
  });

  it("redirects to /auth/login when not authenticated", async () => {
    mockClient = buildMockClient(null);

    const { requireAuth } = await import("@/lib/actions/auth-utils");

    await expect(requireAuth()).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });
});
