-- Stage 3: freeze a complete deterministic Live schedule at roster lock, then
-- materialize only the operational Week 1 rows and equal weekly grants.

alter table private.schedule_publications
  add column schedule_json jsonb;

alter table private.schedule_publications
  add constraint schedule_publications_live_schedule_json_check
  check (
    algorithm_version <> 'circle-v1'
    or (
      schedule_json is not null
      and jsonb_typeof(schedule_json -> 'orderedEntryIds') = 'array'
      and jsonb_typeof(schedule_json -> 'matchups') = 'array'
      and schedule_json ->> 'algorithmVersion' = algorithm_version
      and schedule_json ->> 'seed' = seed
      and schedule_json ->> 'outputHash' = output_hash
    )
  );

create or replace function private.generate_regular_season_schedule(
  p_ordered_entry_ids uuid[],
  p_seed text
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_roster_size integer := coalesce(cardinality(p_ordered_entry_ids), 0);
  v_cycle_length integer;
  v_full_cycle_weeks integer;
  v_extra_offset integer;
  v_week integer;
  v_cycle integer;
  v_round integer;
  v_extra_index integer;
  v_pair integer;
  v_left_position integer;
  v_right_position integer;
  v_left_index integer;
  v_right_index integer;
  v_side_a uuid;
  v_side_b uuid;
  v_swap uuid;
  v_swap_sides boolean;
  v_matchups jsonb := '[]'::jsonb;
  v_matchups_text text := '';
  v_output_hash text;
begin
  if v_roster_size not in (4, 6, 8, 10, 12, 14, 16)
    or p_seed is null
    or char_length(p_seed) < 16
    or (
      select count(distinct entry_id)
      from unnest(p_ordered_entry_ids) as entry_id
    ) <> v_roster_size then
    raise exception using errcode = '22023', message = 'A Live schedule requires unique entries and an even roster from 4 through 16.';
  end if;

  v_cycle_length := v_roster_size - 1;
  v_full_cycle_weeks := (14 / v_cycle_length) * v_cycle_length;
  v_extra_offset := (
    ('x' || substr(
      encode(extensions.digest(p_seed || 'extra', 'sha256'), 'hex'),
      1,
      12
    ))::bit(48)::bigint % greatest(1, v_cycle_length - 1)
  )::integer;

  for v_week in 1..14 loop
    if v_week <= v_full_cycle_weeks then
      v_cycle := (v_week - 1) / v_cycle_length;
      v_round := (v_week - 1) % v_cycle_length;
      v_swap_sides := (v_cycle + v_round) % 2 = 1;
    else
      v_extra_index := v_week - v_full_cycle_weeks - 1;
      v_round := (v_extra_offset + v_extra_index) % v_cycle_length;
      v_swap_sides := false;
    end if;

    for v_pair in 0..(v_roster_size / 2 - 1) loop
      v_left_position := v_pair + 1;
      v_right_position := v_roster_size - v_pair;

      if v_left_position = 1 then
        v_side_a := p_ordered_entry_ids[1];
      else
        v_left_index := (((v_left_position - 2 - v_round) % v_cycle_length) + v_cycle_length) % v_cycle_length + 2;
        v_side_a := p_ordered_entry_ids[v_left_index];
      end if;

      if v_right_position = 1 then
        v_side_b := p_ordered_entry_ids[1];
      else
        v_right_index := (((v_right_position - 2 - v_round) % v_cycle_length) + v_cycle_length) % v_cycle_length + 2;
        v_side_b := p_ordered_entry_ids[v_right_index];
      end if;

      if v_swap_sides then
        v_swap := v_side_a;
        v_side_a := v_side_b;
        v_side_b := v_swap;
      end if;

      v_matchups := v_matchups || jsonb_build_array(jsonb_build_object(
        'week', v_week,
        'sideAEntryId', v_side_a,
        'sideBEntryId', v_side_b
      ));
      v_matchups_text := v_matchups_text
        || case when v_matchups_text = '' then '' else ',' end
        || format(
          '{"week":%s,"sideAEntryId":"%s","sideBEntryId":"%s"}',
          v_week,
          v_side_a,
          v_side_b
        );
    end loop;
  end loop;

  v_output_hash := encode(extensions.digest(
    '{"algorithmVersion":"circle-v1","orderedEntryIds":'
    || array_to_json(p_ordered_entry_ids)::text
    || ',"matchups":[' || v_matchups_text || ']}',
    'sha256'
  ), 'hex');

  return jsonb_build_object(
    'algorithmVersion', 'circle-v1',
    'seed', p_seed,
    'orderedEntryIds', to_jsonb(p_ordered_entry_ids),
    'matchups', v_matchups,
    'outputHash', v_output_hash
  );
end;
$$;

revoke execute on function private.generate_regular_season_schedule(uuid[], text)
from public, anon, authenticated;

create or replace function api.lock_live_roster_and_open_week(
  p_league_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_season private.seasons%rowtype;
  v_snapshot private.season_ruleset_snapshots%rowtype;
  v_week private.season_weeks%rowtype;
  v_slate private.slates%rowtype;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_now timestamptz;
  v_ordered_entry_ids uuid[];
  v_entry_count integer;
  v_member_count integer;
  v_event_count integer;
  v_quote_count integer;
  v_fresh_quote_count integer;
  v_schedule jsonb;
  v_publication_id uuid := gen_random_uuid();
  v_matchup_count integer;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;

  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':LOCK_LIVE_ROSTER_AND_OPEN_WEEK', 'sha256'),
    'hex'
  );

  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'LOCK_LIVE_ROSTER_AND_OPEN_WEEK'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
  order by season.created_at desc
  limit 1
  for update;

  if v_season.mode <> 'LIVE' or v_season.lifecycle <> 'DRAFT'
    or v_season.roster_locked_at is not null then
    raise exception using errcode = '55000', message = 'A forming Live season is required.';
  end if;

  select ruleset.* into strict v_snapshot
  from private.season_ruleset_snapshots as ruleset
  where ruleset.id = v_season.ruleset_snapshot_id
  for update;

  if v_snapshot.mode <> 'LIVE' or v_snapshot.frozen_at is not null then
    raise exception using errcode = '55000', message = 'The Live ruleset is not available for roster lock.';
  end if;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = 1
  for update;

  if v_week.state <> 'PLANNED' then
    raise exception using errcode = '55000', message = 'The Week 1 slate must be planned before roster lock.';
  end if;

  select slate.* into strict v_slate
  from private.slates as slate
  where slate.week_id = v_week.id and slate.version = 1
  for update;

  v_now := private.stage1_season_time(v_season.id);
  if v_now >= v_week.common_lock_at then
    raise exception using errcode = '55000', message = 'The published slate has reached common lock.';
  end if;

  perform 1
  from private.season_entries as entry
  where entry.season_id = v_season.id
  order by entry.id
  for update;

  select
    array_agg(
      entry.id
      order by encode(
        extensions.digest(v_season.schedule_seed || entry.id::text, 'sha256'),
        'hex'
      ), entry.id
    ),
    count(*)
  into v_ordered_entry_ids, v_entry_count
  from private.season_entries as entry
  where entry.season_id = v_season.id;

  select count(*) into v_member_count
  from private.league_memberships as membership
  where membership.league_id = p_league_id;

  if v_entry_count <> v_member_count
    or v_entry_count not in (4, 6, 8, 10, 12, 14, 16) then
    raise exception using
      errcode = '22023',
      message = 'Roster lock requires one season entry per member and an even roster from 4 through 16.';
  end if;

  select count(*) into v_event_count
  from private.sports_events as event
  where event.week_id = v_week.id;

  perform 1
  from private.live_quote_heads as head
  where head.week_id = v_week.id
  order by head.event_id, head.market_type, head.outcome_key
  for update;

  select
    count(*),
    count(*) filter (
      where snapshot.quality_status = 'HEALTHY'
        and snapshot.observed_at <= v_now
        and snapshot.observed_at >= v_now - interval '2 minutes'
    )
  into v_quote_count, v_fresh_quote_count
  from private.live_quote_heads as head
  join private.market_snapshots as snapshot on snapshot.id = head.market_snapshot_id
  where head.week_id = v_week.id;

  if v_event_count < 1
    or v_quote_count <> v_event_count * 6
    or v_fresh_quote_count <> v_quote_count then
    raise exception using
      errcode = '55000',
      message = 'Every published event requires six fresh healthy current quotes before roster lock.';
  end if;

  v_schedule := private.generate_regular_season_schedule(
    v_ordered_entry_ids,
    v_season.schedule_seed
  );

  insert into private.schedule_publications (
    id,
    season_id,
    league_id,
    version,
    algorithm_version,
    seed,
    ordered_entry_ids,
    output_hash,
    schedule_json,
    created_by,
    published_at
  ) values (
    v_publication_id,
    v_season.id,
    p_league_id,
    1,
    'circle-v1',
    v_season.schedule_seed,
    v_ordered_entry_ids,
    v_schedule ->> 'outputHash',
    v_schedule,
    v_user_id,
    v_now
  );

  insert into private.matchups (
    week_id,
    season_id,
    league_id,
    schedule_publication_id,
    side_a_entry_id,
    side_b_entry_id,
    scope,
    display_order
  )
  select
    v_week.id,
    v_season.id,
    p_league_id,
    v_publication_id,
    (matchup.value ->> 'sideAEntryId')::uuid,
    (matchup.value ->> 'sideBEntryId')::uuid,
    'REGULAR',
    matchup.ordinality::integer
  from jsonb_array_elements(v_schedule -> 'matchups') with ordinality as matchup(value, ordinality)
  where (matchup.value ->> 'week')::integer = 1
  order by matchup.ordinality;
  get diagnostics v_matchup_count = row_count;

  if v_matchup_count <> v_entry_count / 2 then
    raise exception using errcode = '22023', message = 'The Week 1 schedule is incomplete.';
  end if;

  insert into private.weekly_cards (
    week_id,
    season_id,
    league_id,
    entry_id,
    owner_user_id,
    granted_credits,
    granted_at
  )
  select
    v_week.id,
    v_season.id,
    p_league_id,
    entry.id,
    entry.user_id,
    1000,
    v_now
  from private.season_entries as entry
  where entry.season_id = v_season.id
  order by entry.id;

  update private.season_weeks
  set state = 'OPEN', opens_at = v_now
  where id = v_week.id;

  update private.season_ruleset_snapshots
  set frozen_at = v_now
  where id = v_snapshot.id;

  update private.seasons
  set lifecycle = 'REGULAR', roster_locked_at = v_now
  where id = v_season.id;

  v_response := jsonb_build_object(
    'leagueId', p_league_id,
    'seasonId', v_season.id,
    'weekId', v_week.id,
    'week', 1,
    'entryCount', v_entry_count,
    'matchupCount', v_matchup_count,
    'grantedCreditsPerEntry', 1000,
    'scheduleWeeks', 14,
    'scheduleSeed', v_season.schedule_seed,
    'scheduleOutputHash', v_schedule ->> 'outputHash',
    'openedAt', v_now,
    'commonLockAt', v_week.common_lock_at
  );

  insert into private.command_receipts (
    league_id,
    actor_user_id,
    command_name,
    idempotency_key,
    request_hash,
    response_json
  ) values (
    p_league_id,
    v_user_id,
    'LOCK_LIVE_ROSTER_AND_OPEN_WEEK',
    p_idempotency_key,
    v_request_hash,
    v_response
  );

  return v_response;
