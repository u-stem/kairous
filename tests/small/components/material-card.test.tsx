import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MaterialCard } from "@/components/material-card";
import type { MaterialWithMethods } from "@/lib/types/materials";

const baseSubject = { id: "subj-1", name: "数学", color: "#4f46e5" };

function makeMaterial(overrides: Partial<MaterialWithMethods> = {}): MaterialWithMethods {
  return {
    id: "mat-1",
    title: "微分積分",
    description: null,
    subject_id: "subj-1",
    subject: baseSubject,
    total_cards: 10,
    due_count: 0,
    methods: [],
    created_at: "2026-01-01T00:00:00Z",
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

  it("カードベース以外の手法のみの場合は「セッション学習」を表示する", () => {
    const material = makeMaterial({
      methods: [{ id: "m-1", slug: "pomodoro", name: "ポモドーロ", category: "focus" }],
    });
    render(<MaterialCard material={material} />);
    expect(screen.getByText("セッション学習")).toBeDefined();
  });

  it("詳細ページへのリンクを持つ", () => {
    render(<MaterialCard material={makeMaterial({ id: "mat-99" })} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/materials/mat-99");
  });
});
