-- ============================================================
-- 0004 — track when a channel's access token expires
--
-- Twitch (and most OAuth providers) issue short-lived access tokens
-- (~4h for Twitch). We store expires_at so the refresh-aware accessor
-- can mint a new token before the old one fails, instead of catching
-- 401s and retrying.
-- ============================================================

alter table public.channels
  add column if not exists token_expires_at timestamptz;
