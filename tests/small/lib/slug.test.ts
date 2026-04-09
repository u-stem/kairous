import { describe, expect, it } from "vitest";
import { generateMethodSlug } from "@/lib/utils/slug";

describe("generateMethodSlug", () => {
  it("converts name to slug with custom prefix", () => {
    const slug = generateMethodSlug("abc12345", "ファインマンテクニック");
    expect(slug).toBe("custom_abc12345_ファインマンテクニック");
  });

  it("trims whitespace and converts spaces to underscores", () => {
    const slug = generateMethodSlug("abc12345", "  音読 練習  ");
    expect(slug).toBe("custom_abc12345_音読_練習");
  });

  it("uses first 8 chars of userId", () => {
    const slug = generateMethodSlug("abcdef12-3456-7890-abcd-ef1234567890", "Test");
    expect(slug).toBe("custom_abcdef12_test");
  });

  it("removes special characters", () => {
    const slug = generateMethodSlug("abc12345", "Test!@#Method");
    expect(slug).toBe("custom_abc12345_testmethod");
  });
});
