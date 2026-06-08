import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReserveSightseen",
  description: "AI 旅行プランナー — 行き先検索から予約まで",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}