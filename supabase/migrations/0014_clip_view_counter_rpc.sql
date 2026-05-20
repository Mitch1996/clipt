-- ----------------------------------------------------------------
-- Atomic view-counter RPC.
-- The public clip page fires recordClipView() on mount; it calls this
-- function rather than doing a read-modify-write so concurrent views
-- don't lose count. SECURITY DEFINER lets anon clients (the public
-- clip page is unauthed) bump the counter without UPDATE rights on the
-- clips table.
-- ----------------------------------------------------------------

create or replace function public.increment_clip_view(p_clip_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.clips
  set view_count_total = view_count_total + 1
  where id = p_clip_id
    and status = 'ready'
    and visibility = 'public'
    and deleted_at is null;
$$;

-- Both anon (public-clip-page visitors) and authenticated users
-- (logged-in viewers) can call this. Service role bypasses, so server
-- actions calling via admin client are unaffected.
grant execute on function public.increment_clip_view(uuid) to anon, authenticated;
