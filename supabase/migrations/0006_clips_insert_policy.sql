-- ============================================================
-- 0006 — allow the clipper to insert their own clip
--
-- 0001 shipped read + update policies for clips but no INSERT policy,
-- so authenticated users couldn't create clip rows from the
-- /dashboard/clips/new server action — Postgres returned
-- "new row violates row-level security for table 'clips'".
--
-- Contract: the inserting user must claim the row as their own
-- (clipper_profile_id = auth.uid()). source_creator_profile_id is
-- left null at insert time and gets resolved later by the download
-- pipeline (Prompt 1.7) once the platform-side metadata identifies
-- the original streamer.
-- ============================================================

create policy "clips: clipper can insert"
on public.clips for insert
to authenticated
with check (auth.uid() = clipper_profile_id);
