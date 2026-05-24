-- ----------------------------------------------------------------
-- Phase 4.1 — Brand campaign console
--
-- Three tables form the marketplace spine:
--   1. campaigns               brand-funded clipping campaigns
--   2. campaign_sources        one or more source videos per campaign
--                              that clippers turn into shorts
--   3. campaign_submissions    a clip submitted by a clipper to a
--                              specific campaign; review state +
--                              earnings ledger entry on approval
--
-- The 'brand' role already exists on profiles (0001_*.sql). RLS
-- policies here gate writes to the row's brand_profile_id +
-- public.is_admin().
-- ----------------------------------------------------------------

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.profiles(id) on delete cascade,

  -- Campaign lifecycle. 'draft' = brand still editing, 'active' =
  -- live in the marketplace, 'paused' = brand-paused (no new
  -- submissions, existing submissions still earn), 'ended' = budget
  -- exhausted or ends_at passed.
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'ended')),

  title text not null,
  brief text not null default '',

  budget_cents integer not null default 0
    check (budget_cents >= 0),
  spent_cents integer not null default 0
    check (spent_cents >= 0),
  cpm_cents integer not null default 0
    check (cpm_cents >= 0),
  -- Hard cap per clip to limit upside on viral surprises.
  max_per_clip_cents integer
    check (max_per_clip_cents is null or max_per_clip_cents >= 0),

  niche text not null default 'general'
    check (niche in (
      'general', 'gaming', 'finance', 'saas', 'fitness',
      'tech', 'lifestyle', 'food', 'sports', 'music'
    )),

  -- Brand-safety tier required of the clipper (4.2 will populate
  -- profiles.brand_safety_tier). 'silver' is the platform default.
  brand_safety_tier text not null default 'silver'
    check (brand_safety_tier in ('bronze', 'silver', 'gold')),

  geo text[] not null default '{}',
  languages text[] not null default '{}',
  allowed_platforms text[] not null default array['tiktok','reels','shorts']
    check (allowed_platforms <@ array['tiktok','reels','shorts','x']),

  -- Disclosure copy. Brand can specify their @handle for the
  -- 'Paid Partnership with @brand' tag the publisher prepends.
  brand_handle text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ends_at timestamptz
);

create index campaigns_brand_idx on public.campaigns (brand_profile_id);
create index campaigns_status_idx on public.campaigns (status)
  where status = 'active';
create index campaigns_created_at_idx on public.campaigns (created_at desc);


create table if not exists public.campaign_sources (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_url text,
  source_video_r2_key text,
  title text,
  position integer not null default 0,
  created_at timestamptz not null default now(),

  -- Either a URL OR an uploaded video, at least one of them.
  check (source_url is not null or source_video_r2_key is not null)
);

create index campaign_sources_campaign_idx on public.campaign_sources (campaign_id, position);


create table if not exists public.campaign_submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  clipper_profile_id uuid not null references public.profiles(id) on delete cascade,
  clip_id uuid not null references public.clips(id) on delete cascade,

  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'paid', 'disputed')),

  reviewer_notes text,
  approved_at timestamptz,
  paid_at timestamptz,

  -- Earnings counters — denormalised from clip_posts.view_count via
  -- the post-stats Inngest job so the campaign detail view doesn't
  -- have to re-aggregate on every render.
  verified_views integer not null default 0
    check (verified_views >= 0),
  earned_cents integer not null default 0
    check (earned_cents >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One submission per (campaign, clip) pair — clippers can't double-
  -- submit the same render.
  unique (campaign_id, clip_id)
);

create index campaign_submissions_campaign_idx
  on public.campaign_submissions (campaign_id, status);
create index campaign_submissions_clipper_idx
  on public.campaign_submissions (clipper_profile_id, created_at desc);


-- ─── RLS ─────────────────────────────────────────────────────────

alter table public.campaigns enable row level security;
alter table public.campaign_sources enable row level security;
alter table public.campaign_submissions enable row level security;

-- Campaigns: brand sees their own; clippers see active ones (so the
-- marketplace can read them); admin sees all.
create policy campaigns_select_own on public.campaigns
  for select using (
    auth.uid() = brand_profile_id
    or status = 'active'
    or public.is_admin(auth.uid())
  );

create policy campaigns_insert_brand on public.campaigns
  for insert with check (
    auth.uid() = brand_profile_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'brand'
    )
  );

create policy campaigns_update_own on public.campaigns
  for update using (
    auth.uid() = brand_profile_id
    or public.is_admin(auth.uid())
  );

create policy campaigns_delete_own on public.campaigns
  for delete using (
    auth.uid() = brand_profile_id
    or public.is_admin(auth.uid())
  );


-- Campaign sources: same surface as their parent campaign.
create policy campaign_sources_select on public.campaign_sources
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and (
          c.brand_profile_id = auth.uid()
          or c.status = 'active'
          or public.is_admin(auth.uid())
        )
    )
  );

create policy campaign_sources_write on public.campaign_sources
  for all using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and (c.brand_profile_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );


-- Submissions: clipper sees their own; brand sees submissions to
-- their campaigns; admin sees all.
create policy campaign_submissions_select on public.campaign_submissions
  for select using (
    auth.uid() = clipper_profile_id
    or exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and (c.brand_profile_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

-- Clippers self-submit. The submission write is gated by the clip
-- ownership AND a check that the campaign is active.
create policy campaign_submissions_insert_clipper on public.campaign_submissions
  for insert with check (
    auth.uid() = clipper_profile_id
    and exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.status = 'active'
    )
    and exists (
      select 1 from public.clips cl
      where cl.id = clip_id and cl.clipper_profile_id = auth.uid()
    )
  );

-- Only the brand (or admin) can update review state.
create policy campaign_submissions_update_brand on public.campaign_submissions
  for update using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_id
        and (c.brand_profile_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );


-- ─── Brand-access requests ──────────────────────────────────────
--
-- Brand signup is gated. A user submits a request via the dashboard;
-- an admin reviews + promotes their profiles.role from 'creator' to
-- 'brand'. Keeping this in the same migration since it's part of
-- the same marketplace shipping unit.

create table if not exists public.brand_access_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  company_name text not null,
  company_url text,
  intended_use text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewer_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (profile_id)  -- one pending request per profile
);

create index brand_access_requests_status_idx
  on public.brand_access_requests (status, created_at)
  where status = 'pending';

alter table public.brand_access_requests enable row level security;

create policy brand_access_select_own on public.brand_access_requests
  for select using (
    auth.uid() = profile_id or public.is_admin(auth.uid())
  );

create policy brand_access_insert_self on public.brand_access_requests
  for insert with check (auth.uid() = profile_id);

create policy brand_access_update_admin on public.brand_access_requests
  for update using (public.is_admin(auth.uid()));
