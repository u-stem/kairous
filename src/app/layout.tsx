import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

// a11y: pinch zoom 禁止は低視力ユーザーの閲覧を阻害するため maximumScale: 5 で許可する
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  title: "Kairous",
  description: "Learn smarter with science-backed methods",
  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <html
      lang="ja"
      className={cn("font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          メインコンテンツへスキップ
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
          <Toaster />
        </ThemeProvider>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(function(e) { console.warn('SW registration failed:', e); });
      }
    `,
          }}
        />
      </body>
    </html>
  );
}
