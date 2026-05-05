# CLAUDE.md

> **Read this before changing anything.** This file is the source of truth for
> how the Clipt codebase is shaped. The same content is rendered at
> [`/dev/conventions`](http://localhost:3000/dev/conventions) for human reading.

## Project

**Clipt** is a content-clipping platform where streamers, fans, clippers, and
brands all share in clip earnings. Tagline: *"Every clip pays the creator."*

We serve four user types and the system has to feel right for each:

| Persona | What they do on Clipt |
| --- | --- |
| **Streamer / creator** | Connects their Twitch / YouTube / Kick channel; receives a share of every clip and every paid placement off their footage. |
| **Fan** | Watches a live stream and one-taps to clip the last 30 seconds; gets credit and (later) tipping. |
| **Clipper** | Browses a marketplace of paid campaigns; produces clips; gets paid per verified view. |
| **Brand** | Funds clipping campaigns with KYC'd clippers, automated FTC disclosure, and audit-grade reports. |

The build is sequenced through the prompt pack at [_prompt-pack/CLIPT_PROMPT_PACK.md](./_prompt-pack/CLIPT_PROMPT_PACK.md) — each
"Prompt N.M" is one shippable increment. Don't skip ahead.

## Stack

- **Framework**: Next.js 15 (App Router) + TypeScript (strict)
- **Styling**: Tailwind v3 + shadcn/ui (vendored manually in classic Radix
  style, see note below); Geist Sans + Geist Mono via `next/font`
- **Database / auth / storage**: Supabase (Postgres + Auth + Storage + Realtime)
- **Background jobs**: Inngest
- **Object storage**: Cloudflare R2 (S3-compatible)
- **Heavy video work**: Python FastAPI workers on Fly.io (ffmpeg, faster-whisper,
  MediaPipe). Lives in `workers/video/` once Phase 1.8 lands.
- **Payments**: Stripe (Subscriptions + Connect Express)
- **Hosting**: Vercel (web), Fly.io (workers)
- **Mobile (Phase 3+)**: Expo (React Native) under `apps/mobile/`

> **shadcn note.** The current `shadcn@latest` CLI ships only Tailwind v4 +
> `@base-ui/react` components, which are incompatible with our pinned
> Tailwind v3. All components in `src/components/ui/` are vendored by hand
> in the classic Radix-Slot + HSL CSS-variable style. `components.json` is
> set to `style: "default"`; if you need a new primitive, vendor it
> manually following the existing files' shape.

## Conventions

### Server / client split

- Default to **server components**. Mark a file with `"use client"` only when
  it actually needs hooks, browser APIs, or event handlers.
- Mutations go through **server actions** in `src/features/<feature>/server/`.
  Don't reach for route handlers (`route.ts`) for mutations.
- `route.ts` files exist only for: webhooks (Stripe, Inngest, OAuth providers),
  third-party OAuth callbacks, and the `/api/inngest` register endpoint.

### Forms

- Every form uses `react-hook-form` + `zod`.
- The zod schema for a feature lives at `src/features/<feature>/schema.ts` and
  is shared between the client form and the server action that consumes it.

### Supabase clients

- **Always** import from `@/lib/supabase/{client,server,admin}`. Never
  `new SupabaseClient()` inline.
  - `client.ts` — browser, anon-keyed, for `"use client"` code.
  - `server.ts` — SSR/server-action, anon-keyed, cookies-aware. Async — call
    `await createClient()`.
  - `admin.ts` — service-role, **server only**. Refuses to bundle into the
    client via `import "server-only"`. Never import from `"use client"` or
    from anything that ends up in the browser bundle.
- Generated types live at `src/types/database.ts`. Regenerate after every
  migration via `pnpm db:types`.

### Styling

- **Never** hardcode hex colors in component code. Always reference Tailwind
  tokens (`bg-accent`, `text-mint`, `border-border`) which resolve through
  CSS variables in `src/app/globals.css`.
- The accepted aesthetic for Clipt: near-black canvas, electric currency-yellow
  accent, mint reserved exclusively for *settled* money, hairline borders,
  `0.5rem` radius, no gradient mesh / grain. See
  [src/app/globals.css](./src/app/globals.css) for the canonical token set.

### Database

- Every schema change is a **migration** in `supabase/migrations/000N_*.sql`.
  No ad-hoc edits in the dashboard — those silently drift.
- RLS is on for every table. New tables must declare policies in the same
  migration. Use the `public.is_admin(uuid)` helper (security-definer) for
  admin-gating; never inline a `select from profiles` subquery in a policy
  on `profiles` itself — it recurses.
- After applying a migration, run `pnpm db:types` and commit the regenerated
  `src/types/database.ts` in the same PR.

### Background jobs

- Inngest functions live at `src/inngest/functions/<name>.ts` and are
  re-exported from `src/inngest/functions/index.ts`. Each function uses
  `step.run` so individual steps can retry on their own.
- Triggers fire via the Inngest client, never via direct cron or `setTimeout`.

### Tests

- **Unit / integration**: Vitest. Files live next to the code as
  `*.test.ts` or under `__tests__/`. Vitest is set up in Phase 1+ — flag if
  it's still missing when you need it.
- **End-to-end**: Playwright, also Phase 1+.

### Folder rules

```
src/
  app/                       routes (App Router) — thin shells that delegate
    api/                     route handlers (webhooks, OAuth, Inngest only)
    (dashboard)/             grouped routes for the authed product surface
    dev/                     developer-only utility routes (/dev/health, etc.)
  components/
    ui/                      shadcn primitives (vendored manually)
    shared/                  project-shared (Logo, ThemeToggle, ThemeProvider)
  features/<feature>/        feature-scoped module:
    components/              client + server components for the feature
    server/                  server actions
    schema.ts                zod schemas (shared between client + server)
    types.ts                 feature-local TS types
  hooks/                     reusable client hooks (e.g. use-toast)
  lib/                       cross-cutting utilities + clients
    supabase/                Supabase client factories
    storage/                 R2 helpers (Phase 1.6)
    crypto/                  encryption + signing helpers (Phase 1.2 / 1.11)
    workers/                 typed clients to call Fly workers (Phase 1.8)
    entitlements.ts          plan-gating logic (Phase 1.15)
  inngest/                   Inngest client + functions
  types/                     shared TS types (database.ts is generated)
supabase/migrations/         SQL migrations
scripts/                     dev tooling (db.mjs, etc.)
public/                      static assets
_prompt-pack/                the source-of-truth playbook (don't edit)
_design-handoff/             Claude Design exports (reference only)
```

Routes in `src/app/` are thin: they import a feature's components / actions
and arrange them. They don't contain business logic.

### Naming

| What | Style |
| --- | --- |
| File names (TS/TSX) | kebab-case (`use-toast.ts`, `theme-provider.tsx`) — except React components which are PascalCase (`Logo.tsx`, `ThemeToggle.tsx`) when the file exports a single component named the same |
| React components | PascalCase |
| Variables / functions | camelCase |
| Database tables / columns | snake_case |
| TypeScript types / interfaces | PascalCase |
| Env vars | SCREAMING_SNAKE_CASE; client-exposed keys must start with `NEXT_PUBLIC_` |
| Inngest event names | `domain/event-name` (e.g. `clip/requested`, `clip/captions-updated`) |

### Commit style

[Conventional Commits](https://www.conventionalcommits.org). Allowed prefixes:
`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`. The body is
expected for non-trivial changes — describe the *why*, not the *what*. Tag the
prompt-pack reference in the subject when the commit closes a Prompt N.M
(`feat: supabase setup + initial schema (Prompt 0.3)`).

### Dependencies

- Package manager is **pnpm**. Use `pnpm add` / `pnpm add -D`. The lockfile is
  authoritative; don't hand-edit it.
- New runtime deps need a real reason. If you're tempted to add a library for
  one helper function, write the helper.
- Server-only deps that handle secrets (`stripe`, `@aws-sdk/*`, `inngest`, the
  `supabase` admin client) must never appear in a `"use client"` import chain.

### When uncertain

Prefer clarity over cleverness. This codebase is being built solo with heavy
AI assistance — the next person reading this code might be future-you a month
from now or a Claude Code session that lacks all of today's context. Optimize
for someone who has read this file once and is now staring at one new file.
