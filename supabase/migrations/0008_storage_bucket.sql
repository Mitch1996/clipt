-- ============================================================
-- 0008 — create the clipt-media storage bucket
--
-- For now, this is a single PRIVATE bucket holding every artifact the
-- pipeline produces:
--
--   sources/{clipId}.{ext}         original Twitch/YouTube/Kick mp4
--   verticals/{clipId}.mp4         9:16 reframed export with captions
--   thumbnails/{clipId}.jpg        poster frame
--   captions/{clipId}.json         word-timed captions
--
-- All reads happen via signed URLs minted by src/lib/storage/r2.ts.
-- When we move to Cloudflare R2 (free-tier requires CC verification —
-- blocked today), this bucket becomes the back-compat fallback and the
-- facade swaps its underlying client. Bucket naming + key paths stay
-- the same so no caller has to change.
--
-- Object-level access is gated by storage.objects RLS:
--   - only authenticated users can write their own objects
--     (rooted at sources/{clipId}/...; clipper_profile_id is who can
--     upload). Pipeline writes happen via the service-role admin
--     client, which bypasses RLS.
--   - reads of public/{clipId}/* (verticals + thumbnails) are
--     publicly browsable; everything else needs a signed URL.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clipt-media',
  'clipt-media',
  false,
  524288000, -- 500 MB ceiling per object; well above any expected source clip
  null       -- accept any mime; the pipeline writes mp4/jpg/json
)
on conflict (id) do nothing;
