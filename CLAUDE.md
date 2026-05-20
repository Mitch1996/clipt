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

- The Inngest **client** lives at `src/inngest/client.ts` and is the only
  place we instantiate it. Import `inngest` from there to send events.
- **Functions** live at `src/inngest/functions/<name>.ts` and are
  re-exported as a single array from `src/inngest/functions/index.ts`.
  Add new functions to that registry; the registry is what
  `/api/inngest` serves.
- Each function uses `step.run("step-name", async () => …)` for any
  side-effectful work so failures retry in isolation. Use
  `step.sleep(...)` for delays and `step.sleepUntil(...)` for scheduled
  posts.
- **Event names** are typed in `Events` at the top of `src/inngest/client.ts`.
  Add new events there before sending them so functions auto-complete the
  payload shape.
- Triggers fire via `await inngest.send(...)`, never via direct cron,
  `setTimeout`, or fetch-to-`/api/inngest`. Inngest handles ordering,
  retries, and durable execution.

#### Local dev

Two terminals: `pnpm dev` (Next, port 3006) and `pnpm inngest:dev`
(Inngest dev server at `127.0.0.1:8288`, configured to talk to
`/api/inngest`). The dev server is unauthenticated and discovers
functions automatically — you don't need the prod signing key locally.

A debug page at `/dev/inngest` triggers `clip/requested` against a
freshly-inserted dummy clip so you can confirm the wiring without
running through the full pipeline.

### Object storage

- All clip artifacts live in **one private bucket** (`clipt-media`),
  accessed through `src/lib/storage/r2.ts`. The facade is named after
  Cloudflare R2 (the eventual prod backend); it currently writes to
  Supabase Storage during dev because R2 requires a credit card on
  Cloudflare. The swap is one file when the time comes.
- **Bucket layout** (`StorageKeys` in `r2.ts` is the single source of truth):
  | Path | Contents |
  | --- | --- |
  | `sources/{clipId}.{ext}` | original Twitch / YouTube / Kick mp4 |
  | `verticals/{clipId}.mp4` | 9:16 reframed export with burned captions |
  | `thumbnails/{clipId}.jpg` | poster frame |
  | `captions/{clipId}.json` | word-timed captions |
- Server-side writes use the service-role admin client (bypasses RLS)
  via `putObject(key, body, contentType)`.
- All reads should use `getSignedDownloadUrl(key, expiresInSec)` — never
  expose direct keys to the client. The 1-hour default TTL is right for
  most product flows; extend it (up to 7 days) for embeddable links.
- `getSignedUploadUrl(...)` is for client-direct uploads (Phase 3 mobile
  capture). Server actions and Inngest functions should prefer
  `putObject` so they don't pay the round-trip.

### Verified attribution

- Every `ready` clip carries an Ed25519-signed JWT in
  `clips.attribution_signature`. Payload bundles the proof of origin:
  `clipId`, `sourceChannelId`, `originalCreatorProfileId`,
  `sourcePlatform`, `sourceUrl`, `sourceStartSec`, `sourceEndSec`,
  `issuedAt`. Issuer = `clipt.live`, audience = `clipt-attribution-v1`.
- **Signing** is `signAttribution(payload)` in
  `src/lib/attribution/sign.ts`. Private key lives in
  `ATTRIBUTION_SIGNING_KEY` (base64-encoded PKCS8 DER). The Inngest
  `process-clip` function calls it as the `sign-attribution` step, then
  passes the JWT into the worker's reframe call so ffmpeg can embed it
  in the output mp4 via `-metadata clipt_attribution=<jwt>`.
- **Verification** is `verifyAttribution(token)` in
  `src/lib/attribution/verify.ts`. Reads the public key from
  `/.well-known/clipt-attribution-public-keys.json` (a JWKS array
  supporting multiple historical keys) or the single-key file at
  `/.well-known/clipt-attribution-public-key`. Both are static files
  served from `apps/web/public/.well-known/`.

#### Key rotation

The signing key is rotated annually (or immediately if compromise is
suspected). Procedure:

1. **Generate the new keypair** with the script (writes the new
   public-key files and prints the private key):
   ```bash
   node scripts/generate-attribution-key.mjs --write
   ```
   This prepends a new entry into
   `apps/web/public/.well-known/clipt-attribution-public-keys.json`,
   marking the old current key with `validUntil = <now ISO>`. The
   single-key file at
   `apps/web/public/.well-known/clipt-attribution-public-key` is
   overwritten with the new key.
2. **Paste the printed private key into the production env** as
   `ATTRIBUTION_SIGNING_KEY`. Keep the old value somewhere recoverable
   for at most 24h in case rollback is needed.
