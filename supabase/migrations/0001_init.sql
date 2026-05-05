-- ============================================================
-- Clipt — initial schema (Prompt 0.3)
-- Tables: profiles, channels, clips, clip_posts, attributions,
--         earnings_ledger, waitlist
-- Conventions:
--   * snake_case columns
--   * timestamptz for all time fields
--   * updated_at maintained via trigger
--   * RLS enabled on every table; explicit policies below
-- ============================================================

-- ----------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------
-- Helper: updated_at trigger
-- ----------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------
-- profiles
-- One row per auth.users. Public-readable subset (id, handle,
-- display_name, avatar_url) gated by a view-style policy below.
-- ----------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null,
  display_name text,
  avatar_url text,
  role text not null default 'creator'
    check (role in ('creator', 'clipper', 'brand', 'admin')),
  stripe_customer_id text,
  stripe_connect_account_id text,
  payout_balance_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Owner can read & update their own row.
create policy "profiles: owner can read own"
on public.profiles for select
using (auth.uid() = id);

create policy "profiles: owner can update own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Public can read every profile (we rely on column-level gating in app
-- code: clients should select only id, handle, display_name, avatar_url).
-- A future hardening pass can replace this with a public view that
-- explicitly projects only the safe columns. Documented in CLAUDE.md.
create policy "profiles: public can read"
on public.profiles for select
to anon, authenticated
using (true);

-- Admins can do anything.
create policy "profiles: admins can do anything"
on public.profiles for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- ----------------------------------------------------------------
-- channels
-- A connected source channel (Twitch / YouTube / Kick) for a
-- profile. Tokens are stored encrypted in app code — this column
-- holds ciphertext.
-- ----------------------------------------------------------------
create table public.channels (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null
    check (platform in ('twitch', 'youtube', 'kick')),
  platform_user_id text not null,
  platform_username text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  scopes text[],
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, platform_user_id)
);

create index channels_owner_id_idx on public.channels (owner_id);

create trigger channels_set_updated_at
before update on public.channels
for each row execute function public.set_updated_at();

alter table public.channels enable row level security;

create policy "channels: owner can do anything"
on public.channels for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "channels: admins can read"
on public.channels for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- ----------------------------------------------------------------
-- clips
-- A single produced clip. Sources can be a Twitch clip, VOD, YouTube
-- video / short, or Kick clip. Status flows pending → processing →
-- ready | failed.
-- ----------------------------------------------------------------
create table public.clips (
  id uuid primary key default uuid_generate_v4(),
  source_channel_id uuid references public.channels(id) on delete set null,
  source_url text,
  source_platform text,
  source_creator_profile_id uuid references public.profiles(id) on delete set null,
  clipper_profile_id uuid references public.profiles(id) on delete set null,
  title text,
  duration_seconds int,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'failed')),
  processing_error text,
  video_r2_key text,
  vertical_video_r2_key text,
  captions_json jsonb,
  view_count_total int not null default 0,
  earnings_cents bigint not null default 0,
  attribution_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clips_source_creator_idx on public.clips (source_creator_profile_id);
create index clips_clipper_idx on public.clips (clipper_profile_id);
create index clips_status_idx on public.clips (status);
create index clips_created_at_idx on public.clips (created_at desc);

create trigger clips_set_updated_at
before update on public.clips
for each row execute function public.set_updated_at();

alter table public.clips enable row level security;

-- Owner-style read: source creator OR clipper.
create policy "clips: source creator or clipper can read"
on public.clips for select
using (
  auth.uid() = source_creator_profile_id
  or auth.uid() = clipper_profile_id
);

-- Public read of "ready" clips (the public clip page at /c/[id]).
create policy "clips: ready clips are public"
on public.clips for select
to anon, authenticated
using (status = 'ready');

-- Owner-style update: source creator OR clipper can update their clip.
create policy "clips: source creator or clipper can update"
on public.clips for update
using (
  auth.uid() = source_creator_profile_id
  or auth.uid() = clipper_profile_id
)
with check (
  auth.uid() = source_creator_profile_id
  or auth.uid() = clipper_profile_id
);

