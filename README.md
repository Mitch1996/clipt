# Clipt

> **Read [CLAUDE.md](./CLAUDE.md) before changing anything.** It's the source of truth for stack, conventions, folder rules, and naming. The same content is rendered at [`/dev/conventions`](http://localhost:3000/dev/conventions) when the dev server is up.

Clipt is a content-clipping platform where streamers, fans, clippers, and brands all share in the value of every clip. Paste a Twitch / YouTube / Kick URL (or detect a live moment in real time) and Clipt produces a vertical, captioned, cryptographically attributed short — ready to post to TikTok, Reels, and YouTube Shorts. Earnings flow back to the original creator on every play.

## How to develop

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
pnpm format       # Prettier (write)
pnpm format:check # Prettier (check)
```

Copy `.env.example` to `.env.local` and fill in keys as features come online.

## Stack

- **Framework**: Next.js 15 (App Router) + TypeScript (strict)
- **Styling**: Tailwind CSS v3 + shadcn/ui (neutral base)
- **Lint/Format**: ESLint (flat config) + Prettier
- **Package manager**: pnpm
- **Import alias**: `@/*` → `src/*`

Backend / infra (wired in later prompts):

- Supabase (Postgres + Auth + Storage + Realtime)
- Inngest (background jobs)
- Cloudflare R2 (object storage)
- Fly.io (Python video workers — ffmpeg + Whisper + MediaPipe)
- Stripe (subscriptions + Connect)
- Vercel (web hosting)

## Repo layout

```
src/
  app/                 routes (App Router)
  components/
    ui/               shadcn primitives
    shared/           project-shared components (Logo, Nav, Footer, ThemeToggle)
  features/            feature-scoped modules ({components, server, client, schema, types})
  lib/                 utilities and clients
  types/               shared TypeScript types
```

The Clipt prompt pack (the source-of-truth playbook for every feature increment) lives in `_prompt-pack/`.

## Database

Schema lives in `supabase/migrations/`. We use [Supabase](https://supabase.com)
for Postgres, Auth, Storage, and Realtime. The CLI is installed as a dev
dep — every command works through `pnpm db:*`.

### One-time setup (per developer)

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` — `https://<ref>.supabase.co` (project ref
     is the slug in the dashboard URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project settings → API
   - `SUPABASE_SERVICE_ROLE_KEY` — same screen (server-only, never
     imported in client code; the `import "server-only"` guard in
     `src/lib/supabase/admin.ts` keeps it out of the client bundle)
   - `SUPABASE_DB_URL` — pooled Postgres connection string. Copy from
     Project settings → Database → "Connection pooling" (use *Session*
     mode on port `5432`, not Transaction mode on `6543` — DDL needs
     session mode). URL-encode the password (`@` → `%40`, etc.).
3. Apply the migrations and pull types:
   ```bash
   pnpm db:push
   pnpm db:types
   ```

### Adding a migration

```bash
# Hand-author a file as supabase/migrations/000N_<short_name>.sql, OR
# capture a dashboard schema diff:
pnpm db:diff <short_name>

# Then apply + regenerate types:
pnpm db:push
pnpm db:types
```

### Resetting locally (Docker required)

`pnpm db:reset` re-applies every migration to the local Supabase stack.
Useful for testing migration order from a clean slate.

### Row Level Security

RLS is enabled on every table. The policy contract is documented at the
top of `0001_init.sql` and summarised here:

| Table | Read | Write |
|---|---|---|
| `profiles` | owner; public (any row, but client must select only `id, handle, display_name, avatar_url`); admin | owner (update); admin |
| `channels` | owner; admin | owner |
| `clips` | source creator, clipper; public when `status='ready'`; admin | source creator, clipper (update); admin |
| `clip_posts` | inherited via parent clip's read policy; admin | admin |
| `attributions` | original creator, clipper; admin | admin |
| `earnings_ledger` | owner; admin | admin |
| `waitlist` | admin | anyone (insert only) |
