import type { Config } from "tailwindcss";

// Tailwind v4 is CSS-first — most theme config now lives in globals.css under
// @theme. We keep this file thin: content globs + the dark-mode toggle that
// pairs with our [data-theme="dark"] convention on <html>. Color tokens are
// re-declared here in case a downstream tool (Tailwind IntelliSense) needs
// them, but the runtime source of truth is tokens.css / @theme.

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg))",
        surface: "hsl(var(--surface))",
        "surface-elevated": "hsl(var(--surface-elevated))",
        "border-subtle": "hsl(var(--border-subtle))",
        "border-strong": "hsl(var(--border-strong))",
        content: {
          primary: "hsl(var(--content-primary))",
          secondary: "hsl(var(--content-secondary))",
          tertiary: "hsl(var(--content-tertiary))",
        },
        accent: {
          50: "hsl(var(--accent-50))",
          100: "hsl(var(--accent-100))",
          200: "hsl(var(--accent-200))",
          300: "hsl(var(--accent-300))",
          400: "hsl(var(--accent-400))",
          500: "hsl(var(--accent-500))",
          600: "hsl(var(--accent-600))",
        },
        success: "hsl(var(--success))",
        danger: "hsl(var(--danger))",
        warning: "hsl(var(--warning))",
        "focus-ring": "hsl(var(--focus-ring))",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