3. **Deploy** — once the JWKS file is live, every clip signed AFTER
   the rotation uses the new key. Verifiers walk the JWKS array, so
   clips signed by the old key still verify until that key is removed
   from the array.
4. **Prune** old keys from the JWKS array only when no clip in the
   wild was signed with that key — practically, remove a key on the
   anniversary of the rotation that retired it.
5. **Commit** the public-key file changes; the JWKS is the public
   source of truth.

### Tests

- **Unit / integration**: Vitest. Files live next to the code as
  `*.test.ts` or under `__tests__/`. Run via `pnpm test` (root) or
  `pnpm --filter @clipt/web test`. The current attribution suite
  exercises sign/verify round-trip, wrong-key rejection, tamper
  detection, wrong-audience rejection, and JWKS-file format.
- **End-to-end**: Playwright, lands later in Phase 1.

### Folder rules

The repo is a **pnpm workspace** (`pnpm-workspace.yaml` at root) with
two packages:

```
.                              repo root — supabase + scripts + docs live here
├── pnpm-workspace.yaml        declares packages: ['apps/*']
├── package.json               root scripts that delegate via pnpm --filter
├── supabase/migrations/       SQL migrations (project-wide, single source)
├── scripts/                   dev tooling (db.mjs reads apps/web/.env.local)
├── _prompt-pack/              the source-of-truth playbook (don't edit)
├── _design-handoff/           Claude Design exports (reference only)
│
├── apps/web/                  Next.js 15 app (the @clipt/web package)
│   ├── src/
│   │   ├── app/               routes (App Router) — thin shells
│   │   │   ├── api/           route handlers (webhooks, OAuth, Inngest only)
│   │   │   ├── (dashboard)/   grouped routes for the authed product surface
│   │   │   └── dev/           developer-only utility routes (/dev/health, etc.)
│   │   ├── components/{ui,shared}/
│   │   ├── features/<feature>/{components,server,schema.ts,types.ts}
│   │   ├── hooks/             reusable client hooks
│   │   ├── lib/               cross-cutting utilities + clients
│   │   │   ├── supabase/      Supabase client factories
│   │   │   ├── storage/       R2 facade (Supabase Storage backed today)
│   │   │   ├── crypto/        encryption + signing helpers
│   │   │   └── workers/       typed clients for the Python worker (videoWorker.ts)
│   │   ├── inngest/           Inngest client + functions
│   │   └── types/             shared TS types (database.ts is generated)
│   ├── public/                static assets
│   ├── .env.local             web-app secrets (gitignored). The Python
│   │                          worker reads STORAGE_* from here too via
│   │                          its own env loader; only WORKER_HMAC_KEY
│   │                          must be the same on both sides.
│   └── package.json           name: "@clipt/web"
│
└── workers/video/             Python FastAPI service (the video worker)
    ├── app/
    │   ├── main.py            FastAPI entry; mounts /healthz + /jobs/*
    │   ├── auth.py            JWT verification (HS256, audience clipt-video-worker)
    │   ├── config.py          env loader (WORKER_HMAC_KEY + STORAGE_*)
    │   ├── storage.py         boto3 S3 helper (works with R2 + Supabase Storage)
    │   └── jobs/              one module per endpoint:
    │       ├── transcribe.py  Whisper captions      (stub today, Prompt 1.9)
    │       ├── reframe.py     9:16 + caption burn   (stub today, Prompt 1.10)
    │       └── download_youtube.py  yt-dlp pull     (stub today, Phase 2)
    ├── Dockerfile             python:3.12-slim + ffmpeg + tini
    ├── fly.toml               app=clipt-video-worker, region=ams, perf-1x/4GB
    └── requirements.txt
```

Routes in `apps/web/src/app/` are thin: they import a feature's
components / actions and arrange them. No business logic.

**Running locally** (three terminals from the repo root):
```
pnpm dev                                              # Next on :3006
pnpm inngest:dev                                      # Inngest dashboard on :8288
cd workers/video && WORKER_HMAC_KEY=… STORAGE_*=… \   # FastAPI worker on :8000
  ./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The worker is **not yet deployed** to Fly.io — the account requires
billing info we haven't added (same gate that blocked Cloudflare R2).
The Dockerfile + `fly.toml` are deploy-ready; when billing lands, run
`flyctl apps create clipt-video-worker --org personal && flyctl secrets set …
&& flyctl deploy` and update `VIDEO_WORKER_URL` in
`apps/web/.env.local` to point at the public Fly URL.

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
