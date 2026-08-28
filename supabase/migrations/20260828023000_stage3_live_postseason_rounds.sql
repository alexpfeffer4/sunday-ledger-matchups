-- Stage 3: materialize Live postseason weeks from the immutable qualification
-- publication and prior final playoff results. Regular-season standings remain
-- frozen after Week 14; postseason rounds are separate append-only artifacts.

create table private.playoff_round_publications (
  id uuid primary key default gen_random_uuid(),
  playoff_publication_id uuid not null,
  season_id uuid not null,
  league_id uuid not null,
  week_id uuid not null,
  live_odds_import_id uuid not null references private.live_odds_imports (id),
  nfl_week integer not null check (nfl_week between 15 and 17),
  stage_scope text not null check (stage_scope in ('PLAYOFF', 'EXHIBITION')),
  selected_external_event_ids text[] not null,
  participant_entry_ids uuid[] not null,
  matchups_json jsonb not null check (jsonb_typeof(matchups_json) = 'array'),
  source_result_version_ids uuid[] not null default '{}'::uuid[],
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references private.profiles (id),
  published_at timestamptz not null default clock_timestamp(),
  foreign key (playoff_publication_id, season_id, league_id)
    references private.playoff_publications (id, season_id, league_id),
  foreign key (week_id, season_id, league_id)
    references private.season_weeks (id, season_id, league_id) on delete cascade,
  unique (season_id, nfl_week),
  unique (week_id),
  unique (season_id, nfl_week, input_hash),
  unique (id, season_id, league_id),
  check (cardinality(selected_external_event_ids) between 1 and 32),
  check (cardinality(participant_entry_ids) >= 2),
  check (jsonb_array_length(matchups_json) >= 1)
);

create index playoff_round_publications_playoff_fk_idx
  on private.playoff_round_publications
  (playoff_publication_id, season_id, league_id);

create index playoff_round_publications_season_league_fk_idx
  on private.playoff_round_publications (season_id, league_id);

create index playoff_round_publications_import_id_idx
  on private.playoff_round_publications (live_odds_import_id);

create index playoff_round_publications_created_by_idx
  on private.playoff_round_publications (created_by);

alter table private.playoff_round_publications enable row level security;

create policy playoff_round_publications_select_member
on private.playoff_round_publications for select to authenticated
using ((select private.is_league_member(league_id)));

revoke all on table private.playoff_round_publications
from public, anon, authenticated;
grant select on table private.playoff_round_publications to authenticated;

create trigger playoff_round_publications_append_only
before update or delete on private.playoff_round_publications
for each row execute function private.reject_competitive_mutation();

alter table private.matchups
  alter column schedule_publication_id drop not null,
  add column playoff_round_publication_id uuid;

alter table private.matchups
  add constraint matchups_playoff_round_publication_fk
  foreign key (playoff_round_publication_id, season_id, league_id)
  references private.playoff_round_publications (id, season_id, league_id),
  add constraint matchups_exactly_one_publication_check
  check (
    (schedule_publication_id is not null)::integer
      + (playoff_round_publication_id is not null)::integer = 1
  );

create index matchups_playoff_round_publication_fk_idx
  on private.matchups (playoff_round_publication_id, season_id, league_id)
  where playoff_round_publication_id is not null;

create or replace function private.playoff_qualification_seed(
  p_playoff_publication_id uuid,
  p_entry_id uuid
)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select (qualifier.value ->> 'qualificationSeed')::integer
  from private.playoff_publications as publication
  cross join lateral jsonb_array_elements(publication.qualifiers) as qualifier(value)
  where publication.id = p_playoff_publication_id
    and (qualifier.value ->> 'entryId')::uuid = p_entry_id
  limit 1;
$$;

