# Clipt — Claude Code Prompt Pack

> **What this is:** A sequenced set of paste-ready prompts for building Clipt with Claude Code. Run them in order. Each prompt is self-contained and includes context, goal, stack constraints, and acceptance criteria.
>
> **How to use it:**
> 1. Open this file in your editor next to your terminal where Claude Code is running.
> 2. For each prompt, paste the block under **`PROMPT TO PASTE`** into Claude Code.
> 3. After Claude Code finishes, run the **`ACCEPTANCE CHECKS`** to verify.
> 4. If something's off, paste the failing acceptance check back to Claude Code and let it iterate.
>
> **Working philosophy:** Don't try to one-shot big features. Each prompt is one feature increment. Commit after every passing prompt.
>
> **Tech stack assumed by all prompts:**
> - Next.js 15 (App Router) + TypeScript + Tailwind v3 + shadcn/ui
> - Supabase (Postgres + Auth + Storage + Realtime)
> - Inngest for background jobs
> - Fly.io for video workers (Python + ffmpeg + ML)
> - Cloudflare R2 for video file storage
> - Stripe (subscriptions + Connect)
> - Vercel for web hosting
> - Expo (React Native) for mobile in Phase 3+

---

## Table of Contents

| Phase | Title | Prompts |
|-------|-------|---------|
| 0 | Foundation | 0.1 – 0.5 |
| 1 | Core Clipping (paste a URL → posted clip) | 1.1 – 1.13 |
| 2 | Live Capture (real-time AI clipping) | 2.1 – 2.4 |
| 3 | Mobile + Creator Economics | 3.1 – 3.4 |
| 4 | Brand Marketplace | 4.1 – 4.4 |
| 5 | Discovery & Scale | 5.1 – 5.3 |

---

# PHASE 0 — FOUNDATION

> **Outcome of this phase:** A deployable Next.js app at `clipt.tv` (or your domain) with a working landing page, waitlist, and the project conventions Claude Code will reuse for everything else.

---

## Prompt 0.1 — Initialize the project

**Goal:** Bootstrap a Next.js 15 project with TypeScript, Tailwind, shadcn/ui, ESLint, Prettier, and a clean folder structure.

**Context:**
- This is a brand-new repo. Nothing exists yet.
- We're optimizing for AI-assisted development: clear file boundaries, predictable conventions, generous types.

**PROMPT TO PASTE:**

```
You are setting up the foundation for Clipt — a content clipping platform.

Initialize a new Next.js 15 project in the current empty directory with:
- TypeScript (strict mode)
- App Router
- Tailwind CSS v3
- ESLint + Prettier with sensible defaults
- src/ directory layout
- pnpm as the package manager
- import alias: @/* → src/*

Then install and configure shadcn/ui (default style, neutral base color), and add these components: button, input, card, dialog, dropdown-menu, toast, label, textarea, tabs, badge, separator, skeleton.

Create the following folder structure under src/:
- app/                 (routes)
- components/          (UI components)
  - ui/               (shadcn primitives)
  - shared/           (project-shared components: Logo, Nav, Footer)
- lib/                 (utilities, clients)
- types/               (shared TypeScript types)
- features/            (feature-scoped modules; create empty for now)

Add a README.md with a one-paragraph description of Clipt and a "How to develop" section.

Add .env.example with placeholder keys we'll fill later: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, OPENAI_API_KEY, RESEND_API_KEY, ATTRIBUTION_SIGNING_KEY.

Initialize a git repo and commit with the message "chore: initial scaffold".

Do not add any business logic yet — only scaffolding.
```

**ACCEPTANCE CHECKS:**
- [ ] `pnpm dev` runs without errors and shows the Next.js welcome page.
- [ ] `pnpm lint` passes.
- [ ] `pnpm tsc --noEmit` passes.
- [ ] `src/components/ui/` contains the shadcn components.
- [ ] `.env.example` exists with all placeholder keys.

---

## Prompt 0.2 — Design system tokens & global theme

**Goal:** Wire the Clipt brand (deep navy + electric purple + mint) into Tailwind tokens and shadcn theme variables.

**PROMPT TO PASTE:**

```
Implement the Clipt design system as Tailwind tokens and shadcn theme variables.

Brand palette:
- Primary (deep navy): #1F2A5E
- Accent (electric purple): #7B5BFF
- Accent-2 (mint, for success/payouts/attribution): #00C2A8
- Warning: #C0392B
- Surface: #FFFFFF
- Surface-muted: #F4F4F7
- Text: #1F1F23
- Text-muted: #6B6B73

In src/app/globals.css define CSS variables for both light and dark mode using these brand colors. Map shadcn's default tokens (--background, --foreground, --primary, --primary-foreground, --secondary, --accent, --muted, --border, --ring, etc.) so all shadcn components automatically pick up the Clipt look.

In tailwind.config.ts:
- Extend the theme with semantic color names: brand-navy, brand-purple, brand-mint, brand-warn.
- Set the default sans font stack to Inter via next/font (configured in src/app/layout.tsx).
- Set base radius to 0.75rem.
- Add a custom keyframe + animation called "pulse-attribution" (subtle 2s purple glow) for attribution badges later.

In src/app/layout.tsx:
- Load Inter via next/font with display: 'swap'.
- Set lang="en", suppressHydrationWarning, and apply font-sans to body.
- Add metadata (title: "Clipt — Every clip pays the creator", description, openGraph, twitter card).

Create src/components/shared/Logo.tsx — a simple SVG-based wordmark "Clipt" in brand-navy with a small purple dot accent. Make the dot a separate <span> so we can animate it later.

Create src/components/shared/ThemeToggle.tsx using shadcn's dropdown-menu and next-themes (install next-themes). Wire it into a top-right slot.

Make sure all colors and spacings reference tokens, never hex values, in any component code.
```

**ACCEPTANCE CHECKS:**
- [ ] All shadcn components on the home page render with the navy/purple palette.
- [ ] Theme toggle switches light/dark cleanly.
- [ ] No hardcoded hex values in component files (search for `#` to verify).

---

## Prompt 0.3 — Supabase setup + database schema bootstrap

**Goal:** Connect Supabase, generate types, lay down the initial schema (users, channels, clips, attributions), and wire RLS.

**PROMPT TO PASTE:**

```
Wire up Supabase as the primary database, auth, and storage layer.

Step 1: Install dependencies — @supabase/supabase-js, @supabase/ssr.

Step 2: Create src/lib/supabase/client.ts (browser client) and src/lib/supabase/server.ts (server client using cookies for SSR auth) per the Supabase Next.js App Router pattern.

Step 3: Create src/lib/supabase/admin.ts that uses SUPABASE_SERVICE_ROLE_KEY for privileged operations. Add a comment warning never to import this from client code.

Step 4: Create supabase/migrations/0001_init.sql with the following schema. Use snake_case column names. Add updated_at triggers. Enable RLS on every table.

Tables:
- profiles (id uuid PK references auth.users, handle text unique, display_name text, avatar_url text, role text default 'creator' check role in ('creator','clipper','brand','admin'), stripe_customer_id text, stripe_connect_account_id text, payout_balance_cents bigint default 0, created_at timestamptz, updated_at timestamptz)
- channels (id uuid PK, owner_id uuid references profiles, platform text check platform in ('twitch','youtube','kick'), platform_user_id text, platform_username text, access_token_encrypted text, refresh_token_encrypted text, scopes text[], connected_at timestamptz, last_synced_at timestamptz, unique(platform, platform_user_id))
- clips (id uuid PK, source_channel_id uuid references channels, source_url text, source_platform text, source_creator_profile_id uuid references profiles, clipper_profile_id uuid references profiles, title text, duration_seconds int, status text check status in ('pending','processing','ready','failed'), processing_error text, video_r2_key text, vertical_video_r2_key text, captions_json jsonb, view_count_total int default 0, earnings_cents bigint default 0, attribution_signature text, created_at timestamptz, updated_at timestamptz)
- clip_posts (id uuid PK, clip_id uuid references clips, platform text, platform_post_id text, posted_by_profile_id uuid references profiles, posted_at timestamptz, view_count int default 0, like_count int default 0, last_synced_at timestamptz)
- attributions (id uuid PK, clip_id uuid references clips, original_creator_profile_id uuid references profiles, share_basis_points int default 2500, status text check status in ('pending','verified','disputed'), signed_at timestamptz)
- earnings_ledger (id uuid PK, profile_id uuid references profiles, clip_id uuid references clips, source text check source in ('subscription','marketplace','tip'), amount_cents bigint, currency text default 'usd', occurred_at timestamptz, paid_out_at timestamptz, stripe_transfer_id text)
- waitlist (id uuid PK, email text unique, segment text check segment in ('streamer','fan','clipper','brand','other'), source text, created_at timestamptz)

RLS policies:
- profiles: owner can select/update own row; public can select id, handle, display_name, avatar_url only.
- channels: owner can do everything; admin can read.
- clips: source creator and clipper can read; ready clips are publicly readable for the public clip page; owner can update.
- attributions: original creator and clipper can read; admin can update.
- earnings_ledger: owner can read; admin can write.
- waitlist: anyone can insert; admin can read.

Step 5: Set up the Supabase CLI link (supabase init, supabase link --project-ref ...) and apply the migration. Generate TypeScript types into src/types/database.ts using `supabase gen types typescript`.

Step 6: Add a README section "Database" describing how to run migrations and regenerate types.

Do not seed any data. Do not create any UI yet.
```