create policy "clips: admins can do anything"
on public.clips for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- ----------------------------------------------------------------
-- clip_posts
-- Cross-platform publish records (TikTok / IG Reels / YT Shorts).
-- ----------------------------------------------------------------
create table public.clip_posts (
  id uuid primary key default uuid_generate_v4(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  platform text not null,
  platform_post_id text,
  posted_by_profile_id uuid references public.profiles(id) on delete set null,
  posted_at timestamptz,
  view_count int not null default 0,
  like_count int not null default 0,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clip_posts_clip_id_idx on public.clip_posts (clip_id);
create index clip_posts_posted_by_idx on public.clip_posts (posted_by_profile_id);

create trigger clip_posts_set_updated_at
before update on public.clip_posts
for each row execute function public.set_updated_at();

alter table public.clip_posts enable row level security;

-- Read access mirrors the parent clip: source creator, clipper, or
-- public for "ready" clips.
create policy "clip_posts: read via parent clip"
on public.clip_posts for select
using (
  exists (
    select 1 from public.clips c
    where c.id = clip_posts.clip_id
      and (
        auth.uid() = c.source_creator_profile_id
        or auth.uid() = c.clipper_profile_id
        or c.status = 'ready'
      )
  )
);

create policy "clip_posts: admins can do anything"
on public.clip_posts for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- ----------------------------------------------------------------
-- attributions
-- Cryptographic-attribution rows. Splits live as basis points
-- (0.25 == 2500 bp).
-- ----------------------------------------------------------------
create table public.attributions (
  id uuid primary key default uuid_generate_v4(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  original_creator_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  share_basis_points int not null default 2500
    check (share_basis_points between 0 and 10000),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'disputed')),
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index attributions_clip_id_idx on public.attributions (clip_id);
create index attributions_creator_idx on public.attributions (original_creator_profile_id);

create trigger attributions_set_updated_at
before update on public.attributions
for each row execute function public.set_updated_at();

alter table public.attributions enable row level security;

create policy "attributions: original creator can read"
on public.attributions for select
using (auth.uid() = original_creator_profile_id);

create policy "attributions: clipper can read"
on public.attributions for select
using (
  exists (
    select 1 from public.clips c
    where c.id = attributions.clip_id
      and auth.uid() = c.clipper_profile_id
  )
);

create policy "attributions: admins can do anything"
on public.attributions for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- ----------------------------------------------------------------
-- earnings_ledger
-- Immutable record of an earnings event for a profile. Drives the
-- payout pipeline (Stripe Connect transfers).
-- ----------------------------------------------------------------
create table public.earnings_ledger (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  clip_id uuid references public.clips(id) on delete set null,
  source text not null
    check (source in ('subscription', 'marketplace', 'tip')),
  amount_cents bigint not null,
  currency text not null default 'usd',
  occurred_at timestamptz not null default now(),
  paid_out_at timestamptz,
  stripe_transfer_id text,
  created_at timestamptz not null default now()
);

create index earnings_ledger_profile_idx on public.earnings_ledger (profile_id);
create index earnings_ledger_occurred_at_idx on public.earnings_ledger (occurred_at desc);
create index earnings_ledger_unpaid_idx on public.earnings_ledger (profile_id) where paid_out_at is null;

alter table public.earnings_ledger enable row level security;

create policy "earnings_ledger: owner can read"
on public.earnings_ledger for select
using (auth.uid() = profile_id);

create policy "earnings_ledger: admins can do anything"
on public.earnings_ledger for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- ----------------------------------------------------------------
-- waitlist
-- Public sign-up form storage.
-- ----------------------------------------------------------------
create table public.waitlist (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  segment text not null
    check (segment in ('streamer', 'fan', 'clipper', 'brand', 'other')),
  source text,
  created_at timestamptz not null default now()
);

create index waitlist_segment_idx on public.waitlist (segment);

alter table public.waitlist enable row level security;

create policy "waitlist: anyone can insert"
on public.waitlist for insert
to anon, authenticated
with check (true);

create policy "waitlist: admins can read"
on public.waitlist for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
