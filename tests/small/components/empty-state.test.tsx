import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/empty-state";

// Next.js Link はテスト環境でレンダリングできるようにモック
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

describe("EmptyState", () => {
  it("タイトルと説明を表示する", () => {
    render(
      <EmptyState title="教材がありません" description="まだ教材が登録されていません" />
    );
    expect(screen.getByText("教材がありません")).toBeInTheDocument();
    expect(screen.getByText("まだ教材が登録されていません")).toBeInTheDocument();
  });

  it("action が指定されたときリンクボタンを表示する", () => {
    render(
      <EmptyState
        title="教材がありません"
        description="まだ教材が登録されていません"
        action={{ label: "教材を追加", href: "/materials/new" }}
      />
    );
    const link = screen.getByRole("link", { name: "教材を追加" });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/materials/new");
  });

  it("action が指定されないときリンクを表示しない", () => {
    render(
      <EmptyState title="教材がありません" description="まだ教材が登録されていません" />
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});