**ACCEPTANCE CHECKS:**
- [ ] Migration applies cleanly to a Supabase project.
- [ ] `src/types/database.ts` is generated and importable.
- [ ] RLS is enabled on all tables (verify in Supabase dashboard).
- [ ] No service-role key leaks into a client-side file.

---

## Prompt 0.4 — Conventions doc + agent guardrails

**Goal:** Write `CLAUDE.md` so Claude Code reuses the same patterns on every future prompt.

**PROMPT TO PASTE:**

```
Create a CLAUDE.md at the repo root that you (Claude Code) will read before every future change.

Sections:
- Project: brief description of Clipt and the four user types we serve.
- Stack: Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui, Supabase, Inngest, Stripe, Cloudflare R2, Vercel, Fly.io for video workers.
- Conventions:
  - Always use server components by default; mark client components with "use client" only when needed.
  - Server Actions for mutations; route handlers (route.ts) only for webhooks and OAuth callbacks.
  - All forms use react-hook-form + zod; shared schemas live in src/features/<feature>/schema.ts.
  - All Supabase queries go through src/lib/supabase/{server,client,admin}.ts — never new SupabaseClient() inline.
  - Never hardcode hex colors; always use Tailwind tokens / CSS variables.
  - Tests: Vitest for unit, Playwright for e2e (we'll set these up later).
  - Background work: Inngest functions live in src/inngest/functions/<name>.ts.
- Folder rules:
  - Feature code in src/features/<feature>/{components,server,client,schema.ts,types.ts}.
  - Routes in src/app/ are thin shells that import from features.
- Naming:
  - kebab-case for files, PascalCase for React components, camelCase for variables.
  - Database tables snake_case; TypeScript types PascalCase.
- Commit style: Conventional Commits (feat:, fix:, chore:, docs:, refactor:).
- When uncertain, prefer clarity over cleverness — this codebase is being built solo.

Then create src/app/dev/conventions/page.tsx — a markdown-rendered page (use react-markdown) that shows CLAUDE.md to a human reader at /dev/conventions for easy reference.

Finally, add a section to README.md saying: "Read CLAUDE.md before changing anything."
```

**ACCEPTANCE CHECKS:**
- [ ] CLAUDE.md exists and is comprehensive.
- [ ] /dev/conventions renders the same content in-browser.

---

## Prompt 0.5 — Marketing landing page + waitlist

**Goal:** Public landing page at `/` with the manifesto, value prop per persona, and a waitlist form that segments by user type.

**PROMPT TO PASTE:**

```
Build the Clipt marketing landing page at src/app/page.tsx.

Sections (top to bottom):
1. Sticky nav: Logo left, links (Product, For Creators, For Clippers, For Brands, Pricing) center, "Join waitlist" CTA right.
2. Hero: Headline "Every clip pays the creator." Sub-headline "The first clipping platform where streamers, fans, clippers, and brands all win." Two CTAs: primary "Join the waitlist", secondary "Watch the 60-second pitch" (no-op for now).
3. Three-segment grid (cards): "For Streamers" / "For Fans" / "For Clippers" / "For Brands" — each with one-sentence value prop and an icon (lucide-react).
4. The clip economy stat strip: 4 stats from the market analysis (clipping is now $1B+ channel; brands pay $1–$6 CPM; top clippers earn 5 figures/mo; YouTube + Twitch + Kick = 16B+ live hours/quarter).
5. How it works (3 steps): "Connect your channel" → "AI clips your moments" → "Everyone in the chain gets paid."
6. Differentiation: "Why Clipt" — three pillars (Live AI clipping, Creator revenue share, Verified attribution + compliance).
7. FAQ accordion (use shadcn Accordion if not installed, install it).
8. Footer: small links, © 2026 Clipt.

Waitlist:
- Place the waitlist form inside the hero AND at the bottom of the page (same component).
- Component: src/features/waitlist/components/WaitlistForm.tsx — react-hook-form + zod.
- Fields: email (required, valid email), segment (radio group: Streamer / Fan / Clipper / Brand / Other).
- On submit, call a server action in src/features/waitlist/server/joinWaitlist.ts that inserts into the waitlist table and returns success/failure.
- Show a shadcn toast on success.
- Use Resend (npm i resend) to send a confirmation email if RESEND_API_KEY is set; silently skip if not. Email template lives at src/features/waitlist/server/emails/waitlistConfirm.tsx using @react-email/components.

Visual:
- Dark theme by default on this page (override globals if needed).
- Generous vertical spacing.
- Use brand-purple for primary CTAs, brand-mint for the "money" stats.
- Subtle gradient mesh background using a CSS gradient on a fixed positioned div behind content.

Mobile responsive — test at 375px width.
```

**ACCEPTANCE CHECKS:**
- [ ] Landing page renders at `/`.
- [ ] Submitting waitlist with a valid email adds a row to the `waitlist` table.
- [ ] Submitting with an invalid email shows a validation error.
- [ ] Mobile layout doesn't break at 375px.
- [ ] Lighthouse performance score > 90.

---

# PHASE 1 — CORE CLIPPING

> **Outcome of this phase:** A creator can sign up, connect their Twitch / YouTube channel, paste any clip URL from those platforms, and get back a vertical clip with auto-captions and verified attribution. They can edit captions, then download or post the result. Subscriptions gate the higher-quality features.

---

## Prompt 1.1 — Auth flow (sign up / log in / sign out)

**PROMPT TO PASTE:**

```
Build the Clipt auth flow using Supabase Auth.

Sign-up methods:
- Email + password (with email confirmation)
- "Continue with Google" (Supabase Google OAuth provider)
- "Continue with Twitch" (Supabase Twitch OAuth provider) — this also stores the Twitch tokens for clip access; see Prompt 1.2 for that flow

Routes:
- /auth/login (server component shell, client form)
- /auth/signup
- /auth/forgot-password
- /auth/reset-password
- /auth/callback (route handler for OAuth callbacks; on first sign-in, create a row in profiles with handle = derived from email or platform username, role = 'creator' default)

Components:
- src/features/auth/components/LoginForm.tsx
- src/features/auth/components/SignupForm.tsx
- src/features/auth/components/SocialButtons.tsx — "Continue with Google" and "Continue with Twitch" buttons.

Use react-hook-form + zod. Show inline errors. After successful login, redirect to /dashboard.

Middleware: src/middleware.ts that runs Supabase's getUser() on every request and:
- Redirects unauthenticated users hitting /dashboard/* to /auth/login.
- Redirects authenticated users hitting /auth/* to /dashboard.

Logout:
- Add a "Log out" item to a UserMenu dropdown in the dashboard header.
- It calls supabase.auth.signOut() and redirects to /.

Don't build the dashboard yet — just a placeholder /dashboard page that says "Hello, {handle}" and a logout button.
```

**ACCEPTANCE CHECKS:**
- [ ] Email signup creates an auth.users row and a profiles row.
- [ ] Twitch OAuth completes and stores tokens (verify in Prompt 1.2 — for now just confirm sign-in works).
- [ ] Logged-in users hitting `/auth/login` get redirected to `/dashboard`.
- [ ] Logged-out users hitting `/dashboard` get redirected to `/auth/login`.

---

## Prompt 1.2 — Twitch channel connection (full OAuth + token storage)

**PROMPT TO PASTE:**

