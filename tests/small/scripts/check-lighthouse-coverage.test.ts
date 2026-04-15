import { describe, it, expect } from "vitest";
import {
  pageFileToRoutePattern,
  urlToRoutePattern,
  checkCoverage,
} from "../../../scripts/check-lighthouse-coverage";

describe("pageFileToRoutePattern", () => {
  it("returns '/' for root (main) group page", () => {
    expect(pageFileToRoutePattern("src/app/(main)/page.tsx")).toBe("/");
  });

  it("strips (group) segments", () => {
    expect(pageFileToRoutePattern("src/app/(main)/materials/page.tsx")).toBe(
      "/materials",
    );
  });

  it("preserves dynamic [param] segments", () => {
    expect(
      pageFileToRoutePattern("src/app/(main)/materials/[id]/page.tsx"),
    ).toBe("/materials/[id]");
  });

  it("handles nested dynamic segments", () => {
    expect(
      pageFileToRoutePattern(
        "src/app/(main)/materials/[id]/cards/[cardId]/edit/page.tsx",
      ),
    ).toBe("/materials/[id]/cards/[cardId]/edit");
  });

  it("handles non-group routes (auth)", () => {
    expect(pageFileToRoutePattern("src/app/auth/login/page.tsx")).toBe(
      "/auth/login",
    );
  });
});

describe("urlToRoutePattern", () => {
  const patterns = [
    "/",
    "/materials",
    "/materials/[id]",
    "/materials/[id]/cards/[cardId]/edit",
  ];

  it("matches concrete UUID to [id] pattern", () => {
    expect(
      urlToRoutePattern(
        "http://localhost:3000/materials/00000000-0000-4000-8000-000000000001",
        patterns,
      ),
    ).toBe("/materials/[id]");
  });

  it("matches multi-segment dynamic route", () => {
    expect(
      urlToRoutePattern(
        "http://localhost:3000/materials/00000000-0000-4000-8000-000000000001/cards/00000000-0000-4000-8000-000000000002/edit",
        patterns,
      ),
    ).toBe("/materials/[id]/cards/[cardId]/edit");
  });

  it("returns pathname itself when no pattern matches (orphan)", () => {
    expect(
      urlToRoutePattern("http://localhost:3000/nonexistent", patterns),
    ).toBe("/nonexistent");
  });

  it("prefers static route over dynamic when both match", () => {
    const withStaticAndDynamic = ["/materials/new", "/materials/[id]"];
    expect(
      urlToRoutePattern(
        "http://localhost:3000/materials/new",
        withStaticAndDynamic,
      ),
    ).toBe("/materials/new");
  });
});

describe("checkCoverage", () => {
  it("returns empty missing and orphan when all pages are covered", () => {
    const pages = [
      "src/app/(main)/page.tsx",
      "src/app/(main)/materials/page.tsx",
    ];
    const urls = [
      "http://localhost:3000/",
      "http://localhost:3000/materials",
    ];
    const result = checkCoverage(pages, urls, { routes: [] });
    expect(result.missing).toEqual([]);
    expect(result.orphan).toEqual([]);
  });

  it("reports missing pages not in lighthouserc", () => {
    const pages = [
      "src/app/(main)/page.tsx",
      "src/app/(main)/materials/page.tsx",
    ];
    const urls = ["http://localhost:3000/"];
    const result = checkCoverage(pages, urls, { routes: [] });
    expect(result.missing).toEqual(["/materials"]);
  });

  it("reports orphan URLs with no corresponding page", () => {
    const pages = ["src/app/(main)/page.tsx"];
    const urls = [
      "http://localhost:3000/",
      "http://localhost:3000/deleted-route",
    ];
    const result = checkCoverage(pages, urls, { routes: [] });
    expect(result.orphan).toEqual(["/deleted-route"]);
  });

  it("excludes allowlisted routes from missing", () => {
    const pages = [
      "src/app/(main)/page.tsx",
      "src/app/(main)/internal/page.tsx",
    ];
    const urls = ["http://localhost:3000/"];
    const result = checkCoverage(pages, urls, { routes: ["/internal"] });
    expect(result.missing).toEqual([]);
  });
});
