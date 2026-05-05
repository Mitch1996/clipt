# Clipt — Design System

> "Every clip pays the creator."

Clipt is a content-clipping platform where streamers, fans, clippers, and brands all share in clip earnings. This system is the source of truth for Clipt's visual + interaction language.

## Sources used

No codebase, Figma file or other materials were attached for this build. The system is derived from the brief alone:

- Canonical brand palette (navy / purple / mint / warning + neutrals)
- Inter, base radius `0.75rem`, custom `pulse-attribution` keyframe, wordmark with separable purple dot
- Light + dark theme tokens matching the shadcn variable contract

If you have a Figma file, repo, or product screenshots, drop them into Import — that lets a future pass tighten the UI kit against real product surfaces.

## Index

| File | What |
| --- | --- |
| `colors_and_type.css` | All design tokens: HSL CSS vars (`:root` + `.dark`), type scale, radius, shadow, spacing, `pulse-attribution` keyframe |
| `tailwind.config.snippet.js` | Drop-in `theme.extend` block for Tailwind v3 + shadcn |
| `fonts/inter.css` | Inter, weights 400–800, `display: swap` |
| `assets/logo.svg` · `logo-dark.svg` · `favicon.svg` | Wordmark with separable `<circle id="dot">` |
| `preview/` | Per-token / per-component cards rendered into the Design System tab |
| `ui_kits/web/` | Click-thru landing page demonstrating the system |
| `SKILL.md` | Skill manifest — works in this app and in Claude Code |

## Content fundamentals

- **Voice.** Plainspoken, crew-energy, declarative. Short sentences. The product takes a side: creators of all kinds deserve the cut. We say "every," "automatically," "together" a lot.
- **Person.** Direct second-person — "You went live." "We route the payouts." Rare "we" on infrastructure claims.
- **Casing.** Sentence case everywhere — buttons, headings, nav. Title Case feels corporate and we are not.
- **Numbers.** Always concrete. "$48.2M paid to creators" beats "millions earned." Tabular numbers in tables and stat strips.
- **Money.** Always with a unit, always in mint when it's an outcome ("$2,418.74 cashed out", "+ paid"). Never in mint when it's a cost.
- **Tagline rhythm.** "Stream. Clip. Earn together." Triplets with periods land. Use sparingly — once per page max.
- **No emoji.** Iconography is SVG. Emoji feels stream-chat-y in a way that undercuts trust around money.

## Visual foundations

- **Palette.** Navy is authority (nav, dense surfaces, primary in light mode). Purple is action (every CTA, focus ring, "verified attribution"). Mint is *only* money state — payouts, earnings, splits, attribution badges. Destructive red is reserved for removal flows.
- **Type.** Inter, Inter, Inter. Display weight 800, headings 700, body 400, UI labels 500–600. Display tracking is tight (-2.5% to -3%); body is normal. Tabular numerics in stats and tables.
- **Backgrounds.** Brand surface is a navy-tinted dark mode by default. The hero uses a soft mesh of purple + navy + a touch of mint via stacked radial gradients. A faint 56px grid is masked by a radial vignette so it fades out away from the focal point. No photo backgrounds in the marketing surface.
- **Cards.** 12px radius (`var(--radius)`), 1px border in `--border`, light shadow-sm at rest. They lift with `border-color: hsl(var(--accent) / 0.4)` on hover, never with shadow-jump.
- **Borders.** Always 1px. Color either `--border` (neutral) or `--accent / 0.4` (interactive emphasis). Never colored borders just for decoration.
- **Radii.** 8/10/12px ladder for sm/md/lg; 9999px (`full`) for badges and avatars only.
- **Shadows.** `sm` → cards, `md` → popovers and dropdowns, `lg` → dialogs and modals, `glow` → primary CTAs (purple bloom).
- **Hover states.** Buttons: 90% opacity for filled variants, `bg-muted` fill for ghost / outline. Links: underline appears on hover (offset-4).
- **Press states.** No scale-down. The focus ring (purple, 2px + 2px offset) is the affordance.
- **Animation.** Subtle and purposeful. `pulse-attribution` (2s ease-in-out infinite) on the verified-attribution badge when a payout settles. The wordmark dot has a matching `pulse-dot` it can use on first paint. All animations honor `prefers-reduced-motion`.
- **Transparency / blur.** Stat strip uses `bg-card/40 backdrop-blur-md` + a mint-tinted border so it floats over the mesh gradient. Reserve blur for elements layered on imagery or gradients.
- **Imagery.** Cool — leans navy / purple. Avoid warm photo treatments. We are not yet specifying a photo direction; flagging this for iteration.
- **Layout rules.** Marketing surfaces center on a 1280px max content width with 32px gutters. Stat strips use 3-up grids that collapse to stacked at md.

## Iconography

No icon library was provided, so the system links **Lucide** at the CDN as the substitute — same stroke weight (2px), same rounded line caps, plays well with Inter. Where preview cards needed inline icons, they use single-path SVGs in the same style. **Flag for iteration:** confirm Lucide is acceptable, or attach a custom set.

- **Primary library:** [Lucide](https://lucide.dev) — `https://unpkg.com/lucide@latest`
- **Stroke weight:** 2px, round caps + joins, 24px nominal viewbox
- **Sizes:** 14 (inline with body), 16 (button slot), 20 (nav), 24 (cards)
- **Color:** inherits `currentColor`. In a button, the icon takes the button's foreground.
- **Emoji:** never as a UI element; OK in user-generated content (stream chat).
- **Unicode glyphs:** acceptable for a single decorative tittle (the purple dot is a real `<circle>`, not "·"). Otherwise use SVG.
- **Logo:** treat the wordmark as the system's only proprietary asset. The `<circle id="dot">` is *the* brand element — keep it on a separate node so it can animate independently.
