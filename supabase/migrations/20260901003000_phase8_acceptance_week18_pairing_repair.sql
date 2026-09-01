-- Phase 8 acceptance repair: preserve the merged Week 18 correction behavior
-- while making the two JSON pairing-order expressions unambiguous. This is a
-- forward-only function replacement; no stored competitive fact is mutated.

create or replace function private.rebuild_week18_round_after_correction(
  p_season_id uuid,
  p_playoff_publication_id uuid,
  p_actor_user_id uuid
)
returns private.playoff_round_publications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current private.playoff_round_publications%rowtype;
  v_created private.playoff_round_publications%rowtype;
  v_week18 private.season_weeks%rowtype;
  v_current_slate private.slates%rowtype;
  v_new_slate_id uuid := gen_random_uuid();
  v_round jsonb;
  v_participant_ids uuid[];
  v_source_ids uuid[];
  v_input_hash text;
  v_current_order text;
  v_new_order text;
begin
  select round.* into strict v_current
  from private.playoff_round_publications as round
  where round.season_id = p_season_id
    and round.nfl_week = 18
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
  )
  for share;

  -- Card acceptance, week locking, score import, and result production all
  -- take the Week 18 row lock. Lock the cards in deterministic order as well,
  -- so the first successful seal and this freeze decision serialize.
  select week.* into strict v_week18
  from private.season_weeks as week
  where week.id = v_current.week_id
  for update;
  perform card.id
  from private.weekly_cards as card
  where card.week_id = v_week18.id
  order by card.id
  for update;

  v_round := private.build_phase8b_postseason_round(
    p_playoff_publication_id,
    18
  );
  select string_agg(
    (game.value #>> '{sideA,entryId}') || ':'
      || (game.value #>> '{sideB,entryId}'),
    ',' order by game.ordinality
  ) into v_current_order
  from jsonb_array_elements(v_current.matchups_json)
    with ordinality as game(value, ordinality);
  select string_agg(
    (game.value #>> '{sideA,entryId}') || ':'
      || (game.value #>> '{sideB,entryId}'),
    ',' order by game.ordinality
  ) into v_new_order
  from jsonb_array_elements(v_round -> 'games')
    with ordinality as game(value, ordinality);

  if v_current_order = v_new_order then
    return v_current;
  end if;
  if not private.is_week18_pairing_replaceable(v_current.id) then
    return v_current;
  end if;

  select slate.* into strict v_current_slate
  from private.slates as slate
  where slate.week_id = v_current.week_id
    and slate.version = v_current.version
  for share;
  select array_agg(value::uuid order by ordinality)
  into v_participant_ids
  from jsonb_array_elements_text(v_round -> 'participantEntryIds')
    with ordinality as participant(value, ordinality);
  select array_agg(value::uuid order by ordinality)
  into v_source_ids
  from jsonb_array_elements_text(v_round -> 'sourceResultVersionIds')
    with ordinality as source(value, ordinality);

  v_input_hash := encode(extensions.digest(
    p_playoff_publication_id::text || ':' || v_current.id::text || ':'
      || (v_round -> 'games')::text || ':' || array_to_string(v_source_ids, ','),
    'sha256'
  ), 'hex');

  insert into private.slates (
    id, week_id, season_id, league_id, version, fixture_id,
    common_lock_at, published_at
  ) values (
    v_new_slate_id, v_current.week_id, v_current.season_id,
    v_current.league_id, v_current.version + 1,
    v_current_slate.fixture_id, v_current_slate.common_lock_at,
    clock_timestamp()
  );
  insert into private.slate_items (
    slate_id, event_id, market_snapshot_id, week_id, league_id
  )
  select
    v_new_slate_id, item.event_id, item.market_snapshot_id,
    item.week_id, item.league_id
  from private.slate_items as item
  where item.slate_id = v_current_slate.id
  order by item.id;

  insert into private.playoff_round_publications (
    playoff_publication_id, season_id, league_id, week_id,
    live_odds_import_id, nfl_week, stage_scope,
    selected_external_event_ids, participant_entry_ids, matchups_json,
    source_result_version_ids, input_hash, created_by, published_at,
    version, supersedes_id
  ) values (
    p_playoff_publication_id, v_current.season_id, v_current.league_id,
    v_current.week_id, v_current.live_odds_import_id, 18, 'EXHIBITION',
    v_current.selected_external_event_ids, v_participant_ids,
    v_round -> 'games', v_source_ids, v_input_hash, p_actor_user_id,
    clock_timestamp(), v_current.version + 1, v_current.id
  ) returning * into strict v_created;

  insert into private.matchups (
    week_id, season_id, league_id, schedule_publication_id,
    playoff_round_publication_id, side_a_entry_id, side_b_entry_id,
    scope, postseason_role, display_order
  )
  select
    v_created.week_id, v_created.season_id, v_created.league_id, null,
    v_created.id, (game.value #>> '{sideA,entryId}')::uuid,
    (game.value #>> '{sideB,entryId}')::uuid, 'EXHIBITION',
    'EXHIBITION', game.ordinality::integer
  from jsonb_array_elements(v_round -> 'games')
    with ordinality as game(value, ordinality)
  order by game.ordinality;

  if (
    select count(*) from private.matchups as matchup
    where matchup.playoff_round_publication_id = v_created.id
  ) * 2 <> cardinality(v_participant_ids) then
    raise exception using errcode = '55000', message = 'The corrected Week 18 round is incomplete.';
  end if;
  return v_created;
end;
$$;

revoke execute on function private.rebuild_week18_round_after_correction(uuid, uuid, uuid)
from public, anon, authenticated;
