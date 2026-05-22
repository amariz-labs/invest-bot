import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { Suspense } from "react";
import "./globals.css";

// Inter is the variable UI font; Geist Mono for raw numerics (order books,
// tx hashes, log lines). See DASHBOARD-BRIEF.md §2.
//
// Geist's `next/font` package isn't installed by default — if `geist` isn't
// available, swap to `next/font/google`'s JetBrains_Mono. We use Geist here
// because it's the modern default that ships with `create-next-app`.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Financial Planner — Dashboard",
  description: "Voltrex-styled equities, ETF, and index trading dashboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${GeistMono.variable}`}
    >
      <body className="bg-bg text-content-primary antialiased">
        <Suspense>{children}</Suspense>
      </body>
    </html>
  );
}
