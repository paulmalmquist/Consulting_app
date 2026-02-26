/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        bm: {
          bg: "hsl(var(--bm-bg) / <alpha-value>)",
          bg2: "hsl(var(--bm-bg-2) / <alpha-value>)",
          surface: "hsl(var(--bm-surface) / <alpha-value>)",
          surface2: "hsl(var(--bm-surface-2) / <alpha-value>)",
          border: "hsl(var(--bm-border) / <alpha-value>)",
          borderStrong: "hsl(var(--bm-border-strong) / <alpha-value>)",
          text: "hsl(var(--bm-text) / <alpha-value>)",
          muted: "hsl(var(--bm-text-muted) / <alpha-value>)",
          muted2: "hsl(var(--bm-text-muted-2) / <alpha-value>)",
          accent: "hsl(var(--bm-accent) / <alpha-value>)",
          accent2: "hsl(var(--bm-accent-2) / <alpha-value>)",
          accentContrast: "hsl(var(--bm-accent-contrast) / <alpha-value>)",
          success: "hsl(var(--bm-success) / <alpha-value>)",
          warning: "hsl(var(--bm-warning) / <alpha-value>)",
          danger: "hsl(var(--bm-danger) / <alpha-value>)",
          ring: "hsl(var(--bm-focus-ring) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "monospace"],
      },
      borderRadius: {
        lg: "0.375rem",
        xl: "0.375rem",
        "2xl": "0.375rem",
      },
      boxShadow: {
        "bm-glow": "0 0 4px hsl(var(--bm-accent) / 0.2), 0 4px 12px -8px rgba(0, 0, 0, 0.4)",
        "bm-card": "0 0 0 1px hsl(var(--bm-border) / 0.06), 0 12px 24px -18px rgba(6, 9, 14, 0.55)",
      },
      backgroundImage: {
        "bm-vignette":
          "linear-gradient(180deg, hsl(var(--bm-bg-2) / 1), hsl(var(--bm-bg) / 1))",
      },
      transitionDuration: {
        fast: "120ms",
        panel: "200ms",
      },
    }
  },
  plugins: []
};
