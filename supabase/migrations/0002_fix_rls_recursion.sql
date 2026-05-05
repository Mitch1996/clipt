-- ============================================================
-- 0002 — fix RLS recursion on profiles + admin policies
--
-- The original 0001 migration shipped admin policies whose USING
-- clause inlined `select 1 from profiles where role = 'admin'`. On
-- the profiles table itself this self-references and Postgres
-- raises "infinite recursion detected in policy for relation
-- profiles" the first time RLS evaluates a SELECT on profiles.
--
-- Fix: introduce public.is_admin(uid) as a SECURITY DEFINER
-- function that runs with the function owner's privileges, so its
-- inner read of profiles bypasses RLS. Replace every inlined admin
-- check with a call to that function.
-- ============================================================

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

-- Lock the function down: only authenticated/anon roles need EXECUTE,
-- and we revoke from PUBLIC explicitly to avoid surprises.
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated, service_role;

-- ----------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------
drop policy if exists "profiles: admins can do anything" on public.profiles;

create policy "profiles: admins can do anything"
on public.profiles for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------
-- channels
-- ----------------------------------------------------------------
drop policy if exists "channels: admins can read" on public.channels;

create policy "channels: admins can read"
on public.channels for select
using (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------
-- clips
-- ----------------------------------------------------------------
drop policy if exists "clips: admins can do anything" on public.clips;

create policy "clips: admins can do anything"
on public.clips for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------
-- clip_posts
-- ----------------------------------------------------------------
drop policy if exists "clip_posts: admins can do anything" on public.clip_posts;

create policy "clip_posts: admins can do anything"
on public.clip_posts for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------
-- attributions
-- ----------------------------------------------------------------
drop policy if exists "attributions: admins can do anything" on public.attributions;

create policy "attributions: admins can do anything"
on public.attributions for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------
-- earnings_ledger
-- ----------------------------------------------------------------
drop policy if exists "earnings_ledger: admins can do anything" on public.earnings_ledger;

create policy "earnings_ledger: admins can do anything"
on public.earnings_ledger for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------
-- waitlist
-- ----------------------------------------------------------------
drop policy if exists "waitlist: admins can read" on public.waitlist;

create policy "waitlist: admins can read"
on public.waitlist for select
using (public.is_admin(auth.uid()));
