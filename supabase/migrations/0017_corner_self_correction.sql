-- ----------------------------------------------------------------
-- Automatic face-cam corner self-correction (Phase 2.6).
--
-- Vision-based corner detection is ~90% accurate; the remaining 10%
-- gets cached on `channels.face_cam_corner` and silently breaks every
-- subsequent render. This migration adds the bookkeeping the new
-- self-correction loop needs:
--
--   1. clips.face_cam_corner               — which corner was baked
--                                            into the rendered mp4
--   2. clips.face_cam_corner_source        — how that corner was
--                                            picked: vision (per-clip
--                                            fallback), vod_predetect
--                                            (channel-add detection),
--                                            or reverify (after a
--                                            failed verification)
--   3. clips.verification_status           — pending | passed | failed
--                                            | skipped (no captions /
--                                            invalid source / etc.)
--   4. clips.verification_attempts         — circuit breaker. caps
--                                            self-heal at 2 retries.
--   5. channels.is_vtuber                  — classified once on
--                                            channel/added via vision
--                                            on a VOD frame. Drives
--                                            whether post-render
--                                            verification uses
--                                            MediaPipe (real face) or
--                                            another vision call
--                                            (overlay/avatar).
--   6. channels.face_cam_corner_confidence — last detection's
--                                            consensus score
--                                            (votes-for-winner / total).
--                                            Read for diagnostics +
--                                            for the admin triage
--                                            dashboard.
-- ----------------------------------------------------------------

alter table public.clips
  add column if not exists face_cam_corner text
    check (face_cam_corner in (
      'top_left', 'top_right', 'bottom_left', 'bottom_right'
    ));

alter table public.clips
  add column if not exists face_cam_corner_source text
    check (face_cam_corner_source in (
      'vision', 'vod_predetect', 'reverify'
    ));

alter table public.clips
  add column if not exists verification_status text
    not null default 'pending'
    check (verification_status in (
      'pending', 'passed', 'failed', 'skipped'
    ));

alter table public.clips
  add column if not exists verification_attempts integer
    not null default 0;

alter table public.channels
  add column if not exists is_vtuber boolean;

alter table public.channels
  add column if not exists face_cam_corner_confidence numeric(3,2)
    check (face_cam_corner_confidence is null
      or (face_cam_corner_confidence >= 0
        and face_cam_corner_confidence <= 1));

-- The self-heal loop frequently filters by (source_channel_id,
-- face_cam_corner) when invalidating renders. Speed that up with a
-- partial index — null face_cam_corner clips don't need to be
-- considered (they predate this column).
create index if not exists clips_channel_corner_idx
  on public.clips (source_channel_id, face_cam_corner)
  where face_cam_corner is not null;

-- Admin triage filters by verification_status. Same trick.
create index if not exists clips_verification_failed_idx
  on public.clips (created_at desc)
  where verification_status = 'failed';
