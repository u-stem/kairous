import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const configSource = readFileSync(
  resolve(__dirname, "../../../next.config.ts"),
  "utf-8",
);

describe("security headers (S10)", () => {
  it("X-Frame-Options is DENY to match frame-ancestors none", () => {
    expect(configSource).toContain('"DENY"');
    expect(configSource).not.toContain('"SAMEORIGIN"');
  });
});
