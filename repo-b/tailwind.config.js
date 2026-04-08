/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}"
  ],
  darkMode: ["selector", "html:not([data-theme='light'])"],
  theme: {
    extend: {
      colors: {
        bm: {
          bg: "hsl(var(--bm-bg) / <alpha-value>)",
          bg2: "hsl(var(--bm-bg-2) / <alpha-value>)",
          surface: "hsl(var(--bm-surface) / <alpha-value>)",
          surface2: "hsl(var(--bm-surface-2) / <alpha-value>)",
          "surface-alt": "var(--bm-surface-alt)",
          "surface-hi": "var(--bm-surface-hi)",
          border: "hsl(var(--bm-border) / <alpha-value>)",
          borderStrong: "hsl(var(--bm-border-strong) / <alpha-value>)",
          "border-hi": "var(--bm-border-hi)",
          text: "hsl(var(--bm-text) / <alpha-value>)",
          "text-secondary": "var(--bm-text-secondary)",
          muted: "hsl(var(--bm-text-muted) / <alpha-value>)",
          muted2: "hsl(var(--bm-text-muted-2) / <alpha-value>)",
          accent: "hsl(var(--bm-accent) / <alpha-value>)",
          accent2: "hsl(var(--bm-accent-2) / <alpha-value>)",
          accentContrast: "hsl(var(--bm-accent-contrast) / <alpha-value>)",
          success: "hsl(var(--bm-success) / <alpha-value>)",
          warning: "hsl(var(--bm-warning) / <alpha-value>)",
          danger: "hsl(var(--bm-danger) / <alpha-value>)",
          purple: "var(--bm-purple)",
          pink: "var(--bm-pink)",
          ring: "hsl(var(--bm-focus-ring) / <alpha-value>)",
          // Signal layers
          "layer-reality": "var(--bm-layer-reality)",
          "layer-data": "var(--bm-layer-data)",
          "layer-narrative": "var(--bm-layer-narrative)",
          "layer-positioning": "var(--bm-layer-positioning)",
          "layer-meta": "var(--bm-layer-meta)",
        },
        pds: {
          bg: "hsl(var(--pds-bg-primary) / <alpha-value>)",
          panel: "hsl(var(--pds-bg-panel) / <alpha-value>)",
          card: "hsl(var(--pds-bg-card) / <alpha-value>)",
          divider: "hsl(var(--pds-divider) / <alpha-value>)",
          accent: "hsl(var(--pds-accent) / <alpha-value>)",
          accentSoft: "hsl(var(--pds-accent-soft) / <alpha-value>)",
          accentText: "hsl(var(--pds-accent-text) / <alpha-value>)",
          signalGreen: "hsl(var(--pds-signal-green) / <alpha-value>)",
          signalYellow: "hsl(var(--pds-signal-yellow) / <alpha-value>)",
          signalOrange: "hsl(var(--pds-signal-orange) / <alpha-value>)",
          signalRed: "hsl(var(--pds-signal-red) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "monospace"],
        editorial: ["var(--font-editorial)", "Georgia", "Cambria", "serif"],
      },
      borderRadius: {
        lg: "0.375rem",
        xl: "0.375rem",
        "2xl": "0.375rem",
      },
      backgroundColor: {
        "bm-accent-bg": "var(--bm-accent-bg)",
        "bm-success-bg": "var(--bm-success-bg)",
        "bm-danger-bg": "var(--bm-danger-bg)",
        "bm-warning-bg": "var(--bm-warning-bg)",
        "bm-purple-bg": "var(--bm-purple-bg)",
      },
      borderColor: {
        "bm-accent-border": "var(--bm-accent-border)",
        "bm-success-border": "var(--bm-success-border)",
        "bm-danger-border": "var(--bm-danger-border)",
        "bm-warning-border": "var(--bm-warning-border)",
        "bm-glow": "var(--bm-border-glow, transparent)",
      },
      boxShadow: {
        "bm-glow": "0 0 4px hsl(var(--bm-accent) / 0.2), 0 4px 12px -8px rgba(0, 0, 0, 0.4)",
        "bm-card": "0 0 0 1px hsl(var(--bm-border) / 0.06), 0 12px 24px -18px rgba(6, 9, 14, 0.55)",
        "bm-sm": "var(--bm-shadow-sm)",
        "bm-md": "var(--bm-shadow-md)",
        "bm-lg": "var(--bm-shadow-lg)",
      },
      backgroundImage: {
        "bm-vignette":
          "linear-gradient(180deg, hsl(var(--bm-bg-2) / 1), hsl(var(--bm-bg) / 1))",
      },
      transitionDuration: {
        fast: "120ms",
        panel: "200ms",
      },
      keyframes: {
        "winston-spin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "winston-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "winston-fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "winston-dot-pulse": {
          "0%, 80%, 100%": { opacity: "0.3", transform: "scale(0.8)" },
          "40%": { opacity: "1", transform: "scale(1)" },
        },
        // ── Winston Loader — bowtie physics keyframes ──────────────────────
        //
        // The bowtie IS the animation. No outer rings. No orbiting elements.
        // Each keyframe set encodes a physical motion story.
        //
        // "loader-spin-fast": energetic spin-up. Starts slightly compressed
        // (scale 0.92) to imply inertia gathering, quickly reaches full
        // angular velocity. 3s loop with strong ease-in-out boundary so the
        // loop junction feels like momentum, not a restart.
        "loader-spin-fast": {
          "0%":   { transform: "rotate(0deg) scale(0.92)" },
          "8%":   { transform: "rotate(72deg) scale(1)" },
          "100%": { transform: "rotate(360deg) scale(1)" },
        },
        //
        // "loader-spin-slow": still rotating but friction is clearly winning.
        // Shaped easing makes each revolution feel like it costs a little more.
        // Tiny scale breath at apex gives it weight.
        "loader-spin-slow": {
          "0%":   { transform: "rotate(0deg) scale(1)" },
          "45%":  { transform: "rotate(180deg) scale(1.03)" },
          "100%": { transform: "rotate(360deg) scale(1)" },
        },
        //
        // "loader-think": controlled rocking — Winston considering.
        // ±18° oscillation. Slow, deliberate, asymmetric timing feels cognitive.
        "loader-think": {
          "0%":   { transform: "rotate(0deg)" },
          "30%":  { transform: "rotate(18deg)" },
          "65%":  { transform: "rotate(-18deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
        //
        // "loader-settle": the money shot — bowtie decelerates, overshoots by
        // 6°, corrects back to 0°. Feels like a real object with rotational
        // inertia finding rest. Applied once on transition to complete.
        "loader-settle": {
          "0%":   { transform: "rotate(0deg) scale(1)" },
          "55%":  { transform: "rotate(-6deg) scale(1.06)" },
          "78%":  { transform: "rotate(4deg) scale(1.03)" },
          "90%":  { transform: "rotate(-2deg) scale(1.01)" },
          "100%": { transform: "rotate(0deg) scale(1)" },
        },
        //
        // "loader-appear": entrance — scales up from 0.65 with tiny rotation
        // kick so it doesn't feel like a pop.
        "loader-appear": {
          "0%":   { opacity: "0", transform: "scale(0.65) rotate(-20deg)" },
          "60%":  { opacity: "1", transform: "scale(1.04) rotate(4deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(0deg)" },
        },
        //
        // "loader-idle-breath": very subtle scale/opacity pulse for idle-ready state.
        "loader-idle-breath": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%":      { transform: "scale(1.04)", opacity: "0.88" },
        },
        //
        // "loader-arrival-ring": confirmation ripple on FAB when loader lands.
        "loader-arrival-ring": {
          "0%":   { transform: "scale(1)", opacity: "0.5" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
      },
      animation: {
        "winston-spin": "winston-spin 2s linear infinite",
        "winston-glow": "winston-glow 2.4s ease-in-out infinite",
        "winston-fade-in": "winston-fade-in 0.2s ease-out",
        "winston-dot-1": "winston-dot-pulse 1.4s ease-in-out infinite 0s",
        "winston-dot-2": "winston-dot-pulse 1.4s ease-in-out infinite 0.2s",
        "winston-dot-3": "winston-dot-pulse 1.4s ease-in-out infinite 0.4s",
        // Winston Loader animations — bowtie physics
        // Fast spin: 1.1s per revolution, cubic ease-in-out so boundaries feel like momentum
        "loader-spin-fast": "loader-spin-fast 1.1s cubic-bezier(0.4,0,0.2,1) infinite",
        // Slow spin: 2.8s per revolution, stronger ease-out implies drag/friction
        "loader-spin-slow": "loader-spin-slow 2.8s cubic-bezier(0.25,0.1,0.1,1) infinite",
        // Thinking rock: 3.2s per cycle, ease-in-out for smooth back-and-forth
        "loader-think": "loader-think 3.2s ease-in-out infinite",
        // Settle: plays once on complete — 700ms, spring-like overshoot easing
        "loader-settle": "loader-settle 0.7s cubic-bezier(0.34,1.2,0.64,1) forwards",
        // Appear: entrance animation — 280ms
        "loader-appear": "loader-appear 0.28s cubic-bezier(0.34,1.4,0.64,1) forwards",
        // Idle breath: very slow, subtle — 4s cycle
        "loader-idle-breath": "loader-idle-breath 4s ease-in-out infinite",
        // Arrival ring: one-shot ripple when loader resolves into FAB
        "loader-arrival-ring": "loader-arrival-ring 0.9s ease-out forwards",
      },
    }
  },
  plugins: []
};
