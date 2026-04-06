import { describe, it, expect, afterEach, vi } from "vitest";
import { buildCspHeader } from "@/lib/csp";

const TEST_NONCE = "dGVzdC1ub25jZS12YWx1ZQ==";
const SUPABASE_URL = "https://test.supabase.co";

describe("buildCspHeader", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("embeds nonce in script-src directive", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("NODE_ENV", "production");

    const header = buildCspHeader(TEST_NONCE);

    expect(header).toContain(`'nonce-${TEST_NONCE}'`);
  });

  it("includes strict-dynamic in script-src", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("NODE_ENV", "production");

    const header = buildCspHeader(TEST_NONCE);

    expect(header).toContain("'strict-dynamic'");
  });

  it("does not include self in script-src because strict-dynamic overrides it", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("NODE_ENV", "production");

    const header = buildCspHeader(TEST_NONCE);
    const scriptSrc = header
      .split(";")
      .find((d) => d.trimStart().startsWith("script-src"))!;

    expect(scriptSrc).not.toContain("'self'");
  });

  it("includes unsafe-eval in development for HMR", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("NODE_ENV", "development");

    const header = buildCspHeader(TEST_NONCE);

    expect(header).toContain("'unsafe-eval'");
  });

  it("excludes unsafe-eval in production", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("NODE_ENV", "production");

    const header = buildCspHeader(TEST_NONCE);

    expect(header).not.toContain("'unsafe-eval'");
  });

  it("includes supabase URL in connect-src", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("NODE_ENV", "production");

    const header = buildCspHeader(TEST_NONCE);

    expect(header).toContain(SUPABASE_URL);
  });

  it("includes frame-ancestors none", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("NODE_ENV", "production");

    const header = buildCspHeader(TEST_NONCE);

    expect(header).toContain("frame-ancestors 'none'");
  });

  it("uses placeholder URL when NEXT_PUBLIC_SUPABASE_URL is not set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    const header = buildCspHeader(TEST_NONCE);

    expect(header).toContain("https://placeholder.supabase.co");
  });

  it("does not include unsafe-inline in script-src", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("NODE_ENV", "production");

    const header = buildCspHeader(TEST_NONCE);
    const scriptSrc = header
      .split(";")
      .find((d) => d.trimStart().startsWith("script-src"))!;

    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});
