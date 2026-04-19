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

const VALID_ENTRY = { date: "2026-04-18", value: 30, note: "朝練" };

describe("addPracticeLogEntry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects invalid materialId (non-UUID)", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry("not-a-uuid", VALID_ENTRY);

    expect(result.success).toBe(false);
  });

  it("rejects invalid entry date at zod boundary (before RPC)", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, {
      date: "not-a-date",
      value: 10,
    });

    expect(result.success).toBe(false);
    // zod で弾かれるため rpc() は呼ばれない
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("rejects numeric value exceeding 999999 at zod boundary", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, {
      date: "2026-04-18",
      value: 1_000_000,
    });

    expect(result.success).toBe(false);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("rejects negative numeric value at zod boundary", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, {
      date: "2026-04-18",
      value: -1,
    });

    expect(result.success).toBe(false);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("maps RPC 'material not found' to NOT_FOUND error", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      rpcResult: { data: null, error: { message: "material not found" } },
    });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, VALID_ENTRY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("見つかりません");
  });

  it("maps RPC 'not practice_log' to type error", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      rpcResult: {
        data: null,
        error: { message: "material type is not practice_log (got flashcard)" },
      },
    });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, VALID_ENTRY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("practice_log");
  });

  it("maps RPC 'exceeded max' error with extracted limit", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      rpcResult: {
        data: null,
        error: { message: "practice_log entries exceeded max (10000)" },
      },
    });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, VALID_ENTRY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("10000");
  });

  it("calls rpc with p_material_id and validated p_entry when input is valid", async () => {
    const rpcSpy = vi.fn();
    mockClient = buildMockClient({
      user: { id: USER_ID },
      onRpc: rpcSpy,
    });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, VALID_ENTRY);

    expect(result.success).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith("practice_log_append_entry", {
      p_material_id: VALID_MATERIAL_ID,
      p_entry: VALID_ENTRY,
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
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, VALID_ENTRY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("更新");
  });
});

describe("deletePracticeLogEntry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects negative entryIndex at zod boundary", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { deletePracticeLogEntry } = await import(
      "@/lib/actions/practice-log"
    );

    const result = await deletePracticeLogEntry(VALID_MATERIAL_ID, -1);

    expect(result.success).toBe(false);
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it("maps RPC 'out of range' with extracted index to not-found message", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      rpcResult: {
        data: null,
        error: { message: "entry index 5 out of range (length=1)" },
      },
    });
    const { deletePracticeLogEntry } = await import(
      "@/lib/actions/practice-log"
    );

    const result = await deletePracticeLogEntry(VALID_MATERIAL_ID, 5);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("5");
  });

  it("calls rpc with p_material_id and p_entry_index when input is valid", async () => {
    const rpcSpy = vi.fn();
    mockClient = buildMockClient({
      user: { id: USER_ID },
      onRpc: rpcSpy,
    });
    const { deletePracticeLogEntry } = await import(
      "@/lib/actions/practice-log"
    );

    const result = await deletePracticeLogEntry(VALID_MATERIAL_ID, 2);

    expect(result.success).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith("practice_log_delete_entry", {
      p_material_id: VALID_MATERIAL_ID,
      p_entry_index: 2,
    });
  });
});
