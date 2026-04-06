import { describe, it, expect } from "vitest";
import { securityHeaders } from "../../../next.config";

function getHeader(key: string): string | undefined {
  return securityHeaders.find((h) => h.key === key)?.value;
}

describe("security headers (static)", () => {
  it("X-Frame-Options is DENY", () => {
    expect(getHeader("X-Frame-Options")).toBe("DENY");
  });

  it("does not include CSP because it is set dynamically by middleware", () => {
    expect(getHeader("Content-Security-Policy")).toBeUndefined();
  });
});