create or replace function private.final_playoff_matchup_outcome(
  p_matchup_id uuid,
  p_playoff_publication_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_matchup private.matchups%rowtype;
  v_result private.matchup_result_versions%rowtype;
  v_side_a_seed integer;
  v_side_b_seed integer;
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_seed integer;
  v_loser_seed integer;
  v_publication private.playoff_publications%rowtype;
begin
  select matchup.* into strict v_matchup
  from private.matchups as matchup
  where matchup.id = p_matchup_id
    and matchup.scope = 'PLAYOFF'
    and matchup.playoff_round_publication_id is not null;

  select result.* into strict v_result
  from private.matchup_result_versions as result
  where result.matchup_id = v_matchup.id
    and result.status = 'FINAL'
  order by result.created_at desc, result.id desc
  limit 1;

  select publication.* into strict v_publication
  from private.playoff_publications as publication
  where publication.id = p_playoff_publication_id
    and publication.season_id = v_matchup.season_id
    and publication.league_id = v_matchup.league_id;

  v_side_a_seed := private.playoff_qualification_seed(
    p_playoff_publication_id,
    v_matchup.side_a_entry_id
  );
  v_side_b_seed := private.playoff_qualification_seed(
    p_playoff_publication_id,
    v_matchup.side_b_entry_id
  );
  if v_side_a_seed is null or v_side_b_seed is null then
    raise exception using errcode = '22023', message = 'A playoff matchup contains an unqualified entry.';
  end if;

  if v_result.side_a_decision = 'WIN' then
    v_winner_id := v_matchup.side_a_entry_id;
    v_loser_id := v_matchup.side_b_entry_id;
    v_winner_seed := v_side_a_seed;
    v_loser_seed := v_side_b_seed;
  elsif v_result.side_b_decision = 'WIN' then
    v_winner_id := v_matchup.side_b_entry_id;
    v_loser_id := v_matchup.side_a_entry_id;
    v_winner_seed := v_side_b_seed;
    v_loser_seed := v_side_a_seed;
  elsif v_side_a_seed < v_side_b_seed then
    -- Exact score ties and both-incomplete playoff games advance the higher
    -- qualification seed; no commissioner judgment enters this decision.
    v_winner_id := v_matchup.side_a_entry_id;
    v_loser_id := v_matchup.side_b_entry_id;
    v_winner_seed := v_side_a_seed;
    v_loser_seed := v_side_b_seed;
  else
    v_winner_id := v_matchup.side_b_entry_id;
    v_loser_id := v_matchup.side_a_entry_id;
    v_winner_seed := v_side_b_seed;
    v_loser_seed := v_side_a_seed;
  end if;

  return jsonb_build_object(
    'matchupId', v_matchup.id,
    'resultVersionId', v_result.id,
    'winner', private.playoff_entry_by_seed(v_publication.qualifiers, v_winner_seed),
    'loser', private.playoff_entry_by_seed(v_publication.qualifiers, v_loser_seed),
    'advancedByRule', v_result.side_a_decision <> 'WIN' and v_result.side_b_decision <> 'WIN'
  );
end;
$$;

create or replace function private.build_next_live_postseason_round(
  p_playoff_publication_id uuid,
  p_nfl_week integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_publication private.playoff_publications%rowtype;
  v_prior_round private.playoff_round_publications%rowtype;
  v_prior_week private.season_weeks%rowtype;
  v_stage jsonb;
  v_games jsonb;
  v_outcomes jsonb;
  v_participants uuid[];
  v_source_result_ids uuid[] := '{}'::uuid[];
  v_first_winner jsonb;
  v_second_winner jsonb;
  v_first_loser jsonb;
  v_second_loser jsonb;
  v_lowest_remaining jsonb;
  v_other_remaining jsonb;
  v_stage_scope text;
begin
  if p_nfl_week not between 15 and 17 then
    raise exception using errcode = '22023', message = 'Postseason publication supports NFL Weeks 15 through 17.';
  end if;

  select publication.* into strict v_publication
  from private.playoff_publications as publication
  where publication.id = p_playoff_publication_id;

  if jsonb_array_length(v_publication.qualifiers)
      <> v_publication.expected_qualifier_count then
    raise exception using errcode = '55000', message = 'The frozen playoff field is incomplete; the ruleset does not authorize replacement qualifiers.';
  end if;

  if p_nfl_week = 15 then
    select stage.value into strict v_stage
    from jsonb_array_elements(v_publication.bracket_json -> 'stages') as stage(value)
    where (stage.value ->> 'week')::integer = 15;

    select jsonb_agg(
      game.value || jsonb_build_object('scope', v_stage ->> 'scope')
      order by (game.value ->> 'game')::integer
    ) into v_games
    from jsonb_array_elements(v_stage -> 'games') as game(value);
    v_stage_scope := v_stage ->> 'scope';
  elsif p_nfl_week = 16 and v_publication.bracket_json ->> 'format' = 'SMALL_FOUR' then
    select stage.value into strict v_stage
    from jsonb_array_elements(v_publication.bracket_json -> 'stages') as stage(value)
    where (stage.value ->> 'week')::integer = 16;

    select jsonb_agg(
      game.value || jsonb_build_object('scope', 'PLAYOFF')
      order by (game.value ->> 'game')::integer
    ) into v_games
    from jsonb_array_elements(v_stage -> 'games') as game(value);
    v_stage_scope := 'PLAYOFF';
  elsif p_nfl_week = 16 then
    select round.* into strict v_prior_round
    from private.playoff_round_publications as round
    where round.playoff_publication_id = v_publication.id
      and round.nfl_week = 15;

    select week.* into strict v_prior_week
    from private.season_weeks as week
    where week.id = v_prior_round.week_id and week.state = 'FINAL';

    select jsonb_agg(
      private.final_playoff_matchup_outcome(matchup.id, v_publication.id)
      order by matchup.display_order
    ) into v_outcomes
    from private.matchups as matchup
    where matchup.playoff_round_publication_id = v_prior_round.id
      and matchup.scope = 'PLAYOFF';

    if jsonb_array_length(coalesce(v_outcomes, '[]'::jsonb)) <> 2 then
      raise exception using errcode = '55000', message = 'Both Week 15 opening-round matchups must be final before semifinal publication.';
    end if;

    select outcome.value -> 'winner'
    into v_lowest_remaining
    from jsonb_array_elements(v_outcomes) as outcome(value)
    order by (outcome.value #>> '{winner,qualificationSeed}')::integer desc
    limit 1;

    select outcome.value -> 'winner'
    into v_other_remaining
    from jsonb_array_elements(v_outcomes) as outcome(value)
    order by (outcome.value #>> '{winner,qualificationSeed}')::integer asc
    limit 1;

    v_games := jsonb_build_array(
      jsonb_build_object(
        'game', 1,
        'label', 'Semifinal · No. 1 seed',
        'scope', 'PLAYOFF',
        'sideA', private.playoff_entry_by_seed(v_publication.qualifiers, 1),
        'sideB', v_lowest_remaining
      ),
      jsonb_build_object(
        'game', 2,
        'label', 'Semifinal · No. 2 seed',
        'scope', 'PLAYOFF',
        'sideA', private.playoff_entry_by_seed(v_publication.qualifiers, 2),
        'sideB', v_other_remaining
      )
    );
    select array_agg((outcome.value ->> 'resultVersionId')::uuid order by outcome.ordinality)
    into v_source_result_ids
    from jsonb_array_elements(v_outcomes) with ordinality as outcome(value, ordinality);
    v_stage_scope := 'PLAYOFF';
  else
    select round.* into strict v_prior_round
    from private.playoff_round_publications as round
    where round.playoff_publication_id = v_publication.id
      and round.nfl_week = 16;

    select week.* into strict v_prior_week
    from private.season_weeks as week
    where week.id = v_prior_round.week_id and week.state = 'FINAL';

    select jsonb_agg(
      private.final_playoff_matchup_outcome(matchup.id, v_publication.id)
      order by matchup.display_order
    ) into v_outcomes
    from private.matchups as matchup
    where matchup.playoff_round_publication_id = v_prior_round.id
      and matchup.scope = 'PLAYOFF';

    if jsonb_array_length(coalesce(v_outcomes, '[]'::jsonb)) <> 2 then
      raise exception using errcode = '55000', message = 'Both Week 16 semifinals must be final before finals publication.';
    end if;

    v_first_winner := v_outcomes #> '{0,winner}';
    v_second_winner := v_outcomes #> '{1,winner}';
    v_first_loser := v_outcomes #> '{0,loser}';
    v_second_loser := v_outcomes #> '{1,loser}';
    v_games := jsonb_build_array(
      jsonb_build_object(
        'game', 1,
        'label', 'Championship',
        'scope', 'PLAYOFF',
        'sideA', v_first_winner,
        'sideB', v_second_winner
      ),
      jsonb_build_object(
        'game', 2,
        'label', 'Third place',
        'scope', 'PLACEMENT',
        'sideA', v_first_loser,
        'sideB', v_second_loser
      )
    );
    select array_agg((outcome.value ->> 'resultVersionId')::uuid order by outcome.ordinality)
    into v_source_result_ids
    from jsonb_array_elements(v_outcomes) with ordinality as outcome(value, ordinality);
    v_stage_scope := 'PLAYOFF';
  end if;

  if v_games is null or exists (
    select 1
    from jsonb_array_elements(v_games) as game(value)
    where game.value -> 'sideA' is null
      or jsonb_typeof(game.value -> 'sideA') = 'null'
      or game.value -> 'sideB' is null
      or jsonb_typeof(game.value -> 'sideB') = 'null'
      or game.value #>> '{sideA,entryId}' = game.value #>> '{sideB,entryId}'
  ) then
    raise exception using errcode = '55000', message = 'The frozen bracket cannot produce a complete next round.';
  end if;

  select array_agg(distinct participant.entry_id order by participant.entry_id)
  into v_participants
  from (
    select (game.value #>> '{sideA,entryId}')::uuid as entry_id
    from jsonb_array_elements(v_games) as game(value)
    union all
    select (game.value #>> '{sideB,entryId}')::uuid
    from jsonb_array_elements(v_games) as game(value)
  ) as participant;

  return jsonb_build_object(
    'week', p_nfl_week,
    'stageScope', v_stage_scope,
    'games', v_games,
    'participantEntryIds', to_jsonb(v_participants),
    'sourceResultVersionIds', to_jsonb(v_source_result_ids)
  );
end;
$$;

revoke execute on function private.playoff_qualification_seed(uuid, uuid)
from public, anon, authenticated;
revoke execute on function private.final_playoff_matchup_outcome(uuid, uuid)
from public, anon, authenticated;
revoke execute on function private.build_next_live_postseason_round(uuid, integer)
from public, anon, authenticated;

-- Existing card, quote, lock, score, and read-model RPCs target the latest
-- materialized week. Extend their already-generalized selector from the latest
-- REGULAR week to the latest week of any competition scope.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_old_selector constant text := 'and current_week.scope = ''REGULAR''';
  v_occurrences integer;
begin
  foreach v_signature in array array[
    'api.accept_stage1_card(text,jsonb,text)'::regprocedure,
    'api.lock_stage1_week(uuid,text)'::regprocedure,
    'api.refresh_live_week_quotes(uuid,uuid,text)'::regprocedure,
    'api.get_live_quote_heads(text)'::regprocedure,
    'api.get_stage1_state(text)'::regprocedure,
    'api.import_live_scores(uuid,jsonb,text)'::regprocedure,
    'api.get_live_week_operations(text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_occurrences := (length(v_definition) - length(replace(v_definition, v_old_selector, '')))
      / length(v_old_selector);
    if v_occurrences <> 1 then
      raise exception '% expected one latest-regular selector, found %', v_signature, v_occurrences;
    end if;
    execute replace(v_definition, v_old_selector, '');
  end loop;
end;
$migration$;

-- Commands that authorize against an active competitive season now accept the
-- frozen PLAYOFFS lifecycle as well as REGULAR.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_old constant text := 'season.lifecycle = ''REGULAR''';
  v_new constant text := 'season.lifecycle in (''REGULAR'', ''PLAYOFFS'')';
  v_occurrences integer;
begin
  foreach v_signature in array array[
    'api.accept_stage1_card(text,jsonb,text)'::regprocedure,
    'api.lock_stage1_week(uuid,text)'::regprocedure,
    'api.import_live_scores(uuid,jsonb,text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_occurrences := (length(v_definition) - length(replace(v_definition, v_old, '')))
      / length(v_old);
    if v_occurrences <> 1 then
      raise exception '% expected one regular lifecycle guard, found %', v_signature, v_occurrences;
    end if;
    execute replace(v_definition, v_old, v_new);
  end loop;
end;
$migration$;

-- Postseason settlement reuses the receipt and matchup ledgers but must never
-- create or reorder a regular-season standings snapshot.
do $migration$
declare
  v_definition text;
  v_old constant text := 'if v_matchup_count > 0 and v_completed_matchup_count = v_matchup_count then';
  v_new constant text := 'if v_week.scope = ''REGULAR'' and v_matchup_count > 0 and v_completed_matchup_count = v_matchup_count then';
begin
  select pg_get_functiondef('private.recompute_stage1_week(uuid,uuid)'::regprocedure)
  into v_definition;
  if (length(v_definition) - length(replace(v_definition, v_old, '')))
      / length(v_old) <> 1 then
    raise exception 'recompute_stage1_week completion guard changed; migration refused';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

create or replace function api.finalize_stage1_week(
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
  v_week private.season_weeks%rowtype;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_previous_score private.weekly_score_versions%rowtype;
  v_previous_matchup private.matchup_result_versions%rowtype;
  v_previous_standings private.standings_snapshots%rowtype;
  v_side_a_score_id uuid;
  v_side_b_score_id uuid;
  v_new_hash text;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;

  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id
    and season.lifecycle in ('REGULAR', 'PLAYOFFS')
  order by season.created_at desc
  limit 1
  for update;

  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_season.id
  order by week.nfl_week desc
  limit 1
  for update;

  v_request_hash := encode(
    extensions.digest(p_league_id::text || ':FINALIZE:' || v_week.id::text, 'sha256'),
    'hex'
  );

  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'FINALIZE_STAGE1_WEEK'
    and command.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  if v_week.state <> 'PROVISIONAL'
    or v_week.correction_window_closes_at is null
    or private.stage1_season_time(v_season.id) < v_week.correction_window_closes_at then
    raise exception using errcode = '55000', message = 'The current week cannot finalize before its correction window closes.';
  end if;

  for v_previous_score in
    select distinct on (score.card_id) score.*
    from private.weekly_score_versions as score
    where score.week_id = v_week.id
    order by score.card_id, score.created_at desc, score.id desc
  loop
    v_new_hash := encode(
      extensions.digest(v_previous_score.input_hash || ':FINAL', 'sha256'),
      'hex'
    );
    insert into private.weekly_score_versions (
      card_id, week_id, league_id, entry_id, input_hash, compliance,
      score_centicredits, is_complete, status, supersedes_id
    ) values (
      v_previous_score.card_id, v_previous_score.week_id,
      v_previous_score.league_id, v_previous_score.entry_id, v_new_hash,
      v_previous_score.compliance, v_previous_score.score_centicredits,
      v_previous_score.is_complete, 'FINAL', v_previous_score.id
    ) on conflict (card_id, input_hash) do nothing;
  end loop;

  for v_previous_matchup in
    select distinct on (result.matchup_id) result.*
    from private.matchup_result_versions as result
    where result.week_id = v_week.id
    order by result.matchup_id, result.created_at desc, result.id desc
  loop
    select score.id into strict v_side_a_score_id
    from private.weekly_score_versions as score
    join private.matchups as matchup
      on matchup.id = v_previous_matchup.matchup_id
     and matchup.side_a_entry_id = score.entry_id
    where score.week_id = v_week.id and score.status = 'FINAL'
    order by score.created_at desc, score.id desc
    limit 1;

    select score.id into strict v_side_b_score_id
    from private.weekly_score_versions as score
    join private.matchups as matchup
      on matchup.id = v_previous_matchup.matchup_id
     and matchup.side_b_entry_id = score.entry_id
    where score.week_id = v_week.id and score.status = 'FINAL'
    order by score.created_at desc, score.id desc
    limit 1;

    v_new_hash := encode(
      extensions.digest(
        v_previous_matchup.input_hash || ':FINAL:'
        || v_side_a_score_id::text || ':' || v_side_b_score_id::text,
        'sha256'
      ),
      'hex'
    );
    insert into private.matchup_result_versions (
      matchup_id, week_id, league_id, side_a_score_version_id,
      side_b_score_version_id, side_a_decision, side_b_decision,
      side_a_points_for_centicredits, side_b_points_for_centicredits,
      input_hash, status, supersedes_id
    ) values (
      v_previous_matchup.matchup_id, v_previous_matchup.week_id,
      v_previous_matchup.league_id, v_side_a_score_id, v_side_b_score_id,
      v_previous_matchup.side_a_decision, v_previous_matchup.side_b_decision,
      v_previous_matchup.side_a_points_for_centicredits,
      v_previous_matchup.side_b_points_for_centicredits,
      v_new_hash, 'FINAL', v_previous_matchup.id
    ) on conflict (matchup_id, input_hash) do nothing;
  end loop;

  if v_week.scope = 'REGULAR' then
    select standings.* into strict v_previous_standings
    from private.standings_snapshots as standings
    where standings.week_id = v_week.id
    order by standings.created_at desc, standings.id desc
    limit 1;

    v_new_hash := encode(
      extensions.digest(v_previous_standings.input_hash || ':FINAL', 'sha256'),
      'hex'
    );
    insert into private.standings_snapshots (
      season_id, week_id, league_id, through_week, ordered_rows,
      input_hash, status, supersedes_id
    ) values (
      v_previous_standings.season_id, v_previous_standings.week_id,
      v_previous_standings.league_id, v_previous_standings.through_week,
      v_previous_standings.ordered_rows, v_new_hash, 'FINAL',
      v_previous_standings.id
    );
  end if;

  update private.season_weeks set state = 'FINAL' where id = v_week.id;

  v_response := jsonb_build_object(
    'weekId', v_week.id,
    'week', v_week.nfl_week,
    'scope', v_week.scope,
    'state', 'FINAL',
    'finalizedAt', private.stage1_season_time(v_season.id)
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'FINALIZE_STAGE1_WEEK', p_idempotency_key,
    v_request_hash, v_response
  );
  return v_response;
end;
$$;

revoke all on function api.finalize_stage1_week(uuid, text) from public, anon;
grant execute on function api.finalize_stage1_week(uuid, text) to authenticated;

create or replace function api.publish_next_live_postseason_week(
  p_league_id uuid,
  p_import_id uuid,
  p_external_event_ids text[],
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
  v_previous_week private.season_weeks%rowtype;
  v_publication private.playoff_publications%rowtype;
  v_import private.live_odds_imports%rowtype;
  v_command private.command_receipts%rowtype;
  v_round_id uuid := gen_random_uuid();
  v_week_id uuid := gen_random_uuid();
  v_slate_id uuid := gen_random_uuid();
  v_selected_event_ids text[];
  v_selected_count integer;
  v_available_count integer;
  v_next_week integer;
  v_round jsonb;
  v_participant_ids uuid[];
  v_source_result_ids uuid[];
  v_matchup_count integer;
  v_card_count integer;
  v_request_hash text;
  v_input_hash text;
  v_published_at timestamptz := clock_timestamp();
  v_first_kickoff_at timestamptz;
  v_common_lock_at timestamptz;
  v_event_json jsonb;
  v_market_json jsonb;
  v_event_id uuid;
  v_snapshot_id uuid;
  v_line_milli integer;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Idempotency key is invalid.';
  end if;
  if p_import_id is null or p_external_event_ids is null
    or cardinality(p_external_event_ids) not between 1 and 32 then
    raise exception using errcode = '22023', message = 'Select between one and 32 imported events.';
  end if;

  select array_agg(btrim(event_id) order by btrim(event_id))
  into v_selected_event_ids
  from unnest(p_external_event_ids) as selected(event_id);

  if exists (
    select 1 from unnest(v_selected_event_ids) as selected(event_id)
    where selected.event_id = ''
  ) or (
    select count(*) from unnest(v_selected_event_ids)
  ) <> (
    select count(distinct event_id)
    from unnest(v_selected_event_ids) as selected(event_id)
  ) then
    raise exception using errcode = '22023', message = 'Selected event identifiers must be unique and non-empty.';
  end if;

  v_request_hash := encode(
    extensions.digest(
      p_league_id::text || ':' || p_import_id::text || ':'
      || array_to_string(v_selected_event_ids, ','),
      'sha256'
    ),
    'hex'
  );

  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'PUBLISH_NEXT_LIVE_POSTSEASON_WEEK'
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
    and season.mode = 'LIVE'
    and season.lifecycle = 'PLAYOFFS'
  order by season.created_at desc
  limit 1
  for update;

  select publication.* into strict v_publication
  from private.playoff_publications as publication
  where publication.season_id = v_season.id
  for share;

  select week.* into strict v_previous_week
  from private.season_weeks as week
  where week.season_id = v_season.id
  order by week.nfl_week desc
  limit 1
  for update;

  if v_previous_week.state <> 'FINAL' then
    raise exception using errcode = '55000', message = 'The current week must be final before the next postseason week can publish.';
  end if;
  if v_previous_week.nfl_week < 14 or v_previous_week.nfl_week >= 17 then
    raise exception using errcode = '55000', message = 'No additional competitive postseason week can publish.';
  end if;
  v_next_week := v_previous_week.nfl_week + 1;
  v_round := private.build_next_live_postseason_round(v_publication.id, v_next_week);
  select array_agg(participant.value::uuid order by participant.ordinality)
  into v_participant_ids
  from jsonb_array_elements_text(v_round -> 'participantEntryIds')
    with ordinality as participant(value, ordinality);
  select coalesce(array_agg(source.value::uuid order by source.ordinality), '{}'::uuid[])
  into v_source_result_ids
  from jsonb_array_elements_text(v_round -> 'sourceResultVersionIds')
    with ordinality as source(value, ordinality);

  select odds_import.* into strict v_import
  from private.live_odds_imports as odds_import
  where odds_import.id = p_import_id
    and odds_import.season_id = v_season.id
    and odds_import.league_id = p_league_id;

  if exists (
    select 1 from private.live_odds_imports as newer_import
    where newer_import.season_id = v_season.id
      and (newer_import.created_at, newer_import.id) > (v_import.created_at, v_import.id)
  ) then
    raise exception using errcode = '40001', message = 'A newer reviewed import is available.';
  end if;
  if v_import.fetched_at <= v_previous_week.common_lock_at then
    raise exception using errcode = '55000', message = 'Import current NFL markets after the prior week before publishing the postseason slate.';
  end if;

  select count(*) into v_available_count
  from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
  where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids);
  v_selected_count := cardinality(v_selected_event_ids);
  if v_available_count <> v_selected_count then
    raise exception using errcode = '22023', message = 'Every selected event must belong to the reviewed import.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
    cross join lateral jsonb_array_elements(provider_event.value -> 'markets') as provider_market(value)
    where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids)
      and (
        (provider_market.value ->> 'observedAt')::timestamptz > v_published_at
        or (provider_market.value ->> 'observedAt')::timestamptz < v_published_at - interval '2 minutes'
      )
  ) then
    raise exception using errcode = '55000', message = 'Every selected event requires six fresh current quotes before cards open.';
  end if;

  select min((provider_event.value ->> 'scheduledStartAt')::timestamptz)
  into v_first_kickoff_at
  from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
  where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids);
  v_common_lock_at := v_first_kickoff_at - interval '5 minutes';
  if v_common_lock_at <= v_published_at then
    raise exception using errcode = '22023', message = 'The selected slate has already reached common lock.';
  end if;

  v_input_hash := encode(
    extensions.digest(
      v_publication.input_hash || ':' || v_next_week::text || ':'
      || v_import.payload_hash || ':' || array_to_string(v_selected_event_ids, ',')
      || ':' || (v_round -> 'games')::text || ':'
      || array_to_string(v_source_result_ids, ','),
      'sha256'
    ),
    'hex'
  );

  insert into private.season_weeks (
    id, season_id, league_id, nfl_week, scope, state, opens_at, common_lock_at
  ) values (
    v_week_id, v_season.id, p_league_id, v_next_week,
    case when v_round ->> 'stageScope' = 'EXHIBITION' then 'EXHIBITION' else 'PLAYOFF' end,
    'OPEN', v_published_at, v_common_lock_at
  );
  insert into private.slates (
    id, week_id, season_id, league_id, version, fixture_id,
    common_lock_at, published_at
  ) values (
    v_slate_id, v_week_id, v_season.id, p_league_id, 1,
    'live-postseason-import:' || v_import.id::text,
    v_common_lock_at, v_published_at
  );

  for v_event_json in
    select provider_event.value
    from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
    where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids)
    order by (provider_event.value ->> 'scheduledStartAt')::timestamptz,
      provider_event.value ->> 'externalEventId'
  loop
    v_event_id := gen_random_uuid();
    insert into private.sports_events (
      id, week_id, season_id, league_id, fixture_event_key, away_team,
      home_team, scheduled_start_at, provider_health
    ) values (
      v_event_id, v_week_id, v_season.id, p_league_id,
      v_event_json ->> 'externalEventId', v_event_json ->> 'awayTeam',
      v_event_json ->> 'homeTeam',
      (v_event_json ->> 'scheduledStartAt')::timestamptz, 'HEALTHY'
    );

    for v_market_json in
      select provider_market.value
      from jsonb_array_elements(v_event_json -> 'markets') as provider_market(value)
      order by provider_market.value ->> 'marketType', provider_market.value ->> 'outcomeKey'
    loop
      v_snapshot_id := gen_random_uuid();
      v_line_milli := case
        when jsonb_typeof(v_market_json -> 'lineMilli') = 'null' then null
        else (v_market_json ->> 'lineMilli')::integer
      end;
      insert into private.market_snapshots (
        id, event_id, week_id, league_id, book_key, market_type, outcome_key,
        proposition, line_milli, american_odds, quality_status,
        observed_at, payload_hash
      ) values (
        v_snapshot_id, v_event_id, v_week_id, p_league_id,
        lower(v_market_json ->> 'sourceBook'), upper(v_market_json ->> 'marketType'),
        upper(v_market_json ->> 'outcomeKey'), v_market_json ->> 'proposition',
        v_line_milli, (v_market_json ->> 'americanOdds')::integer, 'HEALTHY',
        (v_market_json ->> 'observedAt')::timestamptz,
        encode(extensions.digest(
          (v_event_json ->> 'externalEventId') || ':' || v_market_json::text,
          'sha256'
        ), 'hex')
      );
      insert into private.slate_items (
        slate_id, event_id, market_snapshot_id, week_id, league_id
      ) values (v_slate_id, v_event_id, v_snapshot_id, v_week_id, p_league_id);
    end loop;
  end loop;

  if (
    select count(*) from private.sports_events as event where event.week_id = v_week_id
  ) <> v_selected_count or (
    select count(*) from private.slate_items as item where item.week_id = v_week_id
  ) <> v_selected_count * 6 or (
    select count(*) from private.live_quote_heads as head where head.week_id = v_week_id
  ) <> v_selected_count * 6 then
    raise exception using errcode = '22023', message = 'The published slate is incomplete.';
  end if;

  insert into private.playoff_round_publications (
    id, playoff_publication_id, season_id, league_id, week_id,
    live_odds_import_id, nfl_week, stage_scope,
    selected_external_event_ids, participant_entry_ids, matchups_json,
    source_result_version_ids, input_hash, created_by, published_at
  ) values (
    v_round_id, v_publication.id, v_season.id, p_league_id, v_week_id,
    v_import.id, v_next_week, v_round ->> 'stageScope',
    v_selected_event_ids, v_participant_ids, v_round -> 'games',
    v_source_result_ids, v_input_hash, v_user_id, v_published_at
  );

  insert into private.matchups (
    week_id, season_id, league_id, schedule_publication_id,
    playoff_round_publication_id, side_a_entry_id, side_b_entry_id,
    scope, display_order
  )
  select
    v_week_id, v_season.id, p_league_id, null, v_round_id,
    (game.value #>> '{sideA,entryId}')::uuid,
    (game.value #>> '{sideB,entryId}')::uuid,
    case game.value ->> 'scope'
      when 'EXHIBITION' then 'EXHIBITION'
      when 'PLACEMENT' then 'PLACEMENT'
      else 'PLAYOFF'
    end,
    game.ordinality::integer
  from jsonb_array_elements(v_round -> 'games') with ordinality as game(value, ordinality)
  order by game.ordinality;
  get diagnostics v_matchup_count = row_count;

  insert into private.weekly_cards (
    week_id, season_id, league_id, entry_id, owner_user_id,
    granted_credits, granted_at
  )
  select
    v_week_id, v_season.id, p_league_id, entry.id, entry.user_id,
    1000, v_published_at
  from private.season_entries as entry
  where entry.season_id = v_season.id and entry.id = any(v_participant_ids)
  order by entry.id;
  get diagnostics v_card_count = row_count;

  if v_matchup_count <> jsonb_array_length(v_round -> 'games')
    or v_card_count <> cardinality(v_participant_ids) then
    raise exception using errcode = '22023', message = 'The postseason round did not materialize completely.';
  end if;

  v_response := jsonb_build_object(
    'leagueId', p_league_id,
    'seasonId', v_season.id,
    'playoffPublicationId', v_publication.id,
    'roundPublicationId', v_round_id,
    'weekId', v_week_id,
    'slateId', v_slate_id,
    'importId', v_import.id,
    'week', v_next_week,
    'scope', v_round ->> 'stageScope',
    'eventCount', v_selected_count,
    'marketCount', v_selected_count * 6,
    'matchupCount', v_matchup_count,
    'cardCount', v_card_count,
    'grantedCreditsPerEntry', 1000,
    'commonLockAt', v_common_lock_at,
    'publishedAt', v_published_at,
    'inputHash', v_input_hash,
    'weekState', 'OPEN'
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'PUBLISH_NEXT_LIVE_POSTSEASON_WEEK',
    p_idempotency_key, v_request_hash, v_response
  );
  return v_response;
end;
$$;

revoke all on function api.publish_next_live_postseason_week(uuid, uuid, text[], text)
from public, anon;
grant execute on function api.publish_next_live_postseason_week(uuid, uuid, text[], text)
to authenticated;

-- Include competition scope in the existing participant read model while
-- preserving its sealed-card projection and frozen Week 14 standings source.
do $migration$
declare
  v_definition text;
  v_old_week constant text := $old$'nflWeek', v_week.nfl_week,
      'state', v_week.state,$old$;
  v_new_week constant text := $new$'nflWeek', v_week.nfl_week,
      'scope', v_week.scope,
      'state', v_week.state,$new$;
  v_old_matchup constant text := $old$'displayOrder', matchup.display_order,
          'sideAEntryId', matchup.side_a_entry_id,$old$;
  v_new_matchup constant text := $new$'displayOrder', matchup.display_order,
          'scope', matchup.scope,
          'sideAEntryId', matchup.side_a_entry_id,$new$;
begin
  select pg_get_functiondef('api.get_stage1_state(text)'::regprocedure)
  into v_definition;
  if strpos(v_definition, v_old_week) = 0 or strpos(v_definition, v_old_matchup) = 0 then
    raise exception 'get_stage1_state projection shape changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old_week, v_new_week);
  v_definition := replace(v_definition, v_old_matchup, v_new_matchup);
  execute v_definition;
end;
$migration$;

create or replace function api.get_live_playoff_state(p_league_slug text)
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
  v_publication private.playoff_publications%rowtype;
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
  where season.league_id = v_league.id and season.mode = 'LIVE'
  order by season.created_at desc
  limit 1;
  select publication.* into v_publication
  from private.playoff_publications as publication
  where publication.season_id = v_season.id;
  if v_publication.id is null then return null; end if;

  return jsonb_build_object(
    'league', jsonb_build_object(
      'id', v_league.id,
      'name', v_league.name,
      'slug', v_league.slug,
      'nflYear', v_season.nfl_year,
      'lifecycle', v_season.lifecycle
    ),
    'publication', jsonb_build_object(
      'id', v_publication.id,
      'publishedAt', v_publication.published_at,
      'inputHash', v_publication.input_hash,
      'rosterSize', v_publication.roster_size,
      'expectedQualifierCount', v_publication.expected_qualifier_count,
      'actualQualifierCount', jsonb_array_length(v_publication.qualifiers),
      'standings', v_publication.standings_json,
      'qualifiers', v_publication.qualifiers,
      'bracket', v_publication.bracket_json,
      'tieRule', 'HIGHER_QUALIFICATION_SEED_ADVANCES',
      'attendanceMissLimit', 3
    ),
    'rounds', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', round.id,
          'week', round.nfl_week,
          'scope', round.stage_scope,
          'state', week.state,
          'commonLockAt', week.common_lock_at,
          'publishedAt', round.published_at,
          'inputHash', round.input_hash,
          'sourceResultVersionIds', to_jsonb(round.source_result_version_ids),
          'matchups', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', matchup.id,
                'game', matchup.display_order,
                'scope', matchup.scope,
                'label', round.matchups_json #>> array[(matchup.display_order - 1)::text, 'label'],
                'sideA', jsonb_build_object(
                  'entryId', matchup.side_a_entry_id,
                  'displayName', side_a_profile.display_name,
                  'qualificationSeed', private.playoff_qualification_seed(v_publication.id, matchup.side_a_entry_id)
                ),
                'sideB', jsonb_build_object(
                  'entryId', matchup.side_b_entry_id,
                  'displayName', side_b_profile.display_name,
                  'qualificationSeed', private.playoff_qualification_seed(v_publication.id, matchup.side_b_entry_id)
                ),
                'result', case when result.id is null then null else jsonb_build_object(
                  'id', result.id,
                  'status', result.status,
                  'sideADecision', result.side_a_decision,
                  'sideBDecision', result.side_b_decision,
                  'sideAScoreCenticredits', result.side_a_points_for_centicredits,
                  'sideBScoreCenticredits', result.side_b_points_for_centicredits,
                  'advancingEntryId', case
                    when result.status = 'FINAL' and matchup.scope = 'PLAYOFF'
                    then private.final_playoff_matchup_outcome(matchup.id, v_publication.id) #>> '{winner,entryId}'
                    else null
                  end
                ) end
              ) order by matchup.display_order
            )
            from private.matchups as matchup
            join private.season_entries as side_a_entry on side_a_entry.id = matchup.side_a_entry_id
            join private.profiles as side_a_profile on side_a_profile.id = side_a_entry.user_id
            join private.season_entries as side_b_entry on side_b_entry.id = matchup.side_b_entry_id
            join private.profiles as side_b_profile on side_b_profile.id = side_b_entry.user_id
            left join lateral (
              select candidate.*
              from private.matchup_result_versions as candidate
              where candidate.matchup_id = matchup.id
              order by candidate.created_at desc, candidate.id desc
              limit 1
            ) as result on true
            where matchup.playoff_round_publication_id = round.id
          ), '[]'::jsonb)
        ) order by round.nfl_week
      )
      from private.playoff_round_publications as round
      join private.season_weeks as week on week.id = round.week_id
      where round.playoff_publication_id = v_publication.id
    ), '[]'::jsonb),
    'viewer', jsonb_build_object(
      'userId', v_user_id,
      'isCommissioner', private.is_league_commissioner(v_league.id)
    )
  );
end;
$$;

revoke all on function api.get_live_playoff_state(text) from public, anon;
grant execute on function api.get_live_playoff_state(text) to authenticated;
