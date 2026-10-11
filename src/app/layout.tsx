import type { Metadata, Viewport } from "next";
import { Caveat, DM_Serif_Display, Geist, Geist_Mono, Space_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSerif = DM_Serif_Display({
  variable: "--font-dm",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const spaceMono = Space_Mono({
  variable: "--font-space",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "zyxcid — ukiyo",
  description:
    "Ukiyo (浮世) — dunia melayang tempat proyek-proyek GitHub Zyxcid menjadi pulau kecil yang mengapung. Jelajahi, kumpulkan bintangnya, dan sapa penghuninya.",
  keywords: [
    "Zyxcid",
    "ukiyo",
    "portfolio",
    "platformer 3D",
    "three.js",
    "GitHub projects",
  ],
  authors: [{ name: "Zyxcid" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "zyxcid — ukiyo",
    description:
      "Platformer 3D dunia melayang: kumpulkan bintang, double jump, dan dash.",
    siteName: "ukiyo",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#F2EDE3",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dmSerif.variable} ${spaceMono.variable} ${caveat.variable} antialiased bg-[#F2EDE3] text-[#1C1813]`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