```
Build the Twitch channel connection flow.

We use Twitch OAuth for two purposes:
1. As a sign-in method (Prompt 1.1).
2. As a "connect my channel" action that stores access + refresh tokens in our channels table for later API calls.

Endpoints:
- src/app/api/oauth/twitch/start/route.ts — initiates OAuth: builds the Twitch authorize URL with scopes (user:read:email, clips:edit, channel:read:subscriptions), state (csrf token stored in a signed cookie), and redirect_uri = /api/oauth/twitch/callback. Returns a 302 to Twitch.
- src/app/api/oauth/twitch/callback/route.ts — verifies state, exchanges the code for tokens via Twitch token endpoint, fetches the Twitch user via /helix/users, encrypts the tokens with our ATTRIBUTION_SIGNING_KEY (use a separate TOKEN_ENCRYPTION_KEY env var; add it to .env.example) using AES-256-GCM, upserts a row in channels (platform='twitch'), and redirects to /dashboard/channels with a success toast.

Encryption helpers:
- src/lib/crypto/encryption.ts exposing encrypt(plaintext, key) and decrypt(ciphertext, key).
- Key is base64-encoded 32 bytes.
- Output format: base64(iv || ciphertext || authTag).

UI:
- src/app/(dashboard)/dashboard/channels/page.tsx — lists connected channels (platform icon, username, "Disconnect" button).
- src/features/channels/components/ConnectChannelButton.tsx — calls the OAuth start endpoint via window.location.

When a channel is disconnected, soft-delete by setting access_token_encrypted = null (so we keep history).

Refresh-token logic:
- src/features/channels/server/getValidTwitchAccessToken.ts — given a channel id, decrypts the refresh token, exchanges for new access token if expired, updates the row, returns the access token. All future Twitch API calls go through this.

Add error handling for the case where the user revokes Twitch app access.
```

