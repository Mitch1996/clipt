-- ============================================================
-- 0005 — track the *kind* of source URL on a clip
--
-- The prompt-pack specifies that URL parsing distinguishes between:
--   twitch + clip          (twitch.tv/<channel>/clip/<slug>)
--   twitch + vod           (twitch.tv/videos/<id>)
--   youtube + video        (youtube.com/watch?v=… or youtu.be/…)
--   youtube + short        (youtube.com/shorts/…)
--   kick + clip            (kick.com/<channel>/clips/<slug>)
--
-- The download pipeline (Prompt 1.7) branches on this. Tracking it on
-- the clip row also gives us per-kind analytics later.
-- ============================================================

alter table public.clips
  add column if not exists source_kind text
    check (source_kind in ('clip', 'vod', 'video', 'short', 'live_auto', 'live_fan'));

create index if not exists clips_source_kind_idx on public.clips (source_kind);
