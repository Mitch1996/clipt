-- ============================================================
-- 0003 — auto-create a profiles row on auth.users insert
--
-- The prompt-pack contract says "on first sign-in, create a row in
-- profiles with handle = derived from email or platform username,
-- role = 'creator' default". A trigger on auth.users is more robust
-- than app-side creation: it fires for every signup path (email,
-- OAuth, magic link) without relying on every callback handler to
-- remember to insert.
--
-- Handle derivation:
--   1. raw_user_meta_data->>'user_name'        (Twitch)
--   2. raw_user_meta_data->>'preferred_username' (generic OAuth)
--   3. split_part(email, '@', 1)                (email signup)
--   4. 'user'                                   (last-resort base)
-- We strip everything that isn't [a-z0-9_], lowercase, and require
-- length >= 3. On uniqueness conflict we append the first 6 chars of
-- the new user's UUID — guaranteed unique within the table.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_handle text;
  derived_handle text;
begin
  base_handle := lower(coalesce(
    new.raw_user_meta_data->>'user_name',
    new.raw_user_meta_data->>'preferred_username',
    split_part(new.email, '@', 1),
    'user'
  ));
  base_handle := regexp_replace(base_handle, '[^a-z0-9_]', '', 'g');
  if length(base_handle) < 3 then
    base_handle := 'user';
  end if;

  derived_handle := base_handle;
  if exists (select 1 from public.profiles where handle = derived_handle) then
    derived_handle := base_handle || '_' || substring(new.id::text, 1, 6);
  end if;

  insert into public.profiles (id, handle, display_name, role)
  values (new.id, derived_handle, base_handle, 'creator')
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Lock down — only the trigger system needs to call this.
revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
