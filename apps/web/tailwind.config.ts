import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        // Custom — Clipt's "money" color (payouts, attribution, splits)
        mint: {
          DEFAULT: "hsl(var(--mint))",
          foreground: "hsl(var(--mint-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        "brand-sm": "var(--shadow-sm)",
        "brand-md": "var(--shadow-md)",
        "brand-lg": "var(--shadow-lg)",
        glow: "var(--shadow-glow)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-attribution": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 0 hsl(var(--accent) / 0.55), 0 0 0 0 hsl(var(--accent) / 0)",
            transform: "scale(1)",
          },
          "50%": {
            boxShadow:
              "0 0 0 6px hsl(var(--accent) / 0.18), 0 0 18px 2px hsl(var(--accent) / 0.45)",
            transform: "scale(1.03)",
          },
        },
        "pulse-dot": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.25)", opacity: "0.85" },
        },
        // Hero headline underline draws in from the left on mount.
        // Kept tiny on purpose — one tasteful WOW moment, not a parade.
        "underline-draw": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        // Hero clip card subtle hover-lift (replaces the lifeless hairline
        // border with one moment of physicality).
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-attribution": "pulse-attribution 2s ease-in-out infinite",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "underline-draw": "underline-draw 700ms cubic-bezier(0.65,0,0.35,1) 200ms both",
        "fade-up": "fade-up 600ms cubic-bezier(0.16,1,0.3,1) 100ms both",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
