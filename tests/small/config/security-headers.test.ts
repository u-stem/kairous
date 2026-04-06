import { describe, it, expect } from "vitest";
import { securityHeaders } from "../../../next.config";

function getHeader(key: string): string | undefined {
  return securityHeaders.find((h) => h.key === key)?.value;
}

describe("security headers (S10)", () => {
  it("X-Frame-Options is DENY to match frame-ancestors none", () => {
    expect(getHeader("X-Frame-Options")).toBe("DENY");
  });

  it("CSP includes frame-ancestors none", () => {
    expect(getHeader("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });
});
