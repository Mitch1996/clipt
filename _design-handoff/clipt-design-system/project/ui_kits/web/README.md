# Clipt — Web UI kit

A click-thru recreation of the Clipt marketing surface, built on the design tokens in `colors_and_type.css`.

## What's here

- `index.html` — landing page with nav, hero (mesh-gradient dark background, brand-purple CTA, mint stat strip), and a "chain" section that explains the 4-way payout split.
- `components.jsx` — `Logo`, `Button`, `Badge`, `AttributionBadge` (with the `pulse-attribution` keyframe), `ThemeToggle` (sun / moon / system), `StatStrip`.

## Notes

- The page boots in dark mode by default to match the brand brief; the `ThemeToggle` in the top nav switches it.
- The wordmark dot is a separate `<circle>` so it animates independently — it pulses on hero load.
- Tailwind is loaded via the CDN script with a config that maps the same `hsl(var(--…))` tokens shadcn uses, so a real Next.js + shadcn project can drop these components in unchanged.
