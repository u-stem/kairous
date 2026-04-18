import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MaterialPracticeLogSection } from "@/components/material-practice-log-section";

vi.mock("@/lib/actions/practice-log", () => ({
  addPracticeLogEntry: vi.fn(() =>
    Promise.resolve({ success: true, data: undefined }),
  ),
  deletePracticeLogEntry: vi.fn(() =>
    Promise.resolve({ success: true, data: undefined }),
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const MATERIAL_ID = "12345678-1234-4abc-89ef-1234567890ab";

describe("MaterialPracticeLogSection", () => {
  it("エントリ 0 件時はメッセージを表示する", () => {
    render(
      <MaterialPracticeLogSection
        materialId={MATERIAL_ID}
        entries={[]}
        entrySchema="reps"
        unitLabel="回"
      />,
    );

    expect(screen.getByTestId("practice-log-section")).toBeDefined();
    expect(screen.getByText("まだエントリがありません")).toBeDefined();
  });

  it("エントリを新しい順に一覧表示する", () => {
    render(
      <MaterialPracticeLogSection
        materialId={MATERIAL_ID}
        entries={[
          { date: "2026-04-10", value: 5 },
          { date: "2026-04-12", value: 8 },
        ]}
        entrySchema="reps"
        unitLabel="回"
      />,
    );

    const entries = screen.getByTestId("practice-log-entries");
    expect(entries.children).toHaveLength(2);
    // 最新 (index 1) が一覧先頭に来る
    expect(entries.children[0].getAttribute("data-testid")).toBe(
      "practice-log-entry-1",
    );
    expect(entries.children[1].getAttribute("data-testid")).toBe(
      "practice-log-entry-0",
    );
  });

  it("数値 schema で空の value はクライアント側で拒否する", () => {
    render(
      <MaterialPracticeLogSection
        materialId={MATERIAL_ID}
        entries={[]}
        entrySchema="reps"
        unitLabel="回"
      />,
    );

    fireEvent.click(screen.getByTestId("practice-log-add-button"));
    expect(screen.getByTestId("practice-log-error")).toHaveTextContent(
      "値を入力してください",
    );
  });

  it("freeform schema は文字列入力を受け付ける", () => {
    render(
      <MaterialPracticeLogSection
        materialId={MATERIAL_ID}
        entries={[{ date: "2026-04-10", value: "速弾き練習" }]}
        entrySchema="freeform"
        unitLabel="練習"
      />,
    );

    // value が文字列のときは単位を付けずにそのまま表示する
    expect(screen.getByText("速弾き練習")).toBeDefined();
  });
});
