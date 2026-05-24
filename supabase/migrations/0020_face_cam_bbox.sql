-- ----------------------------------------------------------------
-- Prompt 2.7 — Tight cam-bounding-box cropping.
--
-- Until now the renderer cropped a fixed 22%×27% preset rectangle
-- anchored to a named corner. This works for "typical" streamer
-- layouts and fails for everything else: tiny WoW corner cams get
-- swamped by gameplay, big Apex cams get clipped, talking-head
-- streamers get an eye-zoom of their face. The right primitive is
-- a per-source normalized bounding box; the corner becomes a coarse
-- fallback for when no bbox is known.
--
-- Stored as jsonb on BOTH channels (the cached "what we learned")
-- and clips (the per-render override, includes the streamer's
-- drag-edited box from the editor). The renderer's priority order:
--
--   1. clips.face_cam_bbox        — manual override or prior render's stamp
--   2. channels.face_cam_bbox     — refined with this clip's MediaPipe
--                                   face track if a face lands inside it,
--                                   else used as-is
--   3. channels.face_cam_corner   — find faces in that corner, _cam_crop_box
--                                   on the median; preset only if nothing
--   4. (nothing)                  — current MediaPipe cluster behavior,
--                                   routed through _cam_crop_box
--   5. None-corner + no face      — full-frame 9:16 (no cam band)
--
-- The corner columns stay because they're still the coarse fallback
-- and the self-heal loop keys off them when invalidating a render.
-- ----------------------------------------------------------------

alter table public.channels
  add column if not exists face_cam_bbox jsonb;

alter table public.clips
  add column if not exists face_cam_bbox jsonb;

alter table public.clips
  add column if not exists face_cam_bbox_source text
    check (face_cam_bbox_source in (
      'vision', 'mediapipe_refine', 'manual', 'channel_default'
    ));

-- Shape check on the bbox jsonb — just requires the keys exist.
-- Numeric range validation lives in the server action so a malformed
-- payload returns a typed error rather than a 23514. Same pattern
-- on both tables.
alter table public.channels
  add constraint channels_face_cam_bbox_shape
  check (
    face_cam_bbox is null
    or (
      face_cam_bbox ? 'x'
      and face_cam_bbox ? 'y'
      and face_cam_bbox ? 'w'
      and face_cam_bbox ? 'h'
    )
  );

alter table public.clips
  add constraint clips_face_cam_bbox_shape
  check (
    face_cam_bbox is null
    or (
      face_cam_bbox ? 'x'
      and face_cam_bbox ? 'y'
      and face_cam_bbox ? 'w'
      and face_cam_bbox ? 'h'
    )
  );