end;
$$;

revoke execute on function api.lock_live_roster_and_open_week(uuid, text)
from public, anon;
grant execute on function api.lock_live_roster_and_open_week(uuid, text)
to authenticated;

create or replace function api.get_live_regular_season_schedule(p_league_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_league private.leagues%rowtype;
  v_season private.seasons%rowtype;
  v_publication private.schedule_publications%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;

  select league.* into strict v_league
  from private.leagues as league
  where league.slug = lower(p_league_slug);

  if not private.is_league_member(v_league.id) then
    raise exception using errcode = '42501', message = 'League membership required.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = v_league.id
  order by season.created_at desc
  limit 1;

  if v_season.mode <> 'LIVE' then
    return null;
  end if;

  select publication.* into v_publication
  from private.schedule_publications as publication
  where publication.season_id = v_season.id
    and publication.algorithm_version = 'circle-v1'
  order by publication.version desc
  limit 1;

  if v_publication.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'algorithmVersion', v_publication.algorithm_version,
    'seed', v_publication.seed,
    'outputHash', v_publication.output_hash,
    'publishedAt', v_publication.published_at,
    'orderedEntryIds', v_publication.schedule_json -> 'orderedEntryIds',
    'matchups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'week', (matchup.value ->> 'week')::integer,
          'sideAEntryId', matchup.value ->> 'sideAEntryId',
          'sideAName', side_a_profile.display_name,
          'sideBEntryId', matchup.value ->> 'sideBEntryId',
          'sideBName', side_b_profile.display_name
        ) order by (matchup.value ->> 'week')::integer, matchup.ordinality
      )
      from jsonb_array_elements(v_publication.schedule_json -> 'matchups')
        with ordinality as matchup(value, ordinality)
      join private.season_entries as side_a_entry
        on side_a_entry.id = (matchup.value ->> 'sideAEntryId')::uuid
      join private.profiles as side_a_profile on side_a_profile.id = side_a_entry.user_id
      join private.season_entries as side_b_entry
        on side_b_entry.id = (matchup.value ->> 'sideBEntryId')::uuid
      join private.profiles as side_b_profile on side_b_profile.id = side_b_entry.user_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function api.get_live_regular_season_schedule(text)
from public, anon;
grant execute on function api.get_live_regular_season_schedule(text)
to authenticated;
