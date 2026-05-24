-- ----------------------------------------------------------------
-- Per-clip cam-corner manual override (replaces channel-level picker).
--
-- Auto-detection misses ~10% of the time. After several rounds of
-- consensus + verification + self-heal, we still see wrong renders
-- on edge layouts (WoW UI panels, Apex minimaps). Rather than chase
-- ever more sophisticated detection, ship the OpusClip escape hatch:
-- a per-clip editor where the user clicks the right corner + the
-- worker re-renders that one clip.
--
-- This only needs a single schema change: add 'manual' to the
-- face_cam_corner_source enum so the editor can tag its writes
-- distinctly from the detection paths.
-- ----------------------------------------------------------------

alter table public.clips
  drop constraint if exists clips_face_cam_corner_source_check;

alter table public.clips
  add constraint clips_face_cam_corner_source_check
  check (face_cam_corner_source in (
    'vision', 'vod_predetect', 'reverify', 'manual'
  ));
