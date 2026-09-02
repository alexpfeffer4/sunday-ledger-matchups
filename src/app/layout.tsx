import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { RouteFocusManager } from "@/components/navigation/route-focus-manager";
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
  metadataBase: new URL("https://sunday-ledger-matchups.vercel.app"),
  title: {
    default: "Sunday Ledger",
    template: "%s · Sunday Ledger",
  },
  description:
    "Private NFL matchup leagues where equal weekly virtual credits turn real lines into head-to-head scores.",
  openGraph: {
    title: "Sunday Ledger",
    description:
      "Private NFL head-to-head matchups using virtual credits. No cash wagering.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sunday Ledger",
    description:
      "Private NFL head-to-head matchups using virtual credits. No cash wagering.",
  },
};

export const viewport: Viewport = {
  themeColor: "#214e3e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Suspense fallback={null}>
          <RouteFocusManager />
        </Suspense>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div
          className="flex min-h-full flex-1 flex-col"
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </div>
      </body>
    </html>
  );
}
