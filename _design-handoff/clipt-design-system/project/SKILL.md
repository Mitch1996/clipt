---
name: clipt-design
description: Use this skill to generate well-branded interfaces and assets for Clipt — the content-clipping platform where streamers, clippers, fans and brands all share in clip earnings. Tagline "Every clip pays the creator." Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. The single most useful entry point is `colors_and_type.css` — it carries every shadcn token in HSL form for both light and dark modes plus the `pulse-attribution` keyframe. Pair it with `ui_kits/web/components.jsx` for the Logo / Button / Badge / AttributionBadge / ThemeToggle / StatStrip primitives.

If working on production code (Tailwind v3 + shadcn), copy the `theme.extend` block from `tailwind.config.snippet.js` into your tailwind config, and migrate the `:root` and `.dark` variable blocks from `colors_and_type.css` into your `globals.css`. The variable names match shadcn's defaults exactly; `--mint` is a Clipt extension for payouts / attribution UI.

Brand rules to enforce:
- **Mint is money.** Use it only on payouts, earnings, splits, and verified-attribution badges — never as decoration.
- **Purple is action.** Every primary CTA, the focus ring, and the verified-attribution badge live in purple.
- **Navy is authority.** Nav and dense surfaces.
- **Sentence case** in all UI copy.
- **No emoji** in product chrome; SVG icons only (Lucide as substitute set).
- **The wordmark dot is sacred** — keep `<circle id="dot">` as a separate node so it can pulse.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
