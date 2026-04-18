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

  it("rejects invalid entry date", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, {
      date: "not-a-date",
      value: 10,
    });

    expect(result.success).toBe(false);
  });

  it("rejects numeric value exceeding 999999", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, {
      date: "2026-04-18",
      value: 1_000_000,
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative numeric value", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, {
      date: "2026-04-18",
      value: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects when material not found (wrong owner or RLS)", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: { data: null, error: null },
    });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, VALID_ENTRY);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("見つかりません");
    }
  });

  it("rejects when material type is not practice_log", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "flashcard", meta: {} },
        error: null,
      },
    });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, VALID_ENTRY);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("practice_log");
    }
  });

  it("rejects when entries already reached upper limit (10000)", async () => {
    const full = Array.from({ length: 10000 }, (_, i) => ({
      date: "2026-04-18",
      value: i,
    }));
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "practice_log", meta: { entries: full } },
        error: null,
      },
    });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, VALID_ENTRY);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("10000");
    }
  });

  it("succeeds when entry is valid and entries under limit", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "practice_log", meta: { entries: [] } },
        error: null,
      },
      updateResult: { data: null, error: null },
    });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, VALID_ENTRY);

    expect(result.success).toBe(true);
  });

  it("returns update failure when DB update errors", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "practice_log", meta: { entries: [] } },
        error: null,
      },
      updateResult: { data: null, error: { message: "db error" } },
    });
    const { addPracticeLogEntry } = await import("@/lib/actions/practice-log");

    const result = await addPracticeLogEntry(VALID_MATERIAL_ID, VALID_ENTRY);

    expect(result.success).toBe(false);
  });
});

describe("deletePracticeLogEntry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects negative entryIndex", async () => {
    mockClient = buildMockClient({ user: { id: USER_ID } });
    const { deletePracticeLogEntry } = await import(
      "@/lib/actions/practice-log"
    );

    const result = await deletePracticeLogEntry(VALID_MATERIAL_ID, -1);

    expect(result.success).toBe(false);
  });

  it("rejects when material type is not practice_log", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: { type: "reading", meta: {} },
        error: null,
      },
    });
    const { deletePracticeLogEntry } = await import(
      "@/lib/actions/practice-log"
    );

    const result = await deletePracticeLogEntry(VALID_MATERIAL_ID, 0);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("practice_log");
    }
  });

  it("rejects entryIndex out of range", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: {
          type: "practice_log",
          meta: { entries: [VALID_ENTRY] },
        },
        error: null,
      },
    });
    const { deletePracticeLogEntry } = await import(
      "@/lib/actions/practice-log"
    );

    const result = await deletePracticeLogEntry(VALID_MATERIAL_ID, 5);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("5");
    }
  });

  it("succeeds when entryIndex is within range", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: {
          type: "practice_log",
          meta: { entries: [VALID_ENTRY, { ...VALID_ENTRY, value: 20 }] },
        },
        error: null,
      },
      updateResult: { data: null, error: null },
    });
    const { deletePracticeLogEntry } = await import(
      "@/lib/actions/practice-log"
    );

    const result = await deletePracticeLogEntry(VALID_MATERIAL_ID, 0);

    expect(result.success).toBe(true);
  });

  it("returns update failure when DB update errors", async () => {
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: {
          type: "practice_log",
          meta: { entries: [VALID_ENTRY] },
        },
        error: null,
      },
      updateResult: { data: null, error: { message: "db error" } },
    });
    const { deletePracticeLogEntry } = await import(
      "@/lib/actions/practice-log"
    );

    const result = await deletePracticeLogEntry(VALID_MATERIAL_ID, 0);

    expect(result.success).toBe(false);
  });

  it("sets completed_units to entries.length after deletion", async () => {
    const updateSpy = vi.fn();
    mockClient = buildMockClient({
      user: { id: USER_ID },
      fetchResult: {
        data: {
          type: "practice_log",
          meta: { entries: [VALID_ENTRY, VALID_ENTRY, VALID_ENTRY] },
          completed_units: 3,
        },
        error: null,
      },
      onUpdate: updateSpy,
    });
    const { deletePracticeLogEntry } = await import(
      "@/lib/actions/practice-log"
    );

    const result = await deletePracticeLogEntry(VALID_MATERIAL_ID, 1);

    expect(result.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ completed_units: 2 }),
    );
  });
});
