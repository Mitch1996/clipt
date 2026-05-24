// Tailwind config for the mobile app. Mirrors the web app's brand
// tokens (apps/web/src/app/globals.css) — same near-black canvas +
// electric currency-yellow accent + mint for settled money — but
// expressed as direct hex colors because NativeWind 4 doesn't
// resolve CSS variables on React Native (no DOM, no :root).
//
// Token policy is the same:
//   - background / foreground / card / muted: greyscale near-black
//   - accent: #FFE600 (CTAs, focus, emphasis)
//   - mint: #34D399 (settled money ONLY — payouts, splits)

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        foreground: "#fafafa",
        card: "#0f0f0f",
        "card-foreground": "#fafafa",
        muted: "#1a1a1a",
        "muted-foreground": "#a3a3a3",
        border: "#242424",
        accent: {
          DEFAULT: "#FFE600",
          foreground: "#0a0a0a",
        },
        mint: {
          DEFAULT: "#34D399",
          foreground: "#0a0a0a",
        },
        destructive: {
          DEFAULT: "#e54848",
          foreground: "#ffffff",
        },
      },
      fontFamily: {
        sans: ["System"],
        mono: ["Menlo", "Courier", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
      },
    },
  },
  plugins: [],
};
