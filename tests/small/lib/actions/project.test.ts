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

const VALID_MILESTONE = {
  name: "設計完了",
  done: false,
  date: "2026-05-01",
};

describe("addMilestone", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects invalid materialId (non-UUID)", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone("not-a-uuid", VALID_MILESTONE);

    expect(result.success).toBe(false);
  });

  it("rejects empty milestone name", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, {
      name: "",
      done: false,
    });

    expect(result.success).toBe(false);
  });

  it("rejects milestone name exceeding 200 chars", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, {
      name: "a".repeat(201),
      done: false,
    });

    expect(result.success).toBe(false);
  });

  it("rejects when material not found (wrong owner or RLS)", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: { data: null, error: null },
    });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, VALID_MILESTONE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("見つかりません");
    }
  });

  it("rejects when material type is not project", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "flashcard", meta: {} },
        error: null,
      },
    });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, VALID_MILESTONE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("project");
    }
  });

  it("rejects when milestones already reached upper limit (50)", async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({
      name: `MS-${i}`,
      done: false,
    }));
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "project", meta: { milestones: full } },
        error: null,
      },
    });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, VALID_MILESTONE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("50");
    }
  });

  it("succeeds when milestone is valid and under limit", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "project", meta: { milestones: [] } },
        error: null,
      },
      updateResult: { data: null, error: null },
    });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, VALID_MILESTONE);

    expect(result.success).toBe(true);
  });

  it("returns update failure when DB update errors", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "project", meta: { milestones: [] } },
        error: null,
      },
      updateResult: { data: null, error: { message: "db error" } },
    });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, VALID_MILESTONE);

    expect(result.success).toBe(false);
  });
});

describe("toggleMilestone", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects negative milestoneIndex", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { toggleMilestone } = await import("@/lib/actions/project");

    const result = await toggleMilestone(VALID_MATERIAL_ID, -1);

    expect(result.success).toBe(false);
  });

  it("rejects when material type is not project", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "reading", meta: {} },
        error: null,
      },
    });
    const { toggleMilestone } = await import("@/lib/actions/project");

    const result = await toggleMilestone(VALID_MATERIAL_ID, 0);

    expect(result.success).toBe(false);
  });

  it("rejects milestoneIndex out of range", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: {
          type: "project",
          meta: { milestones: [VALID_MILESTONE] },
        },
        error: null,
      },
    });
    const { toggleMilestone } = await import("@/lib/actions/project");

    const result = await toggleMilestone(VALID_MATERIAL_ID, 5);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("5");
    }
  });

  it("succeeds when milestoneIndex is within range", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: {
          type: "project",
          meta: { milestones: [VALID_MILESTONE, { ...VALID_MILESTONE, done: true }] },
        },
        error: null,
      },
      updateResult: { data: null, error: null },
    });
    const { toggleMilestone } = await import("@/lib/actions/project");

    const result = await toggleMilestone(VALID_MATERIAL_ID, 0);

    expect(result.success).toBe(true);
  });
});

describe("deleteMilestone", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects non-integer milestoneIndex", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { deleteMilestone } = await import("@/lib/actions/project");

    const result = await deleteMilestone(VALID_MATERIAL_ID, 1.5);

    expect(result.success).toBe(false);
  });

  it("rejects milestoneIndex out of range", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: {
          type: "project",
          meta: { milestones: [VALID_MILESTONE] },
        },
        error: null,
      },
    });
    const { deleteMilestone } = await import("@/lib/actions/project");

    const result = await deleteMilestone(VALID_MATERIAL_ID, 10);

    expect(result.success).toBe(false);
  });

  it("succeeds when milestoneIndex is within range", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: {
          type: "project",
          meta: { milestones: [VALID_MILESTONE, VALID_MILESTONE] },
        },
        error: null,
      },
      updateResult: { data: null, error: null },
    });
    const { deleteMilestone } = await import("@/lib/actions/project");

    const result = await deleteMilestone(VALID_MATERIAL_ID, 0);

    expect(result.success).toBe(true);
  });

  it("returns update failure when DB update errors", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: {
          type: "project",
          meta: { milestones: [VALID_MILESTONE] },
        },
        error: null,
      },
      updateResult: { data: null, error: { message: "db error" } },
    });
    const { deleteMilestone } = await import("@/lib/actions/project");

    const result = await deleteMilestone(VALID_MATERIAL_ID, 0);

    expect(result.success).toBe(false);
  });
});
