import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildCspHeader } from "@/lib/csp";

const TEST_NONCE = "dGVzdC1ub25jZS12YWx1ZQ==";
const SUPABASE_URL = "https://test.supabase.co";

describe("buildCspHeader", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("embeds nonce in script-src directive", () => {
    const header = buildCspHeader(TEST_NONCE);

    expect(header).toContain(`'nonce-${TEST_NONCE}'`);
  });

  it("includes strict-dynamic in script-src", () => {
    const header = buildCspHeader(TEST_NONCE);

    expect(header).toContain("'strict-dynamic'");
  });

  it("does not include self in script-src because strict-dynamic overrides it", () => {
    const header = buildCspHeader(TEST_NONCE);
    const scriptSrc = header
      .split(";")
      .find((d) => d.trimStart().startsWith("script-src"));

    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'self'");
  });

  it("includes unsafe-eval in development for HMR", () => {
    vi.stubEnv("NODE_ENV", "development");

    const header = buildCspHeader(TEST_NONCE);

    expect(header).toContain("'unsafe-eval'");
  });

  it("excludes unsafe-eval in production", () => {
    const header = buildCspHeader(TEST_NONCE);

    expect(header).not.toContain("'unsafe-eval'");
  });

  it("includes supabase URL in connect-src", () => {
    const header = buildCspHeader(TEST_NONCE);

    expect(header).toContain(SUPABASE_URL);
  });

  it("includes frame-ancestors none", () => {
    const header = buildCspHeader(TEST_NONCE);

    expect(header).toContain("frame-ancestors 'none'");
  });

  it("omits supabase URL from connect-src when env is not set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    const header = buildCspHeader(TEST_NONCE);
    const connectSrc = header
      .split(";")
      .find((d) => d.trimStart().startsWith("connect-src"));

    expect(connectSrc).toBeDefined();
    expect(connectSrc).toBe(" connect-src 'self'");
  });

  it("does not include unsafe-inline in script-src", () => {
    const header = buildCspHeader(TEST_NONCE);
    const scriptSrc = header
      .split(";")
      .find((d) => d.trimStart().startsWith("script-src"));

    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});
