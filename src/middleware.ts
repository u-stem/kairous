import { updateSession } from "@/lib/supabase/middleware";
import { buildCspHeader } from "@/lib/csp";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
    "base64",
  );
  const cspHeader = buildCspHeader(nonce);

  // Server Component が headers() 経由で nonce を読み取れるようにする
  request.headers.set("x-nonce", nonce);

  const response = await updateSession(request);

  // ブラウザに CSP を適用する
  response.headers.set("Content-Security-Policy", cspHeader);

  return response;
}

export const config = {
  matcher: [
    // middleware の実行コストを抑えるため、静的アセットを対象外にする
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
