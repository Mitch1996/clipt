-- ============================================================
-- 0011 — extend channels for publishing platforms + add scheduling
--
-- Prompt 1.14 wires three more publish destinations: TikTok,
-- Instagram Reels, YouTube Shorts. The YouTube one piggybacks on the
-- existing youtube channel row (just upgrades scopes), so only the
-- two new platforms need to be allowed in the channels.platform
-- check. clip_posts also gains a scheduled_for column so the
-- publish UI can defer a post via Inngest's step.sleepUntil.
-- ============================================================

-- 1. Allow tiktok + instagram in channels.platform.
alter table public.channels
  drop constraint if exists channels_platform_check;
alter table public.channels
  add constraint channels_platform_check
    check (platform in ('twitch', 'youtube', 'kick', 'tiktok', 'instagram'));

-- 2. Allow the same five platforms in clip_posts (was untyped before).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clip_posts_platform_check'
  ) then
    alter table public.clip_posts
      add constraint clip_posts_platform_check
      check (platform in ('twitch', 'youtube', 'kick', 'tiktok', 'instagram', 'youtube_shorts'));
  end if;
end$$;

-- 3. Schedule support — when set, the publish action deferred via
--    Inngest step.sleepUntil instead of firing immediately.
alter table public.clip_posts
  add column if not exists scheduled_for timestamptz;

create index if not exists clip_posts_scheduled_idx
  on public.clip_posts (scheduled_for)
  where scheduled_for is not null;

-- 4. RLS: allow the post owner to insert + update their own clip_posts
--    rows. The 0001 baseline only had read + admin-all; without an
--    INSERT policy the publish server actions would all 401 with RLS
--    violations.
create policy "clip_posts: owner can insert"
on public.clip_posts for insert
to authenticated
with check (auth.uid() = posted_by_profile_id);

create policy "clip_posts: owner can update"
on public.clip_posts for update
to authenticated
using (auth.uid() = posted_by_profile_id)
with check (auth.uid() = posted_by_profile_id);
