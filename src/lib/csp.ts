// nonce ベース CSP で unsafe-inline を排除し、XSS 耐性を高める
export function buildCspHeader(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";

  const directives = [
    "default-src 'self'",
    // strict-dynamic: nonce 付きスクリプトが読み込むスクリプト (Next.js チャンク含む) を自動許可
    `script-src 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${supabaseUrl}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "frame-ancestors 'none'",
  ];

  return directives.join("; ");
}
