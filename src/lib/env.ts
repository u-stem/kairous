// NEXT_PUBLIC_ 変数はリテラル文字列で参照する必要がある
// （Next.js がビルド時にインライン化するため、動的キーアクセスはクライアントで失敗する）
export const env = {
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    (() => { throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL"); })(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    (() => { throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY"); })(),
} as const;

// サーバー専用環境変数 — Server Components / Actions / Middleware からのみ import すること
function requireServerEnv(key: string): string {
  if (typeof window !== "undefined") {
    throw new Error(`Server-only env '${key}' accessed on client`);
  }
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const serverEnv = {
  get SUPABASE_SERVICE_ROLE_KEY() {
    return requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
} as const;
