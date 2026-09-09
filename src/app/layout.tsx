import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { RegisterSW } from "@/components/pwa/register-sw";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Thời khóa biểu — Trường PTDTBT TH & THCS Măng Cành",
    template: "%s",
  },
  description:
    "Thời khóa biểu điện tử Trường PTDTBT TH & THCS Măng Cành, năm học 2026–2027.",
};

/** viewportFit: cover unlocks env(safe-area-inset-*) for fixed bottom
 *  surfaces (bottom sheets, student bottom nav). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
