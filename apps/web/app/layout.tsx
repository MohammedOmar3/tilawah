import type { Metadata, Viewport } from "next";
import { Amiri_Quran, Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// Self-hosted at build time by next/font: no request reaches Google at runtime.
const amiriQuran = Amiri_Quran({
  variable: "--font-amiri-quran",
  weight: "400",
  subsets: ["arabic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quran Global",
  description: "One Quran. One moment. A world listening together.",
  icons: { apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
};

export const viewport: Viewport = {
  themeColor: "#070b12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${amiriQuran.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg text-fg">{children}</body>
    </html>
  );
}
