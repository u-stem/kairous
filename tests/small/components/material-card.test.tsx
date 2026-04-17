import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MaterialCard } from "@/components/material-card";
import type { MaterialWithMethods } from "@/lib/types/materials";

const baseCategory = { id: "subj-1", name: "数学", color: "#4f46e5", parent_id: null };

function makeMaterial(overrides: Partial<MaterialWithMethods> = {}): MaterialWithMethods {
  return {
    id: "mat-1",
    title: "微分積分",
    description: null,
    category_id: "subj-1",
    category: baseCategory,
    total_cards: 10,
    due_count: 0,
    methods: [],
    last_studied_at: null,
    created_at: "2026-01-01T00:00:00Z",
    type: "flashcard",
    meta: {},
    completed_units: 0,
    total_units: 10,
    unit_label: "枚",
    ...overrides,
  };
}

describe("MaterialCard", () => {
  it("教材タイトルを表示する", () => {
    render(<MaterialCard material={makeMaterial({ title: "線形代数" })} />);
    expect(screen.getByText("線形代数")).toBeDefined();
  });

  it("カードベースの手法がある場合に due_count と total_cards を表示する", () => {
    const material = makeMaterial({
      due_count: 5,
      total_cards: 20,
      methods: [{ id: "m-1", slug: "srs", name: "SRS", category: "memory" }],
    });
    render(<MaterialCard material={material} />);
    // "5件20枚" が含まれるテキストが表示される
    expect(screen.getByText(/5件.*20枚/)).toBeDefined();
  });

  it("due_count が 0 のカードベース教材は件数を表示しない", () => {
    const material = makeMaterial({
      due_count: 0,
      total_cards: 20,
      methods: [{ id: "m-1", slug: "srs", name: "SRS", category: "memory" }],
    });
    render(<MaterialCard material={material} />);
    expect(screen.queryByText(/件/)).toBeNull();
    expect(screen.getByText(/20枚/)).toBeDefined();
  });

  it("カードベース以外の手法のみで未学習の場合は「未学習」を表示する", () => {
    const material = makeMaterial({
      methods: [{ id: "m-1", slug: "pomodoro", name: "ポモドーロ", category: "focus" }],
      last_studied_at: null,
    });
    render(<MaterialCard material={material} />);
    expect(screen.getByText("未学習")).toBeDefined();
  });

  it("カードベース以外の手法のみで学習済みの場合は相対時刻を表示する", () => {
    const material = makeMaterial({
      methods: [{ id: "m-1", slug: "pomodoro", name: "ポモドーロ", category: "focus" }],
      last_studied_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    });
    render(<MaterialCard material={material} />);
    expect(screen.getByText(/1時間前/)).toBeDefined();
  });

  it("詳細ページへのリンクを持つ", () => {
    render(<MaterialCard material={makeMaterial({ id: "mat-99" })} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/materials/mat-99");
  });
});
