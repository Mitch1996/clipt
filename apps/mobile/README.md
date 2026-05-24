# @clipt/mobile

Expo (React Native + TypeScript) mobile companion to the web app.

## Status

Phase 3.1 scaffold:

- Expo Router (file-based routing)
- NativeWind 4 (Tailwind tokens shared with web)
- Supabase auth (email + password, AsyncStorage-persisted session)
- 4 tabs: Home / Live / My Clips / Profile

Phase 3.2 (one-tap clip flow, native player, haptics, push notifications) is still ahead.

## Run it

Mobile installs ISOLATED from the workspace (see the Monorepo gotchas section below). From this directory:

```bash
cd apps/mobile
pnpm install --ignore-workspace
cp .env.example .env.local
# Fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
# (same values as ../web/.env.local)
pnpm start
```

Then either:

- **Expo Go** on your phone: scan the QR code from the dev server
- **iOS simulator** (Mac only): press `i` in the dev server
- **Android emulator**: press `a`

The web target (`pnpm web`) compiles but isn't a goal — the web app at clipt.live is the canonical browser surface.

## Architecture

- `app/` — Expo Router file-based routes
  - `_layout.tsx` — root layout, mounts providers, decides auth gate
  - `index.tsx` — startup redirect into `(tabs)`
  - `sign-in.tsx`, `sign-up.tsx` — email/password auth
  - `(tabs)/` — bottom-tab navigation
    - `_layout.tsx` — tab config (Home / Live / Clips / Profile)
    - `home.tsx` — discovery feed placeholder
    - `live.tsx` — currently-live owned channels
    - `clips.tsx` — user's clips list
    - `profile.tsx` — account + logout + web deep-links
- `src/lib/supabase.ts` — supabase-js client w/ AsyncStorage adapter
- `src/features/auth/AuthProvider.tsx` — session context + sign-out

## Brand tokens

`tailwind.config.js` mirrors the web app's [globals.css](../web/src/app/globals.css) brand tokens but with direct hex values (NativeWind 4 can't resolve CSS variables on RN — no DOM, no `:root`). Keep both files in sync when changing brand colors.

## Monorepo gotchas

**Mobile is excluded from the root pnpm workspace.** Adding it back triggers a pnpm peer-dep resolution conflict between React 19 (web) and React 18 (RN 0.76) that breaks `apps/web`'s typecheck. The symptom: every shadcn/radix `forwardRef` component fails JSX type-check with a `ReactNode is not assignable to React.ReactNode` error citing `ReactPortal.children`. No version of `@types/react` fixes it; the real fix is keeping the two install graphs apart.

Practical implication:
- `pnpm install` at the repo root only installs web + workers. Mobile is invisible to it.
- Mobile installs separately via `cd apps/mobile && pnpm install --ignore-workspace` (own lockfile at `apps/mobile/pnpm-lock.yaml`).
- Code sharing between web ↔ mobile happens through `packages/*` (workspace-only) which mobile pulls in by copying or via npm publish, NOT via workspace symlinks. Defer building that until there's actual shared code worth maintaining.

## Not yet built

- Twitch / Google / Apple OAuth (web has Twitch; mobile needs the deep-link callback wired)
- Push notifications (Expo Notifications + APNs / FCM)
- Native video player for live tab
- Tap-to-clip server action call + compose screen
