import type { NextConfig } from "next";

// Partial Prerendering is the key Next 15 feature for this dashboard:
// the static shell (KPI labels, layout) ships instantly, and the dynamic
// holes (chart, account data) stream in. See DASHBOARD-BRIEF.md §9.
const nextConfig: NextConfig = {
  experimental: {
    ppr: "incremental",
  },
  // The TradingView Charting Library is gated behind a license; users must
  // drop it into /public/charting_library/ themselves. We don't bundle it.
  // Allow large script files to be served as-is.
  reactStrictMode: true,
};

export default nextConfig;
