import { describe, it, expect } from "vitest";
import {
  MATERIAL_METHOD_SLUGS,
  METHOD_CATEGORIES,
  getMethodColorClasses,
} from "@/lib/constants";

describe("MATERIAL_METHOD_SLUGS", () => {
  it("ウィザードで選択可能な学習手法スラッグを含む", () => {
    expect(MATERIAL_METHOD_SLUGS).toContain("srs");
    expect(MATERIAL_METHOD_SLUGS).toContain("active_recall");
    expect(MATERIAL_METHOD_SLUGS).toContain("elaboration");
    expect(MATERIAL_METHOD_SLUGS).toContain("pomodoro");
  });

  it("4つの手法のみ含む", () => {
    expect(MATERIAL_METHOD_SLUGS).toHaveLength(4);
  });
});

describe("METHOD_CATEGORIES", () => {
  it("各カテゴリにlabelとslugsが存在する", () => {
    const categories = ["memory", "comprehension", "focus", "consolidation", "general"] as const;
    for (const category of categories) {
      expect(METHOD_CATEGORIES[category]).toBeDefined();
      expect(typeof METHOD_CATEGORIES[category].label).toBe("string");
      expect(Array.isArray(METHOD_CATEGORIES[category].slugs)).toBe(true);
    }
  });

  it("memoryカテゴリにsrsとactive_recallが含まれる", () => {
    expect(METHOD_CATEGORIES.memory.slugs).toContain("srs");
    expect(METHOD_CATEGORIES.memory.slugs).toContain("active_recall");
  });

  it("memoryカテゴリのlabelが「記憶」である", () => {
    expect(METHOD_CATEGORIES.memory.label).toBe("記憶");
  });

  it("comprehensionカテゴリにinterleavingとelaborationが含まれる", () => {
    expect(METHOD_CATEGORIES.comprehension.slugs).toContain("interleaving");
    expect(METHOD_CATEGORIES.comprehension.slugs).toContain("elaboration");
  });

  it("focusカテゴリにpomodoroが含まれる", () => {
    expect(METHOD_CATEGORIES.focus.slugs).toContain("pomodoro");
  });

  it("consolidationカテゴリにwakeful_restが含まれる", () => {
    expect(METHOD_CATEGORIES.consolidation.slugs).toContain("wakeful_rest");
  });

  it("generalカテゴリにfree_studyが含まれる", () => {
    expect(METHOD_CATEGORIES.general.slugs).toContain("free_study");
  });
});

describe("getMethodColorClasses", () => {
  it("memoryカテゴリにindigoの色クラスを返す", () => {
    const result = getMethodColorClasses("memory");
    expect(result.light).toBe("bg-indigo-50 text-indigo-600");
    expect(result.dark).toBe("dark:bg-indigo-950 dark:text-indigo-400");
  });

  it("comprehensionカテゴリにgreenの色クラスを返す", () => {
    const result = getMethodColorClasses("comprehension");
    expect(result.light).toBe("bg-green-50 text-green-600");
    expect(result.dark).toBe("dark:bg-green-950 dark:text-green-400");
  });

  it("focusカテゴリにamberの色クラスを返す", () => {
    const result = getMethodColorClasses("focus");
    expect(result.light).toBe("bg-amber-50 text-amber-600");
    expect(result.dark).toBe("dark:bg-amber-950 dark:text-amber-400");
  });

  it("consolidationカテゴリにpurpleの色クラスを返す", () => {
    const result = getMethodColorClasses("consolidation");
    expect(result.light).toBe("bg-purple-50 text-purple-600");
    expect(result.dark).toBe("dark:bg-purple-950 dark:text-purple-400");
  });

  it("generalカテゴリにgrayの色クラスを返す", () => {
    const result = getMethodColorClasses("general");
    expect(result.light).toBe("bg-gray-100 text-gray-600");
    expect(result.dark).toBe("dark:bg-gray-800 dark:text-gray-400");
  });

  it("未知のカテゴリはgrayにフォールバックする", () => {
    const result = getMethodColorClasses("unknown");
    expect(result.light).toBe("bg-gray-100 text-gray-600");
    expect(result.dark).toBe("dark:bg-gray-800 dark:text-gray-400");
  });
});
