import { describe, it, expect } from "vitest";
import {
  flashcardMetaSchema,
  readingMetaSchema,
  projectMetaSchema,
  practiceLogMetaSchema,
  noteMetaSchema,
  validateMaterialMeta,
} from "@/lib/validations/materials";

describe("flashcardMetaSchema", () => {
  it("空オブジェクトを受け付ける", () => {
    expect(flashcardMetaSchema.safeParse({}).success).toBe(true);
  });

  it("余分なキーを拒否する (strict)", () => {
    expect(flashcardMetaSchema.safeParse({ unknown: "value" }).success).toBe(false);
  });
});

describe("readingMetaSchema", () => {
  it("全フィールドを受け付ける", () => {
    const result = readingMetaSchema.safeParse({
      total_pages: 300,
      isbn: "978-4-12345678-9",
      author: "著者名",
    });
    expect(result.success).toBe(true);
  });

  it("空オブジェクトを受け付ける (全フィールドが optional)", () => {
    expect(readingMetaSchema.safeParse({}).success).toBe(true);
  });

  it("total_pages に 0 を拒否する (positive)", () => {
    expect(readingMetaSchema.safeParse({ total_pages: 0 }).success).toBe(false);
  });

  it("total_pages の上限 99999 を超えると拒否する", () => {
    expect(readingMetaSchema.safeParse({ total_pages: 100000 }).success).toBe(false);
  });

  it("isbn が 20 文字超で拒否する", () => {
    expect(readingMetaSchema.safeParse({ isbn: "a".repeat(21) }).success).toBe(false);
  });

  it("余分なキーを拒否する (strict)", () => {
    expect(readingMetaSchema.safeParse({ extra_field: true }).success).toBe(false);
  });
});

describe("projectMetaSchema", () => {
  it("milestones と deadline を受け付ける", () => {
    const result = projectMetaSchema.safeParse({
      milestones: [{ name: "フェーズ1", done: false, date: "2026-05-01" }],
      deadline: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("空オブジェクトを受け付ける", () => {
    expect(projectMetaSchema.safeParse({}).success).toBe(true);
  });

  it("milestone の name が空文字で拒否する", () => {
    const result = projectMetaSchema.safeParse({
      milestones: [{ name: "", done: false }],
    });
    expect(result.success).toBe(false);
  });

  it("milestones が 50 件を超えると拒否する", () => {
    const result = projectMetaSchema.safeParse({
      milestones: Array.from({ length: 51 }, (_, i) => ({ name: `M${i}`, done: false })),
    });
    expect(result.success).toBe(false);
  });

  it("余分なキーを拒否する (strict)", () => {
    expect(projectMetaSchema.safeParse({ unknown_key: "value" }).success).toBe(false);
  });
});

describe("practiceLogMetaSchema", () => {
  it("entry_schema と entries を受け付ける", () => {
    const result = practiceLogMetaSchema.safeParse({
      entry_schema: "reps",
      entries: [{ date: "2026-04-15", value: 10 }],
    });
    expect(result.success).toBe(true);
  });

  it("空オブジェクトを受け付ける", () => {
    expect(practiceLogMetaSchema.safeParse({}).success).toBe(true);
  });

  it("不正な entry_schema 値を拒否する", () => {
    expect(practiceLogMetaSchema.safeParse({ entry_schema: "invalid" }).success).toBe(false);
  });

  it("entry の note が 500 文字超で拒否する", () => {
    const result = practiceLogMetaSchema.safeParse({
      entries: [{ date: "2026-04-15", value: 1, note: "a".repeat(501) }],
    });
    expect(result.success).toBe(false);
  });

  it("余分なキーを拒否する (strict)", () => {
    expect(practiceLogMetaSchema.safeParse({ extra: 1 }).success).toBe(false);
  });
});

describe("noteMetaSchema", () => {
  it("section_count と word_count を受け付ける", () => {
    const result = noteMetaSchema.safeParse({ section_count: 10, word_count: 5000 });
    expect(result.success).toBe(true);
  });

  it("空オブジェクトを受け付ける", () => {
    expect(noteMetaSchema.safeParse({}).success).toBe(true);
  });

  it("section_count に負値を拒否する (nonnegative)", () => {
    expect(noteMetaSchema.safeParse({ section_count: -1 }).success).toBe(false);
  });

  it("word_count の上限 1000000 を超えると拒否する", () => {
    expect(noteMetaSchema.safeParse({ word_count: 1000001 }).success).toBe(false);
  });

  it("余分なキーを拒否する (strict)", () => {
    expect(noteMetaSchema.safeParse({ tags: [] }).success).toBe(false);
  });
});

describe("validateMaterialMeta", () => {
  it("flashcard タイプに空オブジェクトを受け付ける", () => {
    const result = validateMaterialMeta("flashcard", {});
    expect(result.success).toBe(true);
  });

  it("reading タイプに読書 meta を受け付ける", () => {
    const result = validateMaterialMeta("reading", { total_pages: 200 });
    expect(result.success).toBe(true);
  });

  it("project タイプにプロジェクト meta を受け付ける", () => {
    const result = validateMaterialMeta("project", { deadline: "2026-12-31" });
    expect(result.success).toBe(true);
  });

  it("practice_log タイプに練習ログ meta を受け付ける", () => {
    const result = validateMaterialMeta("practice_log", { entry_schema: "duration" });
    expect(result.success).toBe(true);
  });

  it("note タイプにノート meta を受け付ける", () => {
    const result = validateMaterialMeta("note", { word_count: 1500 });
    expect(result.success).toBe(true);
  });

  it("flashcard タイプに reading 専用フィールドを拒否する (strict)", () => {
    const result = validateMaterialMeta("flashcard", { total_pages: 300 });
    expect(result.success).toBe(false);
  });

  it("reading タイプに practice_log 専用フィールドを拒否する (strict)", () => {
    const result = validateMaterialMeta("reading", { entry_schema: "reps" });
    expect(result.success).toBe(false);
  });
});
