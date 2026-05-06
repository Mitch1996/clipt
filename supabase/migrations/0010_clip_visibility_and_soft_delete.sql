-- ============================================================
-- 0010 — clip visibility + soft delete (Prompt 1.13)
--
-- Adds:
--   - clips.visibility ('public' | 'unlisted', default 'public') —
--     /c/[id] hides 'unlisted' clips; the editor toggles this.
--   - clips.deleted_at — soft-delete column. The editor's Delete
--     button writes here instead of removing the row, so we keep
--     R2 artifacts + DB history; a future cron purges blob storage
--     after a retention window.
--
-- The RLS policies for SELECT need to gate on these too. The original
-- "ready clips are public" policy is now stricter: visibility must be
-- 'public' AND deleted_at must be null.
-- ============================================================

alter table public.clips
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'unlisted')),
  add column if not exists deleted_at timestamptz;

create index if not exists clips_deleted_at_idx
  on public.clips (deleted_at);

-- Replace the public-read policy with a stricter one.
drop policy if exists "clips: ready clips are public" on public.clips;
create policy "clips: ready public clips are readable by anyone"
on public.clips for select
to anon, authenticated
using (
  status = 'ready'
  and visibility = 'public'
  and deleted_at is null
);

-- Owner-read: keep allowing source creator + clipper to see their own
-- rows (any status, any visibility) — but drop soft-deleted rows. The
-- editor uses this policy via the cookie-aware client; soft-deleted
-- clips disappear from the dashboard naturally as a result.
drop policy if exists "clips: source creator or clipper can read" on public.clips;
create policy "clips: source creator or clipper can read"
on public.clips for select
using (
  (
    auth.uid() = source_creator_profile_id
    or auth.uid() = clipper_profile_id
  )
  and deleted_at is null
);
