import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReserveSightseen",
  description: "AI 旅行プランナー — 行き先検索から予約まで",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "旅プラン",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="antialiased">
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}');
              `}
            </Script>
          </>
        )}
        {children}
        {/* Service Worker 登録（PWAインストール用・キャッシュなしのパススルー実装） */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if ("serviceWorker" in navigator) { window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); }); }`,
          }}
        />
      </body>
    </html>
  );
}
