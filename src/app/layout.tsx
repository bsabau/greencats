import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import type { ReactNode } from "react";
import { getI18n } from "@/i18n";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin", "latin-ext"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = { title: "Green Cats", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#faf7f2" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale } = await getI18n();
  return (
    <html lang={locale} className={figtree.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
