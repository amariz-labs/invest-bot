import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";

// Inter is the variable UI font; JetBrains_Mono for raw numerics (order books,
// tx hashes, log lines). See DASHBOARD-BRIEF.md §2. We use next/font/google for
// both to avoid a dep on the separate `geist` package — JetBrains_Mono ships
// in next/font/google out of the box.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
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
      className={`${inter.variable} ${mono.variable}`}
    >
      <body className="bg-bg text-content-primary antialiased">
        <Suspense>{children}</Suspense>
      </body>
    </html>
  );
}
