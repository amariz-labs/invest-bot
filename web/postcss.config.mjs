// Tailwind v4 ships its own PostCSS plugin (`@tailwindcss/postcss`).
// No autoprefixer step required — v4 handles browser-targeting internally.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
