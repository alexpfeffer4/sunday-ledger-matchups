-- Controlled-league reliability gate: close confirmed private helper ACL gaps
-- and expose the caller's own command result for safe retry reconciliation.

revoke all on function private.guard_stage1_roster_membership()
from public, anon, authenticated;
revoke all on function private.stage1_season_time(uuid)
from public, anon, authenticated;
revoke all on function private.recompute_stage1_week(uuid, uuid)
from public, anon, authenticated;

create or replace function api.get_my_command_receipt(
  p_command_name text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_response jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if char_length(p_command_name) not between 1 and 80
    or char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Command receipt reference is invalid.';
  end if;

  select command.response_json into v_response
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = upper(p_command_name)
    and command.idempotency_key = p_idempotency_key;

  return v_response;
end;
$$;

revoke all on function api.get_my_command_receipt(text, text)
from public, anon;
grant execute on function api.get_my_command_receipt(text, text)
to authenticated;

create or replace function api.create_league_invite_retry_safe(
  p_league_id uuid,
  p_expires_in_days integer,
  p_max_uses integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires_at timestamptz;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if p_expires_in_days not between 1 and 30 then
    raise exception using errcode = '22023', message = 'Invite expiry is invalid.';
  end if;
  if p_max_uses not between 1 and 15 then
    raise exception using errcode = '22023', message = 'Invite use limit is invalid.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;

  v_request_hash := encode(extensions.digest(
    p_league_id::text || ':' || p_expires_in_days::text || ':' || p_max_uses::text,
    'sha256'
  ), 'hex');

  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'CREATE_LEAGUE_INVITE'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json || jsonb_build_object('replayed', true);
  end if;

  v_expires_at := clock_timestamp() + make_interval(days => p_expires_in_days);
  insert into private.league_invites (
    league_id, token_hash, expires_at, max_uses, created_by
  ) values (
    p_league_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expires_at,
    p_max_uses,
    v_user_id
  );

  v_response := jsonb_build_object(
    'token', v_token,
    'expiresAt', v_expires_at,
    'maxUses', p_max_uses,
    'replayed', false
  );

  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'CREATE_LEAGUE_INVITE', p_idempotency_key,
    v_request_hash, v_response
  );

  return v_response;
end;
$$;

revoke execute on function api.create_league_invite(uuid, timestamptz, integer)
from authenticated;
revoke all on function api.create_league_invite_retry_safe(uuid, integer, integer, text)
from public, anon;
grant execute on function api.create_league_invite_retry_safe(uuid, integer, integer, text)
to authenticated;
