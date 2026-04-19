import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildMockClient } from "./_mocks";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

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
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("rejects empty milestone name at zod boundary", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, {
      name: "",
      done: false,
    });

    expect(result.success).toBe(false);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("rejects milestone name exceeding 200 chars at zod boundary", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, {
      name: "a".repeat(201),
      done: false,
    });

    expect(result.success).toBe(false);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("maps RPC 'material not found' to NOT_FOUND error", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      rpcResult: { data: null, error: { message: "material not found" } },
    });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, VALID_MILESTONE);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("見つかりません");
  });

  it("maps RPC 'not project' to type error", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      rpcResult: {
        data: null,
        error: { message: "material type is not project (got flashcard)" },
      },
    });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, VALID_MILESTONE);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("project");
  });

  it("maps RPC 'exceeded max' error with extracted limit (50)", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      rpcResult: {
        data: null,
        error: { message: "project milestones exceeded max (50)" },
      },
    });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, VALID_MILESTONE);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("50");
  });

  it("calls rpc with p_material_id and validated p_milestone when input is valid", async () => {
    const rpcSpy = vi.fn();
    mockClient = buildMockClient({
      user: { id: USER_ID },
      onRpc: rpcSpy,
    });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, VALID_MILESTONE);

    expect(result.success).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith("project_add_milestone", {
      p_material_id: VALID_MATERIAL_ID,
      p_milestone: VALID_MILESTONE,
    });
  });

  it("returns UPDATE_FAILED for unexpected RPC errors", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      rpcResult: {
        data: null,
        error: { message: "connection reset" },
      },
    });
    const { addMilestone } = await import("@/lib/actions/project");

    const result = await addMilestone(VALID_MATERIAL_ID, VALID_MILESTONE);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("更新");
  });
});

describe("toggleMilestone", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects negative milestoneIndex at zod boundary", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { toggleMilestone } = await import("@/lib/actions/project");

    const result = await toggleMilestone(VALID_MATERIAL_ID, -1);

    expect(result.success).toBe(false);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("maps RPC 'out of range' with extracted index", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      rpcResult: {
        data: null,
        error: { message: "milestone index 5 out of range (length=1)" },
      },
    });
    const { toggleMilestone } = await import("@/lib/actions/project");

    const result = await toggleMilestone(VALID_MATERIAL_ID, 5);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("5");
  });

  it("maps RPC 'is not project' to type error (shared mapRpcError)", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      rpcResult: {
        data: null,
        error: { message: "material type is not project (got practice_log)" },
      },
    });
    const { toggleMilestone } = await import("@/lib/actions/project");

    const result = await toggleMilestone(VALID_MATERIAL_ID, 0);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("project");
  });

  it("calls rpc with p_material_id and p_milestone_index when input is valid", async () => {
    const rpcSpy = vi.fn();
    mockClient = buildMockClient({
      user: { id: USER_ID },
      onRpc: rpcSpy,
    });
    const { toggleMilestone } = await import("@/lib/actions/project");

    const result = await toggleMilestone(VALID_MATERIAL_ID, 3);

    expect(result.success).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith("project_toggle_milestone", {
      p_material_id: VALID_MATERIAL_ID,
      p_milestone_index: 3,
    });
  });
});

describe("deleteMilestone", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects non-integer milestoneIndex at zod boundary", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { deleteMilestone } = await import("@/lib/actions/project");

    const result = await deleteMilestone(VALID_MATERIAL_ID, 1.5);

    expect(result.success).toBe(false);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("maps RPC 'is not project' to type error", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      rpcResult: {
        data: null,
        error: { message: "material type is not project (got reading)" },
      },
    });
    const { deleteMilestone } = await import("@/lib/actions/project");

    const result = await deleteMilestone(VALID_MATERIAL_ID, 0);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("project");
  });

  it("calls rpc with p_material_id and p_milestone_index when input is valid", async () => {
    const rpcSpy = vi.fn();
    mockClient = buildMockClient({
      user: { id: USER_ID },
      onRpc: rpcSpy,
    });
    const { deleteMilestone } = await import("@/lib/actions/project");

    const result = await deleteMilestone(VALID_MATERIAL_ID, 0);

    expect(result.success).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith("project_delete_milestone", {
      p_material_id: VALID_MATERIAL_ID,
      p_milestone_index: 0,
    });
  });
});
