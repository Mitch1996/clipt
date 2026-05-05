-- ============================================================
-- 0009 — capture source video metadata at download time
--
-- Prompt 1.7's downloader returns dimensions and codec; we save them
-- on the clip row so later steps (reframe in Prompt 1.10) can decide
-- crop math without re-probing the file. Phase 1 only knows the
-- duration (Twitch Helix returns it); width/height/codec stay null
-- until the Phase 2 worker can run ffprobe over the source.
-- ============================================================

alter table public.clips
  add column if not exists source_width int,
  add column if not exists source_height int,
  add column if not exists source_codec text;
