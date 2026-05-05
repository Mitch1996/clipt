-- ============================================================
-- 0007 — broadcast clip + clip_posts changes via Realtime
--
-- Supabase ships a `supabase_realtime` publication that downstream
-- subscribers (the @supabase/supabase-js client's
-- channel().on('postgres_changes')) listen to. New tables don't
-- auto-join the publication, so without this migration the live
-- status pill on /dashboard/clips/[id] only updates on a manual
-- refresh.
--
-- Adding clips + clip_posts means:
--   - the clip-detail page's status pill streams pending -> processing
--     -> ready as Inngest flips the row
--   - the public clip page (Prompt 1.12) and stats sync (Prompt 1.14)
--     can subscribe to clip_posts updates without polling
-- ============================================================

-- Use a DO block so the migration is safe to re-run if the table is
-- already in the publication.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'clips'
  ) then
    alter publication supabase_realtime add table public.clips;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'clip_posts'
  ) then
    alter publication supabase_realtime add table public.clip_posts;
  end if;
end$$;
