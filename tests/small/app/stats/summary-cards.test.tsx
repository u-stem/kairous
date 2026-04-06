import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SummaryCards } from "@/app/(main)/stats/summary-cards";
import type { StatsSummary } from "@/lib/types/stats";

const summary: StatsSummary = {
  totalSec: 18000,
  sessionCount: 12,
  cardsReviewed: 87,
  prevTotalSec: 14400,
  prevSessionCount: 10,
  prevCardsReviewed: 90,
};

describe("SummaryCards", () => {
  it("renders three summary values", () => {
    render(<SummaryCards summary={summary} />);
    expect(screen.getByText("5h")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("87")).toBeInTheDocument();
  });

  it("shows positive change in green", () => {
    render(<SummaryCards summary={summary} />);
    const change = screen.getByText("+25%");
    expect(change).toBeInTheDocument();
    expect(change.className).toContain("text-green");
  });

  it("shows negative change in red", () => {
    render(<SummaryCards summary={summary} />);
    const change = screen.getByText("-3%");
    expect(change).toBeInTheDocument();
    expect(change.className).toContain("text-red");
  });
});
