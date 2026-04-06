import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js App Router がハイドレーション用 inline script を生成するため unsafe-inline が必要。
      // nonce ベース CSP 移行は middleware + 全 Script タグへの nonce 付与が必要で v0.6.0 以降に検討。
      // 開発環境: Turbopack HMR に unsafe-eval が追加で必要
      process.env.NODE_ENV === "development"
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      // NEXT_PUBLIC_SUPABASE_URL 未設定時にワイルドカードを許可しない
`connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co"}`,
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
