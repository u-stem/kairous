import { describe, it, expect } from "vitest";
import {
  createMaterialSchema,
  updateMaterialSchema,
  createSubjectSchema,
  cardSchema,
} from "@/lib/validations/materials";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("createSubjectSchema", () => {
  it("有効なnameを受け付ける", () => {
    const result = createSubjectSchema.safeParse({ name: "数学" });
    expect(result.success).toBe(true);
  });

  it("空のnameを拒否する", () => {
    const result = createSubjectSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("100文字超のnameを拒否する", () => {
    const result = createSubjectSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe("createMaterialSchema", () => {
  const validData = {
    title: "微分積分学",
    description: "大学数学の基礎",
    subject_id: VALID_UUID,
    method_ids: [VALID_UUID],
  };

  it("有効なデータを受け付ける", () => {
    const result = createMaterialSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("空のtitleを拒否する", () => {
    const result = createMaterialSchema.safeParse({ ...validData, title: "" });
    expect(result.success).toBe(false);
  });

  it("200文字超のtitleを拒否する", () => {
    const result = createMaterialSchema.safeParse({
      ...validData,
      title: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("空のmethod_idsを拒否する", () => {
    const result = createMaterialSchema.safeParse({
      ...validData,
      method_ids: [],
    });
    expect(result.success).toBe(false);
  });

  it("2000文字超のdescriptionを拒否する", () => {
    const result = createMaterialSchema.safeParse({
      ...validData,
      description: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("21個以上のmethod_idsを拒否する", () => {
    const result = createMaterialSchema.safeParse({
      ...validData,
      method_ids: Array.from({ length: 21 }, () => VALID_UUID),
    });
    expect(result.success).toBe(false);
  });

  it("descriptionを省略できる", () => {
    const { title, subject_id, method_ids } = validData;
    const result = createMaterialSchema.safeParse({ title, subject_id, method_ids });
    expect(result.success).toBe(true);
  });

  it("無効なUUIDのsubject_idを拒否する", () => {
    const result = createMaterialSchema.safeParse({
      ...validData,
      subject_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("無効なUUIDのmethod_idsを拒否する", () => {
    const result = createMaterialSchema.safeParse({
      ...validData,
      method_ids: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });
});

describe("updateMaterialSchema", () => {
  it("有効なデータを受け付ける", () => {
    const result = updateMaterialSchema.safeParse({
      title: "更新後のタイトル",
      description: "更新後の説明",
      subject_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  it("2000文字超のdescriptionを拒否する", () => {
    const result = updateMaterialSchema.safeParse({
      title: "更新後のタイトル",
      description: "a".repeat(2001),
      subject_id: VALID_UUID,
    });
    expect(result.success).toBe(false);
  });

  it("descriptionを省略できる", () => {
    const result = updateMaterialSchema.safeParse({
      title: "更新後のタイトル",
      subject_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });
});

describe("cardSchema", () => {
  it("有効なデータを受け付ける", () => {
    const result = cardSchema.safeParse({
      front: "質問文",
      back: "回答文",
    });
    expect(result.success).toBe(true);
  });

  it("空のfrontを拒否する", () => {
    const result = cardSchema.safeParse({ front: "", back: "回答文" });
    expect(result.success).toBe(false);
  });

  it("5000文字超のfrontを拒否する", () => {
    const result = cardSchema.safeParse({
      front: "a".repeat(5001),
      back: "回答文",
    });
    expect(result.success).toBe(false);
  });

  it("空のbackを拒否する", () => {
    const result = cardSchema.safeParse({ front: "質問文", back: "" });
    expect(result.success).toBe(false);
  });
});
