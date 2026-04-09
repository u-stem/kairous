import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

function createChainMock(resolvedValue: { data: unknown; error: unknown }) {
  const makeChain = (): Record<string, unknown> => {
    const resolved = Promise.resolve(resolvedValue);
    const chain: Record<string, unknown> = {
      insert: vi.fn().mockImplementation(() => makeChain()),
      update: vi.fn().mockImplementation(() => makeChain()),
      delete: vi.fn().mockImplementation(() => makeChain()),
      select: vi.fn().mockImplementation(() => makeChain()),
      eq: vi.fn().mockImplementation(() => makeChain()),
      limit: vi.fn().mockImplementation(() => makeChain()),
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
  countResult?: { count: number; error: unknown };
}) {
  const authMock = {
    getUser: vi.fn().mockResolvedValue({
      data: { user: options.user },
    }),
  };
  const queryResult = options.queryResult ?? { data: null, error: null };

  const fromMock = vi.fn().mockReturnValue({
    ...createChainMock(queryResult),
    select: vi.fn().mockImplementation((cols?: string) => {
      if (cols && cols.includes("count")) {
        return Promise.resolve(options.countResult ?? { count: 0, error: null });
      }
      return createChainMock(queryResult);
    }),
  });

  return { auth: authMock, from: fromMock, rpc: vi.fn() };
}

let mockClient: ReturnType<typeof buildMockClient>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(mockClient)),
}));

describe("createNotificationSchedule", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects when unauthenticated", async () => {
    mockClient = buildMockClient({ user: null });

    const { createNotificationSchedule } = await import(
      "@/lib/actions/notifications"
    );

    await expect(
      createNotificationSchedule({
        label: "朝の通知",
        time: "08:00",
        message_type: "due_today",
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/auth/login");
  });

  it("returns validation error for empty label", async () => {
    mockClient = buildMockClient({ user: { id: "user-1" } });

    const { createNotificationSchedule } = await import(
      "@/lib/actions/notifications"
    );
    const result = await createNotificationSchedule({
      label: "",
      time: "08:00",
      message_type: "due_today",
    });

    expect(result.success).toBe(false);
  });

  it("returns validation error for invalid time", async () => {
    mockClient = buildMockClient({ user: { id: "user-1" } });

    const { createNotificationSchedule } = await import(
      "@/lib/actions/notifications"
    );
    const result = await createNotificationSchedule({
      label: "朝の通知",
      time: "25:00",
      message_type: "due_today",
    });

    expect(result.success).toBe(false);
  });

  it("returns success with created schedule", async () => {
    const schedule = {
      id: "sched-1",
      label: "朝の通知",
      time: "08:00:00",
      message_type: "due_today",
      enabled: true,
    };
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: schedule, error: null },
      countResult: { count: 0, error: null },
    });

    const { createNotificationSchedule } = await import(
      "@/lib/actions/notifications"
    );
    const result = await createNotificationSchedule({
      label: "朝の通知",
      time: "08:00",
      message_type: "due_today",
    });

    expect(result.success).toBe(true);
  });
});

describe("toggleNotificationEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects when unauthenticated", async () => {
    mockClient = buildMockClient({ user: null });

    const { toggleNotificationEnabled } = await import(
      "@/lib/actions/notifications"
    );

    await expect(toggleNotificationEnabled(true)).rejects.toThrow(
      "NEXT_REDIRECT:/auth/login",
    );
  });

  it("returns success on valid toggle", async () => {
    mockClient = buildMockClient({
      user: { id: "user-1" },
      queryResult: { data: { notification_enabled: true }, error: null },
    });

    const { toggleNotificationEnabled } = await import(
      "@/lib/actions/notifications"
    );
    const result = await toggleNotificationEnabled(true);

    expect(result.success).toBe(true);
  });
});
