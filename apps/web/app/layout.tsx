import type { Metadata, Viewport } from "next";
import { Amiri, Amiri_Quran, Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import { SETTINGS_KEY } from "@/lib/settings";
import "./globals.css";

// Self-hosted at build time by next/font: no request reaches Google at runtime.
const ui = Plus_Jakarta_Sans({
  variable: "--font-ui",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

const amiriQuran = Amiri_Quran({
  variable: "--font-amiri-quran",
  weight: "400",
  subsets: ["arabic"],
  display: "swap",
});

// Surah names and the wordmark.
const amiri = Amiri({
  variable: "--font-amiri",
  weight: "700",
  subsets: ["arabic"],
  display: "swap",
});

// The translation, when one is configured.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["400", "500"],
  style: "italic",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Tilawah",
  description: "One Quran. One moment. A world listening together.",
  icons: { apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050913" },
    { media: "(prefers-color-scheme: light)", color: "#f5efe3" },
  ],
  colorScheme: "dark light",
  viewportFit: "cover",
};

// Applies the saved Night / Fajr choice before the first paint, so the page never
// flashes the other theme. Auto leaves data-theme unset and the CSS follows the device.
const themeScript = `try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||"{}").theme;if(t==="night"||t==="fajr")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${ui.variable} ${amiriQuran.variable} ${amiri.variable} ${cormorant.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-ink">{children}</body>
    </html>
  );
}
