-- ----------------------------------------------------------------
-- Face-cam corner preset on channels (Phase 2.5+).
--
-- Locked-region face-cam detection works most of the time, but
-- streamer setups vary and the auto-detector occasionally locks onto
-- a game-content false positive. This column lets the streamer
-- override the corner explicitly in their channel settings —
-- universal escape hatch every other clipping platform offers.
--
-- null = auto-detect (default). One of the four corner strings means
-- "skip detection, just crop the standard cam-shaped rectangle in
-- that corner of every source frame".
-- ----------------------------------------------------------------

alter table public.channels
  add column if not exists face_cam_corner text
    check (face_cam_corner in (
      'top_left', 'top_right', 'bottom_left', 'bottom_right'
    ));
