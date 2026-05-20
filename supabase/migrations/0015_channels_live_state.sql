-- ----------------------------------------------------------------
-- Live-ingestion state on channels (Prompt 2.1).
-- The live worker (workers/live) polls Twitch /helix/streams every
-- ~30s and stamps each channel with whether it's currently live and
-- when we last checked. The dashboard can render "Live now" badges
-- off these columns without hitting Twitch directly.
-- ----------------------------------------------------------------

alter table public.channels
  add column if not exists is_live boolean not null default false,
  add column if not exists last_live_check timestamptz,
  -- Set every time the worker observes the channel transition
  -- offline → live. Useful for "longest live streak" + "last
  -- streamed N hours ago" UI later.
  add column if not exists last_live_at timestamptz;

-- The scheduler queries `where access_token_encrypted is not null
-- order by last_live_check nulls first`. Index supports that.
create index if not exists channels_live_check_idx
  on public.channels (last_live_check nulls first)
  where access_token_encrypted is not null;
