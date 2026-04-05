import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BottomNav } from "@/components/navigation/bottom-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("BottomNav", () => {
  it("renders 4 navigation items", () => {
    render(<BottomNav />);
    expect(screen.getByText("今日")).toBeInTheDocument();
    expect(screen.getByText("教材")).toBeInTheDocument();
    expect(screen.getByText("統計")).toBeInTheDocument();
    expect(screen.getByText("設定")).toBeInTheDocument();
  });
});
