# Clipt

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