**ACCEPTANCE CHECKS:**
- [ ] User can connect Twitch channel from /dashboard/channels.
- [ ] Tokens are stored encrypted (verify in DB that the column doesn't contain plaintext).
- [ ] Reconnecting the same Twitch account updates the existing row instead of creating a duplicate.
- [ ] Disconnecting clears the token but preserves the row.

---

## Prompt 1.3 — YouTube channel connection

**PROMPT TO PASTE:**

```
Build the YouTube channel connection flow, mirroring the Twitch flow from Prompt 1.2.

Use Google OAuth 2.0 with these scopes:
- https://www.googleapis.com/auth/youtube.readonly
- https://www.googleapis.com/auth/youtube.upload (for posting Shorts later in Prompt 1.13+)

Endpoints:
- src/app/api/oauth/youtube/start/route.ts
- src/app/api/oauth/youtube/callback/route.ts

After OAuth, fetch the user's YouTube channel via youtube.channels.list?part=snippet&mine=true, store platform_user_id (channel id) and platform_username (channel title) in channels with platform='youtube'.

Reuse the encryption helpers from Prompt 1.2.

src/features/channels/server/getValidYouTubeAccessToken.ts — same shape as the Twitch helper.

Update /dashboard/channels to show YouTube alongside Twitch.

For Kick, leave a stub button that says "Coming soon" — Kick's OAuth is less established, we'll handle it in Phase 2.
```

**ACCEPTANCE CHECKS:**
- [ ] YouTube OAuth completes; tokens encrypted; channel row created.
- [ ] /dashboard/channels lists both Twitch and YouTube when both are connected.

---

## Prompt 1.4 — Inngest setup + first background job

**PROMPT TO PASTE:**

```
Wire up Inngest as our background job system.

Steps:
1. npm i inngest. Create src/inngest/client.ts that exports an Inngest client with id 'clipt'.
2. Create src/inngest/functions/index.ts that exports an array of Inngest functions.
3. Create the route handler at src/app/api/inngest/route.ts that registers the functions via Inngest's serve helper.
4. Add Inngest dev server script to package.json: "inngest:dev": "npx inngest-cli@latest dev".
5. Document Inngest setup in CLAUDE.md.

First function: src/inngest/functions/processClip.ts
- Trigger: event "clip/requested" with payload { clipId: string }.
- Steps (use step.run for retry isolation):
  1. Load clip from DB.
  2. Update status to 'processing'.
  3. (TODO — to be implemented in later prompts) Download source video.
  4. (TODO) Generate captions.
  5. (TODO) Reframe to vertical.
  6. (TODO) Sign attribution.
  7. Update status to 'ready' or 'failed' with processing_error.

For now, the function should run all stub steps and just flip status to 'ready' after a 5-second sleep so we can verify the wiring.

Add a debug page at src/app/dev/inngest/page.tsx with a "Trigger test job" button that inserts a dummy clip row and sends the clip/requested event.

Make sure the function works in both `inngest dev` mode and production (Vercel).
```

**ACCEPTANCE CHECKS:**
- [ ] `pnpm inngest:dev` starts the Inngest dev UI at http://127.0.0.1:8288.
- [ ] /dev/inngest test button triggers a job that flips a clip's status to 'ready' after 5s.
- [ ] Function shows up in the Inngest dashboard when deployed to Vercel.

---

## Prompt 1.5 — Paste-URL clip ingestion (frontend + server action)

**PROMPT TO PASTE:**

```
Build the "paste a URL, get a clip" flow.

Frontend:
- /dashboard/clips/new — server-rendered shell.
- src/features/clips/components/PasteUrlForm.tsx (client) — single text input ("Paste a Twitch, YouTube, or Kick URL"), Submit button.
- On submit, call server action src/features/clips/server/createClipFromUrl.ts.

Server action:
- Accept { sourceUrl: string }.
- Validate the URL with zod and detect platform from the URL pattern:
  - twitch.tv/<channel>/clip/<slug> → platform: 'twitch', source_kind: 'clip'
  - twitch.tv/videos/<id> → platform: 'twitch', source_kind: 'vod'
  - youtube.com/watch?v=... or youtu.be/... → platform: 'youtube', source_kind: 'video'
  - youtube.com/shorts/... → platform: 'youtube', source_kind: 'short'
  - kick.com/<channel>/clips/<slug> → platform: 'kick', source_kind: 'clip'
  - Anything else → reject with "Unsupported URL".
- Insert a clip row with status='pending', source_url, source_platform.
- Send Inngest event clip/requested with { clipId }.
- Redirect to /dashboard/clips/<clipId>.

Clip detail page:
- /dashboard/clips/[id]/page.tsx — server component.
- Shows status with a live indicator (use Supabase Realtime subscription on the clip row).
- When status = 'pending' or 'processing', show a skeleton with descriptive sub-status text.
- When status = 'ready', show the (TODO) vertical preview, captions, attribution badge, and post controls (later prompts).
- When status = 'failed', show the processing_error message and a "Retry" button that re-triggers the Inngest event.

Add the new clip flow to the dashboard navigation: a "+ New clip" button in the dashboard header.
```

**ACCEPTANCE CHECKS:**
- [ ] Pasting a valid Twitch clip URL creates a clip row and sends the Inngest event.
- [ ] Pasting an invalid URL shows a clear error.
- [ ] /dashboard/clips/[id] live-updates from 'pending' → 'processing' → 'ready'.

---

## Prompt 1.6 — Cloudflare R2 setup + signed upload helpers

**PROMPT TO PASTE:**

```
Wire up Cloudflare R2 as our object storage for video files (source downloads, vertical exports, thumbnails).

Steps:
1. npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner (R2 is S3-compatible).
2. Create src/lib/storage/r2.ts exposing:
   - getR2Client() — returns a configured S3Client pointed at R2.
   - putObject(key, body, contentType) — uploads.
   - getObject(key) — returns a stream.
   - getSignedDownloadUrl(key, expiresInSec=3600) — returns a presigned GET URL.
   - getSignedUploadUrl(key, contentType, expiresInSec=300) — returns a presigned PUT URL for client uploads (we'll use this for mobile in Phase 3).
   - deleteObject(key).
3. Bucket layout convention (document in CLAUDE.md):
   - sources/{clip_id}.{ext}
   - verticals/{clip_id}.mp4
   - thumbnails/{clip_id}.jpg
   - captions/{clip_id}.json
4. Add an environment variable R2_PUBLIC_BUCKET_URL for clips that should be CDN-served via R2's public URL feature, but only for vertical exports and thumbnails — sources stay private.

Update the processClip Inngest function: in step "download source video", call a placeholder downloadSource(clipId, sourceUrl) that we will implement in Prompt 1.7. For now stub it to write a 1KB dummy file to sources/{clipId}.mp4 so we can verify R2 wiring end-to-end.
```

**ACCEPTANCE CHECKS:**
- [ ] Triggering a test clip writes a sources/{clipId}.mp4 to R2.
- [ ] Reading it back via getSignedDownloadUrl returns the file.

---

## Prompt 1.7 — Source video download service

**PROMPT TO PASTE:**

```
Implement the source-video download step of the processClip pipeline.

We need to fetch the actual video bytes for a Twitch clip, Twitch VOD, YouTube video, YouTube Short, or Kick clip, and store them in R2 at sources/{clipId}.mp4.

For now, run this download inside an Inngest function step (in Phase 2 we'll move heavy work to the Fly.io worker).

Implementations:
- Twitch clip: use the Twitch GraphQL endpoint to resolve the clip slug to its mp4 download URL (the standard pattern: query { clip(slug:"..."){ videoQualities { sourceURL quality } } } via gql.twitch.tv/gql with a Client-ID header). Pick the highest quality. Stream-download to R2.
- Twitch VOD: use yt-dlp (we'll run this on the Python worker in Phase 2; for V1 of this prompt, return a clear "Twitch VODs are coming soon — please use a Twitch clip URL" error and mark status='failed').
- YouTube video / Short: same — for this prompt, mark unsupported and add a placeholder message. Real YouTube downloading goes on the Fly.io Python worker in Prompt 2.0.
- Kick clip: use Kick's clip JSON endpoint (https://kick.com/api/v2/clips/<slug>) to find the clip mp4 URL; stream to R2.

This means in Phase 1 we ship working ingestion only for Twitch clips and Kick clips — the simplest, most-used cases. YouTube and VOD support land in Phase 2 when the worker is ready.

Add streaming download helper in src/features/clips/server/downloadSource.ts that:
- Takes clip row.
- Downloads the source mp4 via fetch (with axios or undici streaming).
- Pipes to R2 putObject with the right content type.
- Returns { videoR2Key, durationSeconds, originalWidth, originalHeight }.

If the source video is over 10 minutes, mark the clip as 'failed' with error 'Source too long for V1'.

Update the clips table: add columns source_width int, source_height int, source_codec text. Migration: supabase/migrations/0002_clip_source_meta.sql.

After download, save these meta fields back to the clip row.
```

**ACCEPTANCE CHECKS:**
- [ ] Pasting a real Twitch clip URL ends with the mp4 in R2.
- [ ] Pasting a Twitch VOD URL fails gracefully with the "coming soon" message.
- [ ] Source meta (width/height/duration) populates correctly.

---

## Prompt 1.8 — Fly.io Python worker for ffmpeg + ML

**PROMPT TO PASTE:**

```
Stand up a separate Fly.io app called "clipt-video-worker" — a Python FastAPI service that handles all heavy video work (ffmpeg processing, vertical reframe, ML inference for captions and highlight detection).

The worker is invoked over HTTP (signed requests) from our Inngest functions, NOT directly from Next.js.

Repo layout: this worker lives in workers/video/ inside the same monorepo (so we keep one repo). Add a top-level workspace setup (pnpm workspaces) and pnpm-workspace.yaml that includes apps/web (move Next.js there) and workers/video.

Step 1 — Restructure the repo:
- Move all current src/, public/, package.json etc. into apps/web/.
- Add pnpm-workspace.yaml.
- Update CLAUDE.md to describe the new layout.

Step 2 — workers/video/ Python service:
- Use FastAPI + uvicorn.
- Dependencies: ffmpeg-python, openai-whisper or faster-whisper, mediapipe (for face/object tracking), boto3 (R2 access), python-jose (JWT for signed requests), httpx.
- Endpoints:
  - POST /jobs/transcribe { clipId, sourceR2Key } → returns { captionsJson } and writes to captions/{clipId}.json on R2.
  - POST /jobs/reframe { clipId, sourceR2Key, captionsR2Key, style } → produces vertical mp4 with burned-in captions, writes to verticals/{clipId}.mp4 on R2, returns { verticalR2Key, thumbnailR2Key }.
  - POST /jobs/download-youtube { clipId, sourceUrl } → uses yt-dlp to download YouTube/Twitch VOD content, returns { sourceR2Key, durationSeconds, width, height }.
  - GET /healthz.
- Auth: every request must include a JWT signed with WORKER_HMAC_KEY; reject otherwise.
- Dockerfile: python:3.12-slim base + ffmpeg + yt-dlp installed via apt and pip.
- fly.toml: 1 dedicated CPU, 4GB RAM, autoscale 0..3.

Step 3 — Next.js side:
- src/lib/workers/videoWorker.ts — a typed client with methods callTranscribe(...), callReframe(...), callDownloadYouTube(...). Each signs a JWT and posts to the worker URL (env var VIDEO_WORKER_URL).

Step 4 — Update processClip Inngest function:
- After downloading the source (Prompt 1.7), call videoWorker.callTranscribe.
- Then call videoWorker.callReframe with style='default'.
- Save returned R2 keys + captions JSON to the clip row.
- Flip status='ready'.

Step 5 — README in workers/video/ explaining local dev with `fly dev` and how to test endpoints with cURL.

Don't implement the actual ML inside endpoints yet — stub them to write dummy outputs. We'll implement transcription in Prompt 1.9 and reframe in Prompt 1.10.
```

**ACCEPTANCE CHECKS:**
- [ ] Repo restructured to monorepo (apps/web + workers/video).
- [ ] `fly deploy` from workers/video succeeds.
- [ ] Inngest processClip calls the worker for transcribe + reframe (verify in worker logs).
- [ ] Stubs return dummy R2 keys; clip eventually shows status='ready'.

---

## Prompt 1.9 — Whisper caption pipeline (real implementation)

**PROMPT TO PASTE:**

```
Implement real captions in workers/video using faster-whisper.

In workers/video/app/jobs/transcribe.py:
- Load faster-whisper "large-v3" model on first request, cache in memory.
- Download source mp4 from R2 using boto3.
- Extract audio with ffmpeg (-vn -acodec pcm_s16le -ar 16000 -ac 1).
- Run faster-whisper transcribe with word_timestamps=True.
- Build captions JSON with shape:
  {
    language: string,
    segments: [{ id: int, start: number, end: number, text: string, words: [{ start, end, text }] }]
  }
- Write JSON to captions/{clipId}.json on R2.
- Return { captionsJson, language }.

Performance budget: target < 0.4× realtime on a Fly.io 4GB CPU machine. If too slow, fall back to "small" model controlled by env var WHISPER_MODEL.

In Next.js:
- After transcription, store captions_json on the clip row (yes, duplicate the JSON in DB for fast querying — it's small).
- Build a CaptionEditor component (Prompt 1.11) that lets users tweak the text.

Add error handling:
- If audio is silent (no speech), still proceed but with empty captions.
- If language is not in EN/ES/PT/FR/DE, set the captions but flag languageWarning=true on the clip row.
```

**ACCEPTANCE CHECKS:**
- [ ] Real Twitch clip with speech produces accurate captions.
- [ ] Captions are word-timed.
- [ ] Silent clip still completes processing.

---

## Prompt 1.10 — Vertical reframe pipeline with action tracking

**PROMPT TO PASTE:**

```
Implement vertical reframe in workers/video.

The goal: take a 16:9 source clip and produce a 9:16 vertical version where the "interesting region" stays centered, with burned-in captions across the bottom third.

Algorithm (V1, pragmatic):
1. Decode the source.
2. For each frame at 5fps sampling:
   a. Run MediaPipe face detection. If a face is found, the X-center of the largest face is the focus point.
   b. If no face, fall back to optical flow (or skip detection — center crop).
3. Smooth the focus-point sequence with a 1-second moving average to avoid jitter.
4. Compute crop window: 9:16 box at the smoothed focus point per frame.
5. Use ffmpeg with the crop filter (variable crop is hard with libavfilter; for V1, compute one-second-resolution crop tracks and use ffmpeg's enable=between(t,...) to switch). Alternatively, render via OpenCV frame-by-frame and re-encode (more flexibility, slower).

Captions:
6. Burn captions into the bottom third using ffmpeg's drawtext or OpenCV PIL+Pillow. Style: white text, black stroke, bold, 6vh font equivalent, brand-purple highlight on the active word (use captions JSON word timings to drive a colored span).
7. Add a small attribution badge (top-right, 8% width): rounded rectangle with brand-mint background, white text "@{handle}". The handle is passed in the request payload.

Output: verticals/{clipId}.mp4 at 1080x1920, h264 baseline profile, 30fps, AAC audio, max 5MB/sec bitrate. Also generate a thumbnail at 1.5s offset and write to thumbnails/{clipId}.jpg.

Update the workers/video/app/jobs/reframe.py file with this implementation.

Performance budget: < 1× realtime on Fly.io 4GB CPU.

Update Inngest processClip to pass the source creator's handle into the reframe call so the badge renders correctly.
```

**ACCEPTANCE CHECKS:**
- [ ] A test clip with a face renders with the face centered, not cropped.
- [ ] Captions are visible, word-highlighted, readable on mobile.
- [ ] The attribution badge renders top-right.
- [ ] Thumbnail exists at thumbnails/{clipId}.jpg.

---

## Prompt 1.11 — Cryptographic attribution layer

**PROMPT TO PASTE:**

```
Implement the verified-attribution signing system. This is the technical core of Clipt's differentiator.

Goal: every clip we produce carries a cryptographic proof of (a) which source channel it came from, (b) the original creator's profile id, (c) the timestamp range, (d) the platform we issued it from. This proof is verifiable by anyone with our public key.

Implementation:
1. Generate an ed25519 keypair. Store the private key in env var ATTRIBUTION_SIGNING_KEY (base64). Publish the public key at /.well-known/clipt-attribution-public-key (a static text file).
2. Create src/lib/attribution/sign.ts:
   - signAttribution({ clipId, sourceChannelId, originalCreatorProfileId, sourcePlatform, sourceUrl, sourceStartSec, sourceEndSec, issuedAt }): returns a JWT signed with ed25519. Use 'jose' library.
   - The token's payload is exactly the input. The token's audience is "clipt-attribution-v1".
3. src/lib/attribution/verify.ts:
   - verifyAttribution(token): checks signature against the published public key.
4. In Inngest processClip, after the clip is rendered, call signAttribution and store the resulting JWT in clips.attribution_signature.
5. Embed the signature in the clip mp4's metadata using ffmpeg's -metadata clipt_attribution=<jwt> in the reframe step (update workers/video/app/jobs/reframe.py to accept attribution_token and pass to ffmpeg).
6. The public clip page (Prompt 1.12) displays a "Verified" badge that, when clicked, shows the parsed JWT contents.

Key rotation:
- Document a procedure in CLAUDE.md for rotating the signing key annually. Old public keys remain at /.well-known/clipt-attribution-public-keys.json (an array including key id, public key, and validity dates).

Test:
- Add a Vitest unit test that signs a fake payload and verifies it.
- Add an e2e check: trigger a real clip, parse the JWT from clips.attribution_signature, verify it.
```

**ACCEPTANCE CHECKS:**
- [ ] Every clip in 'ready' state has a non-null attribution_signature.
- [ ] Verifying that signature with the public key returns the expected payload.
- [ ] The mp4 contains the attribution metadata (verify with `ffprobe`).

---

## Prompt 1.12 — Public clip page

**PROMPT TO PASTE:**

```
Build the public clip page at /c/[clipId].

Public, no auth required. Rendered as a server component.

Layout:
- Top: vertical mp4 player (use plyr or hls-video-element; auto-play muted by default with a tap-to-unmute control). Aspect 9:16, max 540px wide on desktop.
- Below player:
  - Title (editable in dashboard, default to "Clipped from @{source-creator-handle}").
  - Attribution panel:
    - "Originally streamed by @{handle}" with linked profile.
    - "Clipped by @{clipper-handle}" if different.
    - Verified badge in brand-mint with checkmark icon. Click reveals the parsed JWT details in a dialog.
  - Engagement: view count, share button (uses navigator.share when available, else copies link).
  - Open Graph + Twitter card meta tags so the clip looks great when shared.
- Footer: small Clipt branding, link back to homepage.

SEO:
- Title: "{clip title} — Clipt"
- Description: first 150 chars of caption text.
- og:image: thumbnail URL.
- og:video: signed-1-hour URL to the vertical mp4.

Performance:
- Pre-render with revalidate=60.
- Vertical mp4 served via R2 public URL (CDN-cached).

Privacy:
- If the clip is set to 'unlisted' (we'll add this column in Prompt 1.13), the public page returns 404 to non-owners.

Embeddable widget:
- /c/[clipId]/embed — minimal layout, just the video, no chrome. Add iframe-friendly headers.
- The /c/[clipId] page has a "Get embed code" link that copies an iframe snippet.
```

**ACCEPTANCE CHECKS:**
- [ ] Public clip page renders for any 'ready' clip.
- [ ] Open Graph card looks correct when pasted into Twitter/Discord.
- [ ] Embed iframe works on a third-party page.

---

## Prompt 1.13 — Clip editor (caption tweaks, title, post controls)

**PROMPT TO PASTE:**

```
Build the clip editor at /dashboard/clips/[id].

When a clip's status='ready', show:
- Vertical preview (same player as public page).
- Caption editor: list of caption segments with editable text. Saving updates clips.captions_json and triggers a re-render via Inngest event 'clip/captions-updated'. The reframe pipeline re-renders the vertical with the new captions.
- Title input.
- Visibility toggle: 'public' | 'unlisted'.
- "Post to TikTok / IG Reels / YT Shorts" buttons (we'll wire actual posting later in Prompt 1.14; for now show "Connect TikTok to enable" if not connected).
- "Download" button (signed URL to verticals mp4).
- "Public link" with copy button.
- "Delete" button with confirm dialog (soft-delete by setting deleted_at).

For caption re-render on edit:
- Add an Inngest function processCaptionEdit that re-runs the reframe step only (skip transcription since we already have new captions).
- While re-rendering, set status='processing' temporarily; UI shows skeleton over preview.

Add an analytics summary card:
- Views (sum of clip_posts.view_count once we wire post-tracking in Prompt 1.14).
- Earnings to date (placeholder $0.00 until Stripe Connect lands in Phase 3).
```

**ACCEPTANCE CHECKS:**
- [ ] Editing a caption and saving triggers a re-render with the new text.
- [ ] Title and visibility persist.
- [ ] Soft-delete hides the clip from list views but keeps R2 files (we'll add a cron purge later).

---

## Prompt 1.14 — Cross-platform publishing (TikTok / IG / YouTube Shorts)

**PROMPT TO PASTE:**

```
Wire publishing to TikTok, Instagram Reels, and YouTube Shorts.

This requires three more OAuth providers. Build them on the same pattern as Twitch/YouTube (Prompts 1.2 and 1.3) — encrypted tokens stored in channels rows with platform set to 'tiktok' / 'instagram' / 'youtube_shorts' (note: YouTube Shorts uses the existing youtube channel — same row, different scope, just upgrade scopes if needed).

Endpoints:
- /api/oauth/tiktok/{start,callback}
- /api/oauth/instagram/{start,callback}
- (YouTube Shorts uses the existing /api/oauth/youtube/* with upload scope from Prompt 1.3.)

Posting actions (server actions, not API routes):
- src/features/publishing/server/postToTikTok.ts
- src/features/publishing/server/postToInstagramReels.ts
- src/features/publishing/server/postToYouTubeShorts.ts

Each:
- Accepts { clipId, caption, hashtags[] }.
- Loads the vertical mp4 URL from R2.
- Uploads to the destination platform via the platform's content posting API.
- Inserts a row in clip_posts with platform_post_id, posted_at, posted_by_profile_id.
- Returns { url, platformPostId }.

UI:
- In the clip editor, "Post to..." buttons open a dialog with caption + hashtags + scheduled-time (datetime input). Scheduled posts use Inngest's step.sleepUntil.
- Posted clips show a list of platforms with view counts, last synced timestamp, and a "Sync now" button that re-fetches stats.

Stats sync:
- Cron Inngest function syncPostStats that runs every 30 minutes for posts created in the last 7 days, pulling latest view/like counts.

Common pitfalls:
- Each platform has different content-posting API patterns — TikTok uses a chunked upload, Meta has a multi-step container creation, YouTube uses a resumable upload. Read the official docs before each.
- Some platforms require business/creator accounts for API posting (Instagram especially). Document this requirement on the connect page.
```

**ACCEPTANCE CHECKS:**
- [ ] Posting a clip to TikTok creates a real post (test with a sandbox account).
- [ ] clip_posts rows are created and stats sync hourly.
- [ ] Failed posts surface a clear error in the UI.

---

## Prompt 1.15 — Stripe subscriptions

**PROMPT TO PASTE:**

```
Wire Stripe Subscriptions to gate Creator and Pro features.

Plans:
- Free: 10 clips/mo, 720p, no watermark, basic publish.
- Creator $9/mo: unlimited clips, 1080p, scheduling, all 5 caption languages, hook detection.
- Pro $24/mo: 4K export, brand kit, advanced analytics, multi-channel.

Steps:
1. Create products + prices in Stripe (do this manually in the dashboard for now; document IDs in CLAUDE.md).
2. Add columns to profiles: subscription_status text default 'free', subscription_tier text default 'free' check tier in ('free','creator','pro'), subscription_renews_at timestamptz, stripe_subscription_id text.
3. Create /dashboard/billing page with current plan, upgrade/downgrade buttons that route to a Stripe Checkout session.
4. Implement /api/stripe/webhook route handler that handles:
   - customer.subscription.created/updated → update tier + renews_at.
   - customer.subscription.deleted → set tier='free'.
   - invoice.payment_failed → flag in UI.
5. Verify webhook signature with STRIPE_WEBHOOK_SECRET.
6. Implement entitlements:
   - src/lib/entitlements.ts exposes canCreateClip(profileId) which returns true/false based on tier and current month's clip count.
   - Use this in the createClipFromUrl server action (Prompt 1.5) — return a clear "Upgrade required" error when over the free limit.
7. Add a usage panel on /dashboard with clips this month / limit, tier, "Upgrade" CTA.
```

**ACCEPTANCE CHECKS:**
- [ ] Free user hits limit at 11th clip and sees upgrade CTA.
- [ ] Subscribing via Checkout updates tier; webhook works in test mode.
- [ ] Cancelling drops back to free at period end.

---

# PHASE 2 — LIVE CAPTURE

> **Outcome:** Clipt detects highlights in real time during a live Twitch / Kick / YouTube Live stream and offers them to the streamer (and authorized fans) as ready-to-post clips.

---

## Prompt 2.1 — Live stream segment ingestion

**Goal:** For any connected channel that's currently live, continuously download the last N seconds of HLS segments into a rolling buffer in R2.

**PROMPT TO PASTE:**

```
Implement live stream segment ingestion in workers/video.

For every connected channel where last_live_check < now - 30s, check if the channel is live (Twitch /helix/streams, YouTube live status, Kick API).

If live, start (or continue) a per-channel ingestor:
- Resolves the HLS playlist URL for the live stream.
- Maintains a rolling 5-minute buffer of segments in R2 at live/{channelId}/{segmentTs}.ts.
- Updates a Redis (Upstash) key live:{channelId}:latestSegment with the current head segment.
- Stops when the channel goes offline.

Run this as a long-lived Fly.io machine (not autoscale-from-zero) — one machine handling many channels via async tasks.

Add observability: Prometheus metrics endpoint /metrics with counters for active_ingestors, bytes_ingested, segments_dropped.

Handle: stream blackout, ad breaks (skip), reconnects, mid-stream resolution changes.
```

**ACCEPTANCE CHECKS:**
- [ ] When a connected channel goes live, segments start appearing in R2.
- [ ] Buffer holds 5 minutes; older segments are deleted.
- [ ] Going offline stops the ingestor cleanly.

---

## Prompt 2.2 — Real-time chat-spike detection

**Goal:** Detect when chat activity rapidly spikes — a strong signal of a hype moment.

**PROMPT TO PASTE:**

```
In workers/video/app/live/chat_spike.py, implement chat-spike detection.

For each live channel, connect to:
- Twitch IRC via tmi.js-style protocol (use an async Python IRC library like aioirc).
- YouTube live chat via the YouTube Live Streaming API.
- Kick chat via their public WebSocket (reverse-engineer endpoint with a documented client header).

For each chat message, push (channelId, timestamp) into a per-channel ring buffer in Redis.

Every 1 second, compute messages-per-second over the last 10s vs. baseline (last 5 minutes). If current >= 4× baseline AND current >= 30 msg/s, fire a "hypeMoment" event into Inngest with payload { channelId, detectedAt, score, reason: 'chat_spike' }.

Also detect specific keywords: 'CLIP IT', 'POG', 'OMEGALUL' clusters, plus user-defined per-channel keywords.

The Inngest function 'liveHypeMoment' creates a candidate clip:
- Looks at the live buffer at detectedAt - 25s to detectedAt + 5s.
- Stitches the relevant segments into a single mp4 in R2 at sources/{newClipId}.mp4.
- Triggers the regular clip processing pipeline (transcribe, reframe, sign attribution).
- Inserts a clip row with status='processing', source_kind='live_auto'.
- Notifies the channel owner (and optionally configured fans) via realtime + push notification (Phase 3).
```

**ACCEPTANCE CHECKS:**
- [ ] Chat spike during a live stream produces a candidate clip within 30s.
- [ ] No false positives from steady-state chat.

---

## Prompt 2.3 — Audio-energy + scene-change detection

**Goal:** Add an audio-driven highlight detector that complements chat spikes.

**PROMPT TO PASTE:**

```
In workers/video/app/live/audio_energy.py, implement audio-driven highlight detection.

For each live channel, on every new HLS segment ingested:
- Decode audio via ffmpeg.
- Compute short-term loudness (RMS at 100ms windows) and detect events:
  - "yell": sustained loudness > 90th percentile of last 5 minutes for >0.7s.
  - "silence-then-burst": >2s of relative silence followed by sustained loudness.
- Also run a small VAD (voice activity detector) — events with detected speech rank higher.

Emit Inngest events the same way chat spikes do: 'hypeMoment' with reason='audio_yell' or 'audio_burst'.

Combine signals:
- Inngest function 'mergeHypeSignals' deduplicates events that fire within 8 seconds of each other on the same channel and creates one clip with combined reason='chat+audio' and a higher score.

Tune parameters per-channel based on user feedback (a "this wasn't a clip-worthy moment" button on each auto-generated clip stores a label that the worker uses to retrain thresholds nightly).
```

**ACCEPTANCE CHECKS:**
- [ ] Streamer yelling produces a candidate clip.
- [ ] Combined chat+audio events produce a single clip, not duplicates.

---

## Prompt 2.4 — Mobile-optimized live-clip flow (PWA)

**Goal:** Fans watching a live channel on Clipt's web mobile experience can tap once to clip the last 30s.

**PROMPT TO PASTE:**

```
Build a PWA-optimized live-channel viewer at /live/[platform]/[username] (e.g., /live/twitch/shroud).

When a user opens the page:
- Show the live video (embed Twitch/YouTube/Kick player; can't capture inside the iframe but use it for viewing).
- Show a big floating "Clip last 30s" button at the bottom (tap target ≥ 56px).
- On tap, call server action createLiveClip({ channelId, lookbackSec: 30 }) which:
  - Looks up the channel's live buffer in R2 (must be currently live + ingestor running).
  - Stitches the relevant segments into sources/{newClipId}.mp4.
  - Creates a clip row with clipper_profile_id = current user, source_creator_profile_id = channel owner, source_kind='live_fan'.
  - Triggers the standard pipeline.
  - Returns { clipId }.
- Redirect to /dashboard/clips/{clipId} on the same device — the editor lets the fan finalize and post.

Make this page installable as a PWA (manifest.json with full standalone mode, icons, theme color).

Service worker: src/app/sw.ts caches the app shell + last-viewed clip thumbnails.

Authentication: signed-in users can clip; signed-out users get a lightweight "Sign up to clip" gate (one-tap signup with a Twitch / Google / email).
```

**ACCEPTANCE CHECKS:**
- [ ] Live page renders on a phone.
- [ ] Tap-clip produces a clip in <30s of perceived latency.
- [ ] App works installed-from-home-screen.

---

# PHASE 3 — MOBILE + CREATOR ECONOMICS

> **Outcome:** Clipt has native iOS + Android apps. Stripe Connect is wired so creators (and clippers) receive payouts. The 25% revenue-share infrastructure is live for premium-subscription earnings.

---

## Prompt 3.1 — Expo mobile app scaffold

**PROMPT TO PASTE:**

```
Create the apps/mobile/ Expo (React Native + TypeScript) app inside the monorepo.

Decisions:
- Expo Router (file-based routing).
- NativeWind for Tailwind-style classes (shares tokens with web via a shared @clipt/ui package).
- Shared types: extract src/types/database.ts and src/types/clipt-domain.ts into packages/types/.
- Shared API client: extract auth + Supabase client logic into packages/api/.

Bootstrap:
- pnpm create expo-app apps/mobile --template blank-typescript.
- Add NativeWind, react-native-svg, expo-router, @supabase/supabase-js, react-query.
- Configure app.config.ts with name "Clipt", slug "clipt", scheme "clipt".

Implement:
- Auth flow mirroring web (email + Twitch + Google login). Use deep links for OAuth callback (clipt://auth/callback).
- Tab bar (Home / Live / My Clips / Profile).
- Home: discovery feed placeholder.
- Live: list of currently-live connected channels.
- My Clips: list of user's clips with status indicators.
- Profile: account, billing, log out.

Match the brand (navy + purple) using the shared tokens.
```

**ACCEPTANCE CHECKS:**
- [ ] `pnpm --filter mobile start` runs Expo Dev Client.
- [ ] Auth works on iOS simulator and Android emulator.
- [ ] All four tabs navigate.

---

## Prompt 3.2 — Mobile one-tap clip flow

**PROMPT TO PASTE:**

```
Implement the magic mobile clip moment.

In the Live tab:
- Show currently-live channels the user follows on Clipt.
- Tapping a channel opens a dedicated viewer screen with:
  - The platform-native player (use react-native-webview for Twitch/Kick; Expo's YouTube embed for YouTube).
  - A floating "Clip" button at the bottom (haptic feedback on tap).
  - On tap: call createLiveClip server action via shared API client.
  - On success: navigate to a Compose screen pre-filled with the new clip.

Compose screen:
- Vertical preview of the still-processing clip (with progress indicator).
- Caption editor (tap to edit each segment).
- Music suggestions (3 tracks pre-cleared for short-form posting).
- Destination picker (TikTok / IG Reels / YT Shorts) — only show connected platforms.
- "Post" button.

Performance:
- The "Clip" tap must visually acknowledge in < 200ms (haptic + button press state) even if the network call takes longer.
- Show clear progress on the Compose screen.

Push notifications:
- Send a notification when a fan-clipped video crosses 10K views, 100K views, 1M views.
- Streamers get notified when their clips are auto-detected from chat spikes / audio.
- Use Expo Notifications + APNs/FCM.
```

**ACCEPTANCE CHECKS:**
- [ ] Tap-to-clip on a live channel ends with a posted clip in < 60s on a typical connection.
- [ ] Push notifications arrive on iOS and Android.

---

## Prompt 3.3 — Stripe Connect Express onboarding

**PROMPT TO PASTE:**

```
Wire Stripe Connect Express for creator and clipper payouts.

Add to /dashboard/payouts:
- "Set up payouts" button → calls server action createConnectExpressAccount which:
  - Creates a Stripe Connect Express account if profiles.stripe_connect_account_id is null.
  - Generates an account link with type='account_onboarding'.
  - Returns the URL.
- After return, server action checkConnectStatus updates profiles.stripe_connect_account_id and stripe_connect_status ('pending', 'verified', 'restricted').

Once onboarded:
- Show a balance widget reading earnings_ledger sum + Stripe balance.
- Show payout history (clip-level).

Cron Inngest function payoutDaily:
- For each profile where payout_balance_cents > 100 (i.e., $1+), create a Stripe Transfer for the amount, mark earnings_ledger rows as paid_out_at = now and stripe_transfer_id.

Compliance:
- 1099 reporting: Stripe handles US tax forms automatically through Connect.
- Country support: start with US + Canada + UK + EU + Australia. Block other countries on the onboarding step with a clear message.
```

**ACCEPTANCE CHECKS:**
- [ ] User can complete Stripe Connect onboarding from /dashboard/payouts.
- [ ] Payouts > $1 trigger via the daily Inngest job.
- [ ] Restricted accounts show a clear remediation message.

---

## Prompt 3.4 — Creator revenue share (subscriptions)

**PROMPT TO PASTE:**

```
Implement automatic creator revenue share for the Subscription source (marketplace earnings come in Phase 4).

The model:
- 25% of net subscription revenue attributable to a clip routes to the original creator (the streamer whose footage made the clip).
- "Attributable" = a paying subscriber watched/created clips from that streamer in the last 30 days, weighted proportionally to engagement.

Implementation:
1. Add a monthly Inngest cron computeRevenueShareMonthly (1st of each month, 02:00 UTC).
2. For each profile with active subscription_tier in ('creator','pro'):
   - Sum their net subscription revenue for the last month (pull from Stripe charges).
   - Compute their engagement vector across creators: for each creator C, share = (clips_watched_or_made_from_C / total_clips_watched_or_made) for that subscriber in the last 30 days.
   - For each creator C with share > 0:
     - amount_to_creator_cents = round(net_subscription * 0.25 * share)
     - Insert earnings_ledger row { profile_id: C, source: 'subscription', amount_cents, occurred_at: now }.
     - Increment profiles.payout_balance_cents.
3. Send the creator an email + push notification: "You earned $X.XX from Clipt subscribers who clipped your moments last month."

Auditability:
- The earnings_ledger row references the source clips (via a JSON 'attribution_breakdown' column to be added in 0003 migration) so creators can see exactly which clips contributed.

UI:
- /dashboard/earnings — month-by-month breakdown by source, top contributing clips, payout history.
```

**ACCEPTANCE CHECKS:**
- [ ] Test month with 1 subscriber + 1 creator + 5 clips routes 25% of $9 → $2.25 to the creator.
- [ ] Earnings page shows the breakdown.

---

# PHASE 4 — BRAND MARKETPLACE

> **Outcome:** Brands run paid clipping campaigns through Clipt with verified attribution, KYC'd clippers, automatic FTC disclosure, and audit-grade compliance reports. This unlocks a second monetization vector and the second creator-revenue source.

---

## Prompt 4.1 — Brand campaign console

**PROMPT TO PASTE:**

```
Build the brand-side console at /brands.

Create role 'brand' on profiles. Brand-tier signup is gated (require admin approval via a verification email to ops).

Brand-only routes under /brands:
- /brands/dashboard — campaign list, summary metrics.
- /brands/campaigns/new — create a campaign.
- /brands/campaigns/[id] — campaign detail with clip submissions, view tracking, payouts.
- /brands/billing — funding deposits via Stripe (top up campaign budget).
- /brands/compliance/[campaignId] — generate audit report.

Campaign creation form:
- Source content: paste 1-N source video URLs (the clipper turns these into shorts).
- Brief: Markdown text describing dos/don'ts.
- Budget: amount + max-per-clip cap.
- CPM: set in cents (validate against Clipt minimums by niche).
- Niche filter: gaming / finance / SaaS / fitness / etc.
- Brand-safety tier required: bronze / silver / gold (defaults to silver).
- Geo and language requirements.
- Posting platforms allowed (TikTok / Reels / Shorts).
- Disclosure: auto-applied #ad + 'Paid Partnership with {Brand}'; brand can specify the brand handle.

Tables to add (migration 0004_marketplace.sql):
- campaigns (id, brand_profile_id, status, brief, budget_cents, spent_cents, cpm_cents, niche, brand_safety_tier, geo, languages text[], allowed_platforms text[], created_at, ends_at)
- campaign_sources (id, campaign_id, source_url, source_video_r2_key)
- campaign_submissions (id, campaign_id, clipper_profile_id, clip_id, status check status in ('pending_review','approved','rejected','paid','disputed'), reviewer_notes, approved_at, paid_at)
```

**ACCEPTANCE CHECKS:**
- [ ] Brand can create a funded campaign and see it in their dashboard.
- [ ] Clippers can browse the campaign in the marketplace (Prompt 4.3).

---

## Prompt 4.2 — Clipper KYC + tier system

**PROMPT TO PASTE:**

```
Implement clipper-side identity verification + tier classification.

Use Stripe Identity (or Persona — choose Stripe Identity for simpler integration).

Add to profiles:
- kyc_status text default 'none' check kyc_status in ('none','pending','verified','rejected')
- kyc_verified_at timestamptz
- brand_safety_tier text default 'bronze' check tier in ('bronze','silver','gold')
- recent_violations_count int default 0 (for FTC and brand-safety violations)

Onboarding flow at /clippers/verify:
- Show benefits (access to higher-tier campaigns, gold-tier earnings premium).
- "Start verification" → creates a Stripe Identity verification session, returns the URL.
- After verification, webhook /api/stripe/identity-webhook updates kyc_status.

Tier rules (auto-evaluated nightly via Inngest):
- bronze: KYC verified.
- silver: bronze + 30 days on platform + ≥ 10 successful campaign clips + zero violations.
- gold: silver + 90 days on platform + ≥ 50 successful campaign clips + ≥ 95% approval rate + zero violations in 60 days.

Violations:
- FTC disclosure missing on a paid post (auto-detected on post-publish scan): -1 tier, recent_violations_count++.
- Off-brief content rejected by brand: counts toward approval rate.
- Account farming detected (one user posting from accounts owned by another): permanent ban.
```

**ACCEPTANCE CHECKS:**
- [ ] User completes KYC and reaches bronze.
- [ ] After meeting silver criteria, the nightly job promotes them.
- [ ] Violation drops the tier and is reflected in UI.

---

## Prompt 4.3 — Campaign matching + clipper marketplace UI

**PROMPT TO PASTE:**

```
Build the clipper-facing marketplace at /clippers.

Routes:
- /clippers/marketplace — list of active campaigns the user qualifies for (tier ≥ requirement, geo/language match).
- /clippers/marketplace/[campaignId] — campaign detail, source-video previews, brief, "Take this campaign" button.
- /clippers/submissions — list of clips the user submitted to campaigns, status.

Algorithm for campaign feed:
- Score = (cpm * 1.0) + (niche_match_score * 0.3) + (recency_score * 0.2) + (brand_reputation_score * 0.2). Sort desc.

Submission flow:
- Clipper selects a source video → opens Compose flow with the source pre-loaded.
- After publishing the clip to TikTok/Reels/Shorts, automatically register the clip as a campaign submission (status='pending_review').
- Brand reviews via /brands/campaigns/[id] → approves or rejects with notes.
- On approval, the clip starts accruing earnings as views come in (synced via existing post-stats job).

Earnings:
- For every 1000 verified views beyond a deduction baseline, the campaign budget is debited cpm_cents and 75% goes to the clipper, 25% to the original creator (if attribution is verified). Platform takes 10% off the top before split.

Update earnings_ledger to include source='marketplace' and add columns campaign_id, submission_id, view_count_at_event.

Add a "Earnings" column to /clippers/submissions live-updating as views grow.
```

**ACCEPTANCE CHECKS:**
- [ ] Bronze user sees only bronze-eligible campaigns.
- [ ] Submitting a clip creates a campaign_submissions row.
- [ ] Approved clips earn proportional to verified view growth.

---

## Prompt 4.4 — FTC disclosure automation + compliance reports

**PROMPT TO PASTE:**

```
Implement automatic FTC disclosure on every paid post + audit-grade compliance reporting.

Disclosure rules:
- Every post published to TikTok/Reels/Shorts as part of a campaign auto-prepends to the caption: "#ad Paid partnership with @{brand_handle}." Cannot be removed by clipper.
- For Reels, also call Meta's Branded Content API to set the partner tag.
- For TikTok, set the disclosure_type to 'paid_partnership' via their API.
- For YouTube Shorts, use the youtube.videos.update with paidPromotion=true.

Verification (nightly Inngest):
- For each campaign_submission with platform_post_id, fetch the post and verify:
  1. The disclosure text is present.
  2. The platform's structured branded-content tag is set.
- If missing, mark submission disputed=true and notify the clipper to fix; if not fixed in 24h, retract earnings + tier penalty.

Compliance report at /brands/compliance/[campaignId]:
- Date range, campaign brief, total spend.
- Per-clipper KYC status snapshot.
- Per-submission: post URL, screenshot at time of approval (we'll capture this at approval time using puppeteer in workers/video), disclosure verification timestamp, view-count audit trail (sampled hourly).
- Export as PDF using @react-pdf/renderer.

Make this page accessible only to the brand's profile and admins.
```

**ACCEPTANCE CHECKS:**
- [ ] Every campaign post has #ad in caption and platform's branded-content tag set.
- [ ] PDF compliance report generates with all required artifacts.
- [ ] Missing disclosure penalty triggers within 24h.

---

# PHASE 5 — DISCOVERY & SCALE

> **Outcome:** Users open Clipt to discover trending clips. Embeddable widgets push the feed onto Discord, X, Reddit. The platform compounds organic distribution.

---

## Prompt 5.1 — Algorithmic clip feed backend

**PROMPT TO PASTE:**

```
Build the discovery feed.

Tables:
- feed_events (id, clip_id, event_type ['view','watch_complete','share','clip_made'], user_id nullable, occurred_at)
- clip_scores (clip_id, velocity_score float, freshness_score float, engagement_score float, total_score float, computed_at)

Compute job (Inngest cron, every 5 minutes):
- For each clip created in the last 7 days:
  - velocity_score = views_in_last_hour / hours_since_post
  - freshness_score = exp(-hours_since_post / 24)
  - engagement_score = (likes + 2*shares + 5*clips_made_from_this) / views
  - total_score = 0.5*velocity + 0.3*engagement + 0.2*freshness
- Upsert into clip_scores.

Feed query:
- /api/feed/personalized?cursor=... returns 20 clips:
  - Filter to clips the user hasn't seen recently.
  - Rerank by: 0.6*total_score + 0.4*creator_affinity_score (computed from user's follow + watch history).
- /api/feed/trending?niche=gaming returns top by total_score in a niche window.

Cache aggressively (Vercel ISR, 60s).

Tracking:
- On every clip view from feed, post a feed_events row (use Vercel server actions; avoid client-side tracking for adblockers).
```

**ACCEPTANCE CHECKS:**
- [ ] Feed returns reasonable order (recent + high-velocity first).
- [ ] Personalization changes the order for users with watch history.

---

## Prompt 5.2 — Discovery UI + embeddable widget

**PROMPT TO PASTE:**

```
Build the discovery UI + embeddable widget.

Web at /discover:
- Vertical scroll-snap feed of clips (TikTok-like).
- Tap to like, double-tap heart animation.
- Swipe up: next clip.
- Top filter bar: All / Following / Niche.
- Right-side action rail: like / share / "make a clip from this" / source-channel link.

Mobile (apps/mobile, Home tab):
- Same layout, native gesture handlers.

Embeddable widget at /embed/feed?niche=gaming&theme=dark:
- Lightweight HTML page (no auth required).
- Renders the trending feed with a Clipt watermark linking back.
- Provides postMessage events for parent pages (track impressions).
- Add a /docs/embed page describing how to embed in Discord (using webhook bots), X (oEmbed), and Reddit (iframe widget pattern).

Sharing:
- Each clip card has a "Share" button that copies a deep-link to the public clip page.
- Open Graph/Twitter card meta from Prompt 1.12 makes shared links rich.
```

**ACCEPTANCE CHECKS:**
- [ ] /discover scrolls smoothly with auto-play of vertical clips.
- [ ] Embed iframe renders on a third-party page.

---

## Prompt 5.3 — Analytics dashboard

**PROMPT TO PASTE:**

```
Build analytics dashboards for each role.

For creators (/dashboard/analytics):
- Total views, total clips, total earnings (week/month/all-time).
- Top-performing clips list.
- "Where are my clips being seen?" — platform breakdown.
- "Who's clipping me?" — top fans + clippers list.

For clippers (/clippers/analytics):
- Views per platform, earnings per campaign, approval rate, current tier.
- Tier-progression bar showing distance to next tier.

For brands (/brands/analytics):
- Spend, verified views, CPM realized, top clippers by performance, niche-level breakdown.

For admins (/admin/analytics):
- DAU / WAU / MAU, retention cohorts, GMV (gross marketplace volume), violation rates.

Tech:
- Use Recharts (already a friendly default in shadcn ecosystem).
- Cache analytics responses 1 hour for non-admin views.
- Server actions, never expose raw analytics SQL to clients.
```

**ACCEPTANCE CHECKS:**
- [ ] Each role sees the right dashboard with no data leakage across roles.
- [ ] Analytics load in < 2s for typical accounts.

---

# Working with Claude Code on this codebase

## Patterns that pay off

- **Always paste the relevant CLAUDE.md sections at the top of new sessions.** Claude Code re-reads it but reinforcing keeps drift down.
- **End every prompt with "and run pnpm lint, pnpm tsc --noEmit, and any tests you wrote, fix issues, and commit with a Conventional Commit message."**
- **Reject one-shot mega-features.** If a prompt covers more than two of (UI, server action, migration, background job), split it.
- **When a prompt fails halfway, paste the failing test output back to Claude Code and let it iterate. Don't restart the prompt.**
- **For external integrations (Twitch, Stripe, TikTok), paste the relevant doc URL into the prompt.** Claude Code will fetch and read it before coding.

## Patterns that don't

- **"Do whatever you think is best"** — Claude Code will pick a reasonable thing but it won't necessarily match the conventions in CLAUDE.md.
- **Skipping migrations** — every schema change must be a migration, not an ad-hoc Supabase dashboard edit. Otherwise teammates (or future-you) lose state.
- **Silently changing the stack mid-project** — if you switch from Supabase to PlanetScale or Inngest to Trigger.dev, do it as a dedicated migration prompt, not a side change.

## Recovery moves

- **Borked migrations:** keep the supabase/migrations/ folder in source control; reset with `supabase db reset` locally.
- **Inngest job stuck:** cancel in the Inngest dashboard, fix the function, redeploy.
- **R2 garbage:** soft-deleted clips' files are purged by a weekly Inngest job (Prompt — TODO: add `garbageCollectR2` cron in Phase 1.16).
- **Auth loops:** clear `sb-*` cookies in the browser DevTools; usually a stale session.

---

# Final notes

This pack covers the full Clipt build. Total scope is ambitious — likely 14–22 months of focused solo + AI work. That's fine. Each prompt is one shippable increment; commit, deploy, sleep on it.

Three rules to keep yourself sane:
1. Phase 0 + Phase 1 are non-negotiable. Don't skip ahead.
2. Don't ship Phase 4 (marketplace) until Phase 1 has 100+ active creators. Liquidity will not bootstrap itself.
3. The verified-attribution layer (Prompt 1.11) is the highest-leverage piece of code in the entire system. Get it right; reuse it everywhere.

Good luck. The codebase will tell you when something's wrong; listen to it.
