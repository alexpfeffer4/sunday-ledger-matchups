create or replace function api.update_profile_display_name(p_display_name text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_display_name text := btrim(p_display_name);
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if char_length(v_display_name) < 2 or char_length(v_display_name) > 30 then
    raise exception using errcode = '22023', message = 'Username must be between 2 and 30 characters.';
  end if;
  if v_display_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' then
    raise exception using errcode = '22023', message = 'Username contains unsupported characters.';
  end if;

  insert into private.profiles (id, display_name)
  values (v_user_id, v_display_name)
  on conflict (id) do update
  set display_name = excluded.display_name,
      updated_at = now();

  return v_display_name;
end;
$$;

revoke execute on function api.update_profile_display_name(text) from public, anon;
grant execute on function api.update_profile_display_name(text) to authenticated;
