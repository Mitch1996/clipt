-- ----------------------------------------------------------------
-- Granular processing-step indicator on clips.
-- The 4-status state machine (pending / processing / ready / failed)
-- doesn't tell the dashboard which sub-phase of the pipeline is running.
-- Inngest writes a short token here as it crosses each major boundary:
--   'downloading-source' → 'transcribing' → 'reframing' → null (when ready).
-- The UI in ClipStatusLive maps the token to user-friendly copy.
-- ----------------------------------------------------------------

alter table public.clips
  add column if not exists processing_step text;
