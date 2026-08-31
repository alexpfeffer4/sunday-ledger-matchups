-- Phase 8B: champion finality, all-member Week 18 exhibitions, and a
-- versioned final archive. All competitive facts remain append-only. This
-- migration generalizes the existing Live archive relation in place.

alter table private.seasons
  drop constraint seasons_lifecycle_check,
  add constraint seasons_lifecycle_check check (
    lifecycle in (
      'DRAFT', 'ROSTER_LOCKED', 'REGULAR', 'PLAYOFFS',
      'CHAMPION_FINAL', 'WEEK_18_EXHIBITION', 'FINAL'
    )
  );

alter table private.playoff_round_publications
  drop constraint playoff_round_publications_nfl_week_check,
  add constraint playoff_round_publications_nfl_week_check
    check (nfl_week between 15 and 18);

alter table private.playoff_publications
  add column publication_stage text not null default 'QUALIFICATION'
    check (publication_stage in ('QUALIFICATION', 'CHAMPION_FINAL')),
  add column champion_entry_id uuid,
  add column runner_up_entry_id uuid,
  add column third_place_entry_ids uuid[],
  add column third_place_tied boolean,
  add column final_placement_json jsonb,
  add column terminal_result_version_ids uuid[],
  add column correction_id uuid references private.corrections (id),
  add column champion_finalized_at timestamptz,
  add constraint playoff_publications_champion_same_season_fk
    foreign key (champion_entry_id, season_id, league_id)
    references private.season_entries (id, season_id, league_id),
  add constraint playoff_publications_runner_up_same_season_fk
    foreign key (runner_up_entry_id, season_id, league_id)
    references private.season_entries (id, season_id, league_id),
  add constraint playoff_publications_final_placement_array_check
    check (final_placement_json is null or jsonb_typeof(final_placement_json) = 'array'),
  add constraint playoff_publications_champion_stage_check check (
    (publication_stage = 'QUALIFICATION'
      and champion_entry_id is null
      and runner_up_entry_id is null
      and third_place_entry_ids is null
      and third_place_tied is null
      and final_placement_json is null
      and terminal_result_version_ids is null
      and champion_finalized_at is null)
    or
    (publication_stage = 'CHAMPION_FINAL'
      and champion_entry_id is not null
      and runner_up_entry_id is not null
      and champion_entry_id <> runner_up_entry_id
      and cardinality(third_place_entry_ids) between 1 and 2
      and third_place_tied = (cardinality(third_place_entry_ids) = 2)
      and jsonb_typeof(final_placement_json) = 'array'
      and cardinality(terminal_result_version_ids) > 0
      and champion_finalized_at is not null)
  );

create index playoff_publications_champion_entry_idx
  on private.playoff_publications (champion_entry_id, season_id, league_id)
  where champion_entry_id is not null;
create index playoff_publications_runner_up_entry_idx
  on private.playoff_publications (runner_up_entry_id, season_id, league_id)
  where runner_up_entry_id is not null;
create index playoff_publications_correction_idx
  on private.playoff_publications (correction_id)
  where correction_id is not null;
create index playoff_publications_stage_terminal_idx
  on private.playoff_publications (season_id, publication_stage, version desc);

-- Rename the existing relation and its metadata. No archive row, identifier,
-- hash, document, champion, or publication timestamp is copied or replaced.
alter table private.live_season_archives rename to season_archive_versions;
alter table private.season_archive_versions
  rename constraint live_season_archives_pkey to season_archive_versions_pkey;
alter table private.season_archive_versions
  rename constraint live_season_archives_season_id_key to season_archive_versions_season_id_key;
alter table private.season_archive_versions
  rename constraint live_season_archives_archive_hash_key to season_archive_versions_archive_hash_key;
alter trigger live_season_archives_append_only on private.season_archive_versions
  rename to season_archive_versions_append_only;
alter policy live_season_archives_select_member on private.season_archive_versions
  rename to season_archive_versions_select_member;

alter index private.live_season_archives_league_published_idx
  rename to season_archive_versions_league_published_idx;
alter index private.live_season_archives_ruleset_fk_idx
  rename to season_archive_versions_ruleset_fk_idx;
alter index private.live_season_archives_schedule_fk_idx
  rename to season_archive_versions_schedule_fk_idx;
alter index private.live_season_archives_playoff_fk_idx
  rename to season_archive_versions_terminal_bracket_fk_idx;
alter index private.live_season_archives_championship_result_fk_idx
  rename to season_archive_versions_championship_result_fk_idx;
alter index private.live_season_archives_third_place_result_fk_idx
  rename to season_archive_versions_third_place_result_fk_idx;
alter index private.live_season_archives_champion_fk_idx
  rename to season_archive_versions_champion_fk_idx;
alter index private.live_season_archives_runner_up_fk_idx
  rename to season_archive_versions_runner_up_fk_idx;
alter index private.live_season_archives_third_place_fk_idx
  rename to season_archive_versions_third_place_fk_idx;
alter index private.live_season_archives_published_by_fk_idx
  rename to season_archive_versions_published_by_fk_idx;
alter index private.live_season_archives_season_league_fk_idx
  rename to season_archive_versions_season_league_fk_idx;

alter table private.season_archive_versions
  rename column playoff_publication_id to terminal_bracket_publication_id;

alter table private.season_archive_versions
  add column archive_schema_version integer not null default 1,
  add column version integer not null default 1,
  add column supersedes_id uuid,
  add column terminal_w17_result_version_ids uuid[],
  add column effective_w18_round_publication_id uuid,
  add column effective_w18_nfl_week integer,
  add column terminal_w18_result_version_ids uuid[],
  add column correction_id uuid references private.corrections (id);

alter table private.season_archive_versions
  drop constraint season_archive_versions_season_id_key,
  add constraint season_archive_versions_version_positive check (version > 0),
  add constraint season_archive_versions_schema_supported
    check (archive_schema_version in (1, 2)),
  add constraint season_archive_versions_schema_matches_document
    check ((archive_json ->> 'schemaVersion')::integer = archive_schema_version),
  add constraint season_archive_versions_version_parent_check check (
    (version = 1 and supersedes_id is null)
    or (version > 1 and supersedes_id is not null)
  ),
  add constraint season_archive_versions_season_version_key
    unique (season_id, version),
  add constraint season_archive_versions_id_season_key
    unique (id, season_id),
  add constraint season_archive_versions_supersedes_same_season_fk
    foreign key (supersedes_id, season_id)
    references private.season_archive_versions (id, season_id),
  add constraint season_archive_versions_w18_week_check
    check (effective_w18_nfl_week is null or effective_w18_nfl_week = 18),
  add constraint season_archive_versions_w18_round_same_season_fk
    foreign key (
      effective_w18_round_publication_id,
      season_id,
      effective_w18_nfl_week
    ) references private.playoff_round_publications (id, season_id, nfl_week),
  add constraint season_archive_versions_v2_terminal_evidence_check check (
    archive_schema_version = 1
    or (
      terminal_w17_result_version_ids is not null
      and cardinality(terminal_w17_result_version_ids) > 0
      and effective_w18_round_publication_id is not null
      and effective_w18_nfl_week = 18
      and terminal_w18_result_version_ids is not null
      and cardinality(terminal_w18_result_version_ids) > 0
    )
  );

create unique index season_archive_versions_one_successor_idx
  on private.season_archive_versions (supersedes_id)
  where supersedes_id is not null;
create index season_archive_versions_terminal_idx
  on private.season_archive_versions (season_id, version desc);
create index season_archive_versions_supersedes_fk_idx
  on private.season_archive_versions (supersedes_id, season_id);
create index season_archive_versions_w18_round_fk_idx
  on private.season_archive_versions (
    effective_w18_round_publication_id,
    season_id,
    effective_w18_nfl_week
  ) where effective_w18_round_publication_id is not null;
create index season_archive_versions_correction_fk_idx
  on private.season_archive_versions (correction_id)
  where correction_id is not null;

-- Existing result authorities gain explicit same-parent no-fork protection.
alter table private.event_result_versions
  add constraint event_result_versions_id_event_key unique (id, event_id),
  add constraint event_result_versions_supersedes_same_event_fk
    foreign key (supersedes_id, event_id)
    references private.event_result_versions (id, event_id);
create unique index event_result_versions_one_successor_idx
  on private.event_result_versions (supersedes_id)
  where supersedes_id is not null;

alter table private.settlement_versions
  add constraint settlement_versions_id_receipt_key unique (id, receipt_id),
  add constraint settlement_versions_supersedes_same_receipt_fk
    foreign key (supersedes_id, receipt_id)
    references private.settlement_versions (id, receipt_id);
create unique index settlement_versions_one_successor_idx
  on private.settlement_versions (supersedes_id)
  where supersedes_id is not null;

alter table private.weekly_score_versions
  add constraint weekly_score_versions_id_card_key unique (id, card_id),
  add constraint weekly_score_versions_supersedes_same_card_fk
    foreign key (supersedes_id, card_id)
    references private.weekly_score_versions (id, card_id);
create unique index weekly_score_versions_one_successor_idx
  on private.weekly_score_versions (supersedes_id)
  where supersedes_id is not null;

alter table private.matchup_result_versions
  add constraint matchup_result_versions_id_matchup_key unique (id, matchup_id),
  add constraint matchup_result_versions_supersedes_same_matchup_fk
    foreign key (supersedes_id, matchup_id)
    references private.matchup_result_versions (id, matchup_id);
create unique index matchup_result_versions_one_successor_idx
  on private.matchup_result_versions (supersedes_id)
  where supersedes_id is not null;

create or replace function private.enforce_season_archive_lineage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parent_version integer;
begin
  if new.version = 1 then return new; end if;
  select parent.version into strict v_parent_version
  from private.season_archive_versions as parent
  where parent.id = new.supersedes_id and parent.season_id = new.season_id
  for key share;
  if new.version <> v_parent_version + 1 then
    raise exception using errcode = '55000', message = 'Archive versions must be contiguous.';
  end if;
  if exists (
    select 1 from private.season_archive_versions as successor
    where successor.supersedes_id = new.supersedes_id
  ) then
    raise exception using errcode = '55000', message = 'The archive lineage already has a successor.';
  end if;
  return new;
end;
$$;

create trigger season_archive_versions_lineage_guard
before insert on private.season_archive_versions
for each row execute function private.enforce_season_archive_lineage();

revoke execute on function private.enforce_season_archive_lineage()
from public, anon, authenticated;

-- Champion-final publications do not invalidate the already-played round
-- facts of their qualification ancestor. A corrected qualification still
-- does, and a superseding round always does.
create or replace function private.is_effective_postseason_matchup(p_matchup_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when matchup.playoff_round_publication_id is null then true
    else not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    ) and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
        and successor.publication_stage = 'QUALIFICATION'
    )
  end
  from private.matchups as matchup
  left join private.playoff_round_publications as round
    on round.id = matchup.playoff_round_publication_id
  left join private.playoff_publications as publication
    on publication.id = round.playoff_publication_id
  where matchup.id = p_matchup_id;
$$;

revoke execute on function private.is_effective_postseason_matchup(uuid)
from public, anon, authenticated;

create or replace function private.is_effective_slate_item(p_slate_item_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when not exists (
      select 1 from private.playoff_round_publications as any_round
      where any_round.week_id = item.week_id
    ) then true
    else exists (
      select 1
      from private.playoff_round_publications as round
      join private.playoff_publications as publication
        on publication.id = round.playoff_publication_id
      where round.week_id = item.week_id
        and round.version = slate.version
        and not exists (
          select 1 from private.playoff_round_publications as successor
          where successor.supersedes_id = round.id
        )
        and not exists (
          select 1 from private.playoff_publications as successor
          where successor.supersedes_id = publication.id
            and successor.publication_stage = 'QUALIFICATION'
        )
    )
  end
  from private.slate_items as item
  join private.slates as slate on slate.id = item.slate_id
  where item.id = p_slate_item_id;
$$;

revoke execute on function private.is_effective_slate_item(uuid)
from public, anon, authenticated;

create or replace function private.is_week18_pairing_replaceable(
  p_round_publication_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    round.nfl_week = 18
    and week.state in ('PLANNED', 'OPEN')
    and not private.is_week_card_sealed(week.id)
    and not exists (
      select 1 from private.position_receipts as receipt
      join private.weekly_cards as card on card.id = receipt.card_id
      where card.week_id = week.id
    )
    and not exists (
      select 1 from private.weekly_score_versions as score
      where score.week_id = week.id
    )
    and not exists (
      select 1 from private.matchup_result_versions as result
      where result.week_id = week.id
    )
  from private.playoff_round_publications as round
  join private.season_weeks as week on week.id = round.week_id
  where round.id = p_round_publication_id
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    );
$$;

revoke execute on function private.is_week18_pairing_replaceable(uuid)
from public, anon, authenticated;

create or replace function private.build_phase8b_champion_finality(
  p_playoff_publication_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_publication private.playoff_publications%rowtype;
  v_round private.playoff_round_publications%rowtype;
  v_championship private.matchups%rowtype;
  v_third_place private.matchups%rowtype;
  v_championship_outcome jsonb;
  v_third_result private.matchup_result_versions%rowtype;
  v_champion_id uuid;
  v_runner_up_id uuid;
  v_third_ids uuid[];
  v_third_tied boolean;
  v_terminal_ids uuid[];
  v_placements jsonb := '[]'::jsonb;
  v_placement integer := 5;
  v_entry jsonb;
begin
  select publication.* into strict v_publication
  from private.playoff_publications as publication
  where publication.id = p_playoff_publication_id;

  if (
    select count(*)
    from private.playoff_round_publications as candidate
    where candidate.season_id = v_publication.season_id
      and candidate.nfl_week = 17
      and not exists (
        select 1 from private.playoff_round_publications as successor
        where successor.supersedes_id = candidate.id
      )
  ) <> 1 then
    raise exception using errcode = '55000', message = 'Week 17 has no unambiguous terminal round.';
  end if;

  select round.* into strict v_round
  from private.playoff_round_publications as round
  join private.season_weeks as week
    on week.id = round.week_id and week.state = 'FINAL'
  where round.season_id = v_publication.season_id
    and round.nfl_week = 17
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    );

  select matchup.* into strict v_championship
  from private.matchups as matchup
  where matchup.playoff_round_publication_id = v_round.id
    and matchup.postseason_role = 'CHAMPIONSHIP'
    and private.is_effective_postseason_matchup(matchup.id);
  select matchup.* into strict v_third_place
  from private.matchups as matchup
  where matchup.playoff_round_publication_id = v_round.id
    and matchup.postseason_role = 'THIRD_PLACE'
    and private.is_effective_postseason_matchup(matchup.id);

  if exists (
    select 1 from private.matchups as matchup
    where matchup.playoff_round_publication_id = v_round.id
      and not exists (
        select 1 from private.matchup_result_versions as result
        where result.matchup_id = matchup.id
          and result.status = 'FINAL'
          and not exists (
            select 1 from private.matchup_result_versions as successor
            where successor.supersedes_id = result.id
          )
      )
  ) then
    raise exception using errcode = '55000', message = 'Every Week 17 matchup requires one terminal final result.';
  end if;

  v_championship_outcome := private.phase8_championship_outcome(
    v_championship.id,
    v_publication.id
  );
  v_champion_id := (v_championship_outcome #>> '{winner,entryId}')::uuid;
  v_runner_up_id := (v_championship_outcome #>> '{loser,entryId}')::uuid;

  select result.* into strict v_third_result
  from private.matchup_result_versions as result
  where result.matchup_id = v_third_place.id
    and result.status = 'FINAL'
    and not exists (
      select 1 from private.matchup_result_versions as successor
      where successor.supersedes_id = result.id
    );

  if v_third_result.side_a_decision = 'WIN'
    and v_third_result.side_b_decision = 'LOSS' then
    v_third_ids := array[v_third_place.side_a_entry_id];
    v_third_tied := false;
  elsif v_third_result.side_b_decision = 'WIN'
    and v_third_result.side_a_decision = 'LOSS' then
    v_third_ids := array[v_third_place.side_b_entry_id];
    v_third_tied := false;
  elsif v_third_result.side_a_decision = 'TIE'
    and v_third_result.side_b_decision = 'TIE' then
    select array_agg(participant.entry_id order by standing.ordinality)
    into v_third_ids
    from unnest(array[
      v_third_place.side_a_entry_id,
      v_third_place.side_b_entry_id
    ]) as participant(entry_id)
    join jsonb_array_elements(v_publication.standings_json)
      with ordinality as standing(value, ordinality)
      on (standing.value ->> 'entryId')::uuid = participant.entry_id;
    v_third_tied := true;
  else
    raise exception using errcode = '55000', message = 'The third-place result is internally inconsistent.';
  end if;

  select array_agg(result.id order by matchup.display_order)
  into v_terminal_ids
  from private.matchups as matchup
  join private.matchup_result_versions as result
    on result.matchup_id = matchup.id
   and result.status = 'FINAL'
   and not exists (
     select 1 from private.matchup_result_versions as successor
     where successor.supersedes_id = result.id
   )
  where matchup.playoff_round_publication_id = v_round.id;

  v_placements := jsonb_build_array(
    jsonb_build_object(
      'entryId', v_champion_id,
      'placement', 1,
      'role', 'CHAMPION',
      'tied', false
    ),
    jsonb_build_object(
      'entryId', v_runner_up_id,
      'placement', 2,
      'role', 'RUNNER_UP',
      'tied', false
    )
  );

  if v_third_tied then
    foreach v_champion_id in array v_third_ids loop
      v_placements := v_placements || jsonb_build_array(jsonb_build_object(
        'entryId', v_champion_id,
        'placement', 3,
        'role', 'THIRD_PLACE',
        'tied', true
      ));
    end loop;
    v_champion_id := (v_championship_outcome #>> '{winner,entryId}')::uuid;
  else
    v_placements := v_placements || jsonb_build_array(
      jsonb_build_object(
        'entryId', v_third_ids[1],
        'placement', 3,
        'role', 'THIRD_PLACE',
        'tied', false
      ),
      jsonb_build_object(
        'entryId', case
          when v_third_place.side_a_entry_id = v_third_ids[1]
            then v_third_place.side_b_entry_id
          else v_third_place.side_a_entry_id
        end,
        'placement', 4,
        'role', 'FOURTH_PLACE',
        'tied', false
      )
    );
  end if;

  for v_entry in
    select qualifier.value
    from jsonb_array_elements(v_publication.qualifiers)
      with ordinality as qualifier(value, ordinality)
    where (qualifier.value ->> 'entryId')::uuid not in (
      v_champion_id,
      v_runner_up_id,
      v_third_place.side_a_entry_id,
      v_third_place.side_b_entry_id
    )
    order by qualifier.ordinality
  loop
    v_placements := v_placements || jsonb_build_array(jsonb_build_object(
      'entryId', (v_entry ->> 'entryId')::uuid,
      'placement', v_placement,
      'role', 'EARLIER_ROUND',
      'tied', false
    ));
    v_placement := v_placement + 1;
  end loop;

  for v_entry in
    select standing.value
    from jsonb_array_elements(v_publication.standings_json)
      with ordinality as standing(value, ordinality)
    where not exists (
      select 1
      from jsonb_array_elements(v_publication.qualifiers) as qualifier(value)
      where qualifier.value ->> 'entryId' = standing.value ->> 'entryId'
    )
    order by standing.ordinality
  loop
    v_placements := v_placements || jsonb_build_array(jsonb_build_object(
      'entryId', (v_entry ->> 'entryId')::uuid,
      'placement', v_placement,
      'role', 'NON_QUALIFIER',
      'tied', false
    ));
    v_placement := v_placement + 1;
  end loop;

  if jsonb_array_length(v_placements) <> v_publication.roster_size
    or (
      select count(distinct placement.value ->> 'entryId')
      from jsonb_array_elements(v_placements) as placement(value)
    ) <> v_publication.roster_size then
    raise exception using errcode = '55000', message = 'Final placement must contain every member exactly once.';
  end if;

  return jsonb_build_object(
    'championEntryId', v_champion_id,
    'runnerUpEntryId', v_runner_up_id,
    'thirdPlaceEntryIds', to_jsonb(v_third_ids),
    'thirdPlaceTied', v_third_tied,
    'placements', v_placements,
    'terminalW17ResultVersionIds', to_jsonb(v_terminal_ids),
    'championshipResultVersionId', v_championship_outcome ->> 'resultVersionId',
    'thirdPlaceResultVersionId', v_third_result.id
  );
end;
$$;

revoke execute on function private.build_phase8b_champion_finality(uuid)
from public, anon, authenticated;

create or replace function private.append_phase8b_champion_publication(
  p_season_id uuid,
  p_actor_user_id uuid,
  p_correction_id uuid default null
)
returns private.playoff_publications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current private.playoff_publications%rowtype;
  v_created private.playoff_publications%rowtype;
  v_finality jsonb;
  v_hash text;
  v_terminal_ids uuid[];
  v_third_ids uuid[];
begin
  if (
    select count(*) from private.playoff_publications as candidate
    where candidate.season_id = p_season_id
      and not exists (
        select 1 from private.playoff_publications as successor
        where successor.supersedes_id = candidate.id
      )
  ) <> 1 then
    raise exception using errcode = '55000', message = 'The bracket lineage has no unambiguous terminal version.';
  end if;

  select publication.* into strict v_current
  from private.playoff_publications as publication
  where publication.season_id = p_season_id
    and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
    )
  for share;

  v_finality := private.build_phase8b_champion_finality(v_current.id);
  select array_agg(value::uuid order by ordinality)
  into v_terminal_ids
  from jsonb_array_elements_text(v_finality -> 'terminalW17ResultVersionIds')
    with ordinality as item(value, ordinality);
  select array_agg(value::uuid order by ordinality)
  into v_third_ids
  from jsonb_array_elements_text(v_finality -> 'thirdPlaceEntryIds')
    with ordinality as item(value, ordinality);

  v_hash := encode(extensions.digest(
    v_current.id::text || ':' || v_finality::text || ':'
    || coalesce(p_correction_id::text, 'INITIAL_CHAMPION_FINAL'),
    'sha256'
  ), 'hex');

  if v_current.publication_stage = 'CHAMPION_FINAL'
    and v_current.input_hash = v_hash then
    return v_current;
  end if;

  insert into private.playoff_publications (
    season_id, league_id, week14_standings_snapshot_id,
    ruleset_snapshot_id, roster_size, expected_qualifier_count,
    standings_json, qualifiers, bracket_json, bracket_state,
    source_result_version_ids, input_hash, created_by, version,
    supersedes_id, publication_stage, champion_entry_id,
    runner_up_entry_id, third_place_entry_ids, third_place_tied,
    final_placement_json, terminal_result_version_ids, correction_id,
    champion_finalized_at
  ) values (
    v_current.season_id, v_current.league_id,
    v_current.week14_standings_snapshot_id, v_current.ruleset_snapshot_id,
    v_current.roster_size, v_current.expected_qualifier_count,
    v_current.standings_json, v_current.qualifiers,
    v_current.bracket_json,
    v_current.bracket_state || jsonb_build_object('championFinality', v_finality),
    v_terminal_ids, v_hash, p_actor_user_id, v_current.version + 1,
    v_current.id, 'CHAMPION_FINAL',
    (v_finality ->> 'championEntryId')::uuid,
    (v_finality ->> 'runnerUpEntryId')::uuid,
    v_third_ids, (v_finality ->> 'thirdPlaceTied')::boolean,
    v_finality -> 'placements', v_terminal_ids, p_correction_id,
    clock_timestamp()
  ) returning * into strict v_created;

  return v_created;
end;
$$;

revoke execute on function private.append_phase8b_champion_publication(uuid, uuid, uuid)
from public, anon, authenticated;

create or replace function private.build_phase8b_postseason_round(
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
  v_games jsonb := '[]'::jsonb;
  v_participants uuid[] := '{}'::uuid[];
  v_side_a jsonb;
  v_side_b jsonb;
  v_index integer;
begin
  if p_nfl_week between 15 and 17 then
    return private.build_phase8_postseason_round(
      p_playoff_publication_id,
      p_nfl_week
    );
  end if;
  if p_nfl_week <> 18 then
    raise exception using errcode = '22023', message = 'Postseason publication supports Weeks 15 through 18.';
  end if;

  select publication.* into strict v_publication
  from private.playoff_publications as publication
  where publication.id = p_playoff_publication_id
    and publication.publication_stage = 'CHAMPION_FINAL'
    and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
    );

  if jsonb_array_length(v_publication.final_placement_json) <> v_publication.roster_size then
    raise exception using errcode = '55000', message = 'Week 18 requires complete final placement.';
  end if;

  for v_index in 0..(v_publication.roster_size / 2 - 1) loop
    v_side_a := v_publication.final_placement_json -> (v_index * 2);
    v_side_b := v_publication.final_placement_json -> (v_index * 2 + 1);
    v_games := v_games || jsonb_build_array(jsonb_build_object(
      'game', v_index + 1,
      'role', 'EXHIBITION',
      'label', 'Exhibition · final places '
        || (v_index * 2 + 1)::text || ' and ' || (v_index * 2 + 2)::text,
      'byeExhibition', false,
      'sideA', jsonb_build_object(
        'entryId', v_side_a ->> 'entryId',
        'regularSeasonSeed', (
          select standing.ordinality
          from jsonb_array_elements(v_publication.standings_json)
            with ordinality as standing(value, ordinality)
          where standing.value ->> 'entryId' = v_side_a ->> 'entryId'
        ),
        'qualificationSeed', private.playoff_qualification_seed(
          v_publication.id,
          (v_side_a ->> 'entryId')::uuid
        )
      ),
      'sideB', jsonb_build_object(
        'entryId', v_side_b ->> 'entryId',
        'regularSeasonSeed', (
          select standing.ordinality
          from jsonb_array_elements(v_publication.standings_json)
            with ordinality as standing(value, ordinality)
          where standing.value ->> 'entryId' = v_side_b ->> 'entryId'
        ),
        'qualificationSeed', private.playoff_qualification_seed(
          v_publication.id,
          (v_side_b ->> 'entryId')::uuid
        )
      )
    ));
    v_participants := v_participants || array[
      (v_side_a ->> 'entryId')::uuid,
      (v_side_b ->> 'entryId')::uuid
    ];
  end loop;

  if cardinality(v_participants) <> v_publication.roster_size
    or (select count(distinct entry_id) from unnest(v_participants) as entry_id)
      <> v_publication.roster_size then
    raise exception using errcode = '55000', message = 'Every member must appear exactly once in Week 18.';
  end if;

  return jsonb_build_object(
    'week', 18,
    'stageScope', 'EXHIBITION',
    'games', v_games,
    'participantEntryIds', to_jsonb(v_participants),
    'sourceResultVersionIds', to_jsonb(v_publication.terminal_result_version_ids)
  );
end;
$$;

revoke execute on function private.build_phase8b_postseason_round(uuid, integer)
from public, anon, authenticated;

-- Generalize the reviewed provider publisher to Week 18 without introducing a
-- second round authority. The existing function continues to own all slate,
-- event, quote, round, matchup, and card inserts.
do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'api.publish_postseason_week(uuid,uuid,text[],text)'::regprocedure
  ) into strict v_definition;

  v_old := 'season.lifecycle = ''PLAYOFFS''';
  v_new := 'season.lifecycle in (''PLAYOFFS'', ''CHAMPION_FINAL'', ''WEEK_18_EXHIBITION'', ''FINAL'')';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'publish_postseason_week lifecycle guard changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'elsif v_latest_week.nfl_week between 15 and 17 then';
  v_new := 'elsif v_latest_week.nfl_week between 15 and 18 then';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'publish_postseason_week week selector changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := E'if v_prior_round.playoff_publication_id <> v_publication.id then\n        raise exception using errcode = ''55000'', message = ''A finalized postseason round cannot be rebuilt from corrected qualification.'';\n      end if;\n      if v_latest_week.nfl_week >= 17 then\n        raise exception using errcode = ''55000'', message = ''No additional Phase 8A postseason week can publish.'';\n      end if;';
  v_new := E'if v_latest_week.nfl_week < 17 and v_prior_round.playoff_publication_id <> v_publication.id then\n        raise exception using errcode = ''55000'', message = ''A finalized competitive postseason round cannot be rebuilt from corrected qualification.'';\n      end if;\n      if v_latest_week.nfl_week >= 18 then\n        raise exception using errcode = ''55000'', message = ''No postseason week exists after Week 18.'';\n      end if;';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'publish_postseason_week finalized guard changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'if private.is_week_card_sealed(v_latest_week.id) then';
  v_new := E'if (v_latest_week.nfl_week = 18 and not private.is_week18_pairing_replaceable(v_prior_round.id))\n        or (v_latest_week.nfl_week <> 18 and private.is_week_card_sealed(v_latest_week.id)) then';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'publish_postseason_week replacement guard changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'v_round := private.build_phase8_postseason_round(v_publication.id, v_next_week);';
  v_new := 'v_round := private.build_phase8b_postseason_round(v_publication.id, v_next_week);';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'publish_postseason_week builder call changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := E'  v_response := jsonb_build_object(\n    ''leagueId'', p_league_id';
  v_new := E'  if v_next_week = 18 then\n    update private.seasons\n    set lifecycle = ''WEEK_18_EXHIBITION''\n    where id = v_season.id and lifecycle = ''CHAMPION_FINAL'';\n  end if;\n\n  v_response := jsonb_build_object(\n    ''leagueId'', p_league_id';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'publish_postseason_week response boundary changed; migration refused';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

-- The ordinary card and week machinery remains authoritative for Week 18.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_old constant text := 'season.lifecycle in (''REGULAR'', ''PLAYOFFS'')';
  v_new constant text := 'season.lifecycle in (''REGULAR'', ''PLAYOFFS'', ''CHAMPION_FINAL'', ''WEEK_18_EXHIBITION'')';
begin
  foreach v_signature in array array[
    'api.accept_stage1_card(text,jsonb,text)'::regprocedure,
    'api.lock_stage1_week(uuid,text)'::regprocedure,
    'api.import_live_scores(uuid,jsonb,text)'::regprocedure,
    'api.finalize_stage1_week(uuid,text)'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into strict v_definition;
    if strpos(v_definition, v_old) = 0 then
      raise exception '% lifecycle guard changed; migration refused', v_signature;
    end if;
    execute replace(v_definition, v_old, v_new);
  end loop;
end;
$migration$;

create or replace function api.finalize_champion_bracket(
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
  v_week17 private.season_weeks%rowtype;
  v_publication private.playoff_publications%rowtype;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
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
    and season.mode = 'LIVE'
    and season.lifecycle in (
      'PLAYOFFS', 'CHAMPION_FINAL', 'WEEK_18_EXHIBITION', 'FINAL'
    )
  order by season.created_at desc, season.id desc
  limit 1 for update;
  select week.* into strict v_week17
  from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = 17
  for share;

  if v_week17.state <> 'FINAL'
    or v_week17.correction_window_closes_at is null
    or private.stage1_season_time(v_season.id) < v_week17.correction_window_closes_at then
    raise exception using errcode = '55000', message = 'Week 17 must be final and its correction window closed before champion finality.';
  end if;
  perform private.assert_phase8_terminal_lineage(v_season.id);

  v_request_hash := encode(extensions.digest(
    p_league_id::text || ':' || v_season.id::text || ':CHAMPION_FINAL',
    'sha256'
  ), 'hex');
  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'FINALIZE_CHAMPION_BRACKET'
    and command.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;
  if v_season.lifecycle <> 'PLAYOFFS' then
    raise exception using errcode = '55000', message = 'Champion finality requires the Week 17 playoff state.';
  end if;

  v_publication := private.append_phase8b_champion_publication(
    v_season.id,
    v_user_id,
    null
  );
  update private.seasons set lifecycle = 'CHAMPION_FINAL'
  where id = v_season.id and lifecycle = 'PLAYOFFS';

  v_response := jsonb_build_object(
    'leagueId', p_league_id,
    'seasonId', v_season.id,
    'lifecycle', 'CHAMPION_FINAL',
    'publicationId', v_publication.id,
    'version', v_publication.version,
    'championEntryId', v_publication.champion_entry_id,
    'runnerUpEntryId', v_publication.runner_up_entry_id,
    'thirdPlaceEntryIds', to_jsonb(v_publication.third_place_entry_ids),
    'thirdPlaceTied', v_publication.third_place_tied,
    'archiveComplete', false,
    'finalizedAt', v_publication.champion_finalized_at
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'FINALIZE_CHAMPION_BRACKET',
    p_idempotency_key, v_request_hash, v_response
  );
  return v_response;
end;
$$;

create or replace function api.publish_week18_exhibition(
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
  v_result jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  v_result := api.publish_postseason_week(
    p_league_id,
    p_import_id,
    p_external_event_ids,
    p_idempotency_key
  );
  if (v_result ->> 'week')::integer <> 18 then
    raise exception using errcode = '55000', message = 'Week 18 can publish only after champion finality.';
  end if;
  select season.* into strict v_season
  from private.seasons as season
  where season.id = (v_result ->> 'seasonId')::uuid
    and season.league_id = p_league_id
    and season.mode = 'LIVE'
    and season.lifecycle = 'WEEK_18_EXHIBITION'
  for share;
  return v_result || jsonb_build_object(
    'lifecycle', 'WEEK_18_EXHIBITION',
    'championEntryId', (
      select publication.champion_entry_id
      from private.playoff_publications as publication
      where publication.season_id = v_season.id
        and not exists (
          select 1 from private.playoff_publications as successor
          where successor.supersedes_id = publication.id
        )
    ),
    'pairingReplaceable', true
  );
end;
$$;

revoke all on function api.finalize_champion_bracket(uuid, text)
from public, anon;
grant execute on function api.finalize_champion_bracket(uuid, text)
to authenticated;
revoke all on function api.publish_week18_exhibition(uuid, uuid, text[], text)
from public, anon;
grant execute on function api.publish_week18_exhibition(uuid, uuid, text[], text)
to authenticated;

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

  v_round := private.build_phase8b_postseason_round(
    p_playoff_publication_id,
    18
  );
  select string_agg(
    game.value #>> '{sideA,entryId}' || ':' || game.value #>> '{sideB,entryId}',
    ',' order by game.ordinality
  ) into v_current_order
  from jsonb_array_elements(v_current.matchups_json)
    with ordinality as game(value, ordinality);
  select string_agg(
    game.value #>> '{sideA,entryId}' || ':' || game.value #>> '{sideB,entryId}',
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

create or replace function private.build_season_archive_v2(
  p_season_id uuid,
  p_terminal_bracket_publication_id uuid,
  p_effective_w18_round_publication_id uuid,
  p_archive_version integer,
  p_supersedes_archive_id uuid,
  p_correction_id uuid,
  p_published_at timestamptz
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_season private.seasons%rowtype;
  v_league private.leagues%rowtype;
  v_ruleset private.season_ruleset_snapshots%rowtype;
  v_schedule private.schedule_publications%rowtype;
  v_bracket private.playoff_publications%rowtype;
  v_w18_round private.playoff_round_publications%rowtype;
  v_members jsonb;
  v_schedule_matchups jsonb;
  v_regular_weeks jsonb;
  v_playoff_games jsonb;
  v_week18_games jsonb;
  v_qualification_lineage jsonb;
  v_champion_lineage jsonb;
  v_corrections jsonb;
begin
  select season.* into strict v_season
  from private.seasons as season where season.id = p_season_id;
  select league.* into strict v_league
  from private.leagues as league where league.id = v_season.league_id;
  select ruleset.* into strict v_ruleset
  from private.season_ruleset_snapshots as ruleset
  where ruleset.id = v_season.ruleset_snapshot_id;
  select publication.* into strict v_schedule
  from private.schedule_publications as publication
  where publication.season_id = v_season.id
  order by publication.version desc limit 1;
  select publication.* into strict v_bracket
  from private.playoff_publications as publication
  where publication.id = p_terminal_bracket_publication_id
    and publication.season_id = v_season.id
    and publication.publication_stage = 'CHAMPION_FINAL';
  select round.* into strict v_w18_round
  from private.playoff_round_publications as round
  where round.id = p_effective_w18_round_publication_id
    and round.season_id = v_season.id
    and round.nfl_week = 18;

  select jsonb_agg(jsonb_build_object(
    'entryId', entry.id,
    'displayName', profile.display_name,
    'initials', upper(left(regexp_replace(profile.display_name, '[^[:alnum:]]', '', 'g'), 2)),
    'deterministicTiebreak', entry.standing_tiebreak
  ) order by profile.display_name, entry.id)
  into v_members
  from private.season_entries as entry
  join private.profiles as profile on profile.id = entry.user_id
  where entry.season_id = v_season.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'week', week.nfl_week,
    'sideAEntryId', matchup.side_a_entry_id,
    'sideBEntryId', matchup.side_b_entry_id
  ) order by week.nfl_week, matchup.display_order), '[]'::jsonb)
  into v_schedule_matchups
  from private.matchups as matchup
  join private.season_weeks as week on week.id = matchup.week_id
  where matchup.season_id = v_season.id and matchup.scope = 'REGULAR';

  select coalesce(jsonb_agg(jsonb_build_object(
    'week', week.nfl_week,
    'matchups', (
      select coalesce(jsonb_agg(
        private.live_archive_matchup(matchup.id, v_bracket.id)
        order by matchup.display_order
      ), '[]'::jsonb)
      from private.matchups as matchup
      where matchup.week_id = week.id
        and private.is_effective_postseason_matchup(matchup.id)
    ),
    'standings', (
      select private.live_archive_standings(snapshot.ordered_rows)
      from private.standings_snapshots as snapshot
      where snapshot.week_id = week.id and snapshot.status = 'FINAL'
        and not exists (
          select 1 from private.standings_snapshots as successor
          where successor.supersedes_id = snapshot.id
        )
    )
  ) order by week.nfl_week), '[]'::jsonb)
  into v_regular_weeks
  from private.season_weeks as week
  where week.season_id = v_season.id
    and week.scope = 'REGULAR'
    and week.nfl_week between 1 and 14;

  select coalesce(jsonb_agg(
    private.live_archive_matchup(matchup.id, v_bracket.id)
    order by round.nfl_week, matchup.display_order
  ), '[]'::jsonb)
  into v_playoff_games
  from private.playoff_round_publications as round
  join private.matchups as matchup
    on matchup.playoff_round_publication_id = round.id
  where round.season_id = v_season.id
    and round.nfl_week between 15 and 17
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    );

  select coalesce(jsonb_agg(
    private.live_archive_matchup(matchup.id, v_bracket.id)
    order by matchup.display_order
  ), '[]'::jsonb)
  into v_week18_games
  from private.matchups as matchup
  where matchup.playoff_round_publication_id = v_w18_round.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', publication.id,
    'version', publication.version,
    'supersedesId', publication.supersedes_id,
    'publishedAt', publication.published_at,
    'sourceResultVersionIds', to_jsonb(publication.source_result_version_ids)
  ) order by publication.version), '[]'::jsonb)
  into v_qualification_lineage
  from private.playoff_publications as publication
  where publication.season_id = v_season.id
    and publication.publication_stage = 'QUALIFICATION';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', publication.id,
    'version', publication.version,
    'supersedesId', publication.supersedes_id,
    'championEntryId', publication.champion_entry_id,
    'runnerUpEntryId', publication.runner_up_entry_id,
    'thirdPlaceEntryIds', to_jsonb(publication.third_place_entry_ids),
    'thirdPlaceTied', publication.third_place_tied,
    'terminalResultVersionIds', to_jsonb(publication.terminal_result_version_ids),
    'correctionId', publication.correction_id,
    'finalizedAt', publication.champion_finalized_at
  ) order by publication.version), '[]'::jsonb)
  into v_champion_lineage
  from private.playoff_publications as publication
  where publication.season_id = v_season.id
    and publication.publication_stage = 'CHAMPION_FINAL';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', correction.id,
    'week', week.nfl_week,
    'eventId', correction.event_id,
    'originalResultVersionId', correction.original_result_version_id,
    'correctedResultVersionId', correction.corrected_result_version_id,
    'reason', correction.reason,
    'recordedAt', correction.created_at
  ) order by correction.created_at, correction.id), '[]'::jsonb)
  into v_corrections
  from private.corrections as correction
  join private.season_weeks as week on week.id = correction.week_id
  where week.season_id = v_season.id;

  return jsonb_build_object(
    'schemaVersion', 2,
    'mode', 'LIVE',
    'seasonLabel', v_league.name,
    'nflYear', v_season.nfl_year,
    'generatedAt', p_published_at,
    'ruleset', jsonb_build_object(
      'id', v_ruleset.ruleset_id,
      'version', v_ruleset.ruleset_version,
      'playoffIneligibilityAtMisses', 3
    ),
    'members', v_members,
    'schedule', jsonb_build_object(
      'algorithmVersion', v_schedule.algorithm_version,
      'seed', v_schedule.seed,
      'orderedEntryIds', to_jsonb(v_schedule.ordered_entry_ids),
      'matchups', v_schedule_matchups,
      'outputHash', v_schedule.output_hash
    ),
    'regularSeason', jsonb_build_object(
      'weeks', v_regular_weeks,
      'finalStandings', private.live_archive_standings(v_bracket.standings_json)
    ),
    'qualification', jsonb_build_object(
      'expectedQualifierCount', v_bracket.expected_qualifier_count,
      'actualQualifierCount', jsonb_array_length(v_bracket.qualifiers),
      'qualifiers', v_bracket.qualifiers,
      'frozenWeek14Standings', v_bracket.standings_json,
      'lineage', v_qualification_lineage
    ),
    'playoffs', jsonb_build_object(
      'qualifierCount', jsonb_array_length(v_bracket.qualifiers),
      'qualifiers', v_bracket.qualifiers,
      'games', v_playoff_games,
      'championEntryId', v_bracket.champion_entry_id,
      'runnerUpEntryId', v_bracket.runner_up_entry_id,
      'thirdPlaceEntryId', case when v_bracket.third_place_tied
        then null else v_bracket.third_place_entry_ids[1] end,
      'thirdPlaceEntryIds', to_jsonb(v_bracket.third_place_entry_ids),
      'thirdPlaceTied', v_bracket.third_place_tied,
      'finalPlacement', v_bracket.final_placement_json,
      'championLineage', v_champion_lineage
    ),
    'week18', v_week18_games,
    'corrections', v_corrections,
    'integrity', jsonb_build_object(
      'rulesetSnapshotId', v_ruleset.id,
      'schedulePublicationId', v_schedule.id,
      'terminalBracketPublicationId', v_bracket.id,
      'terminalW17ResultVersionIds', to_jsonb(v_bracket.terminal_result_version_ids),
      'effectiveW18RoundPublicationId', v_w18_round.id,
      'effectiveW18RoundVersion', v_w18_round.version,
      'terminalW18ResultVersionIds', (
        select jsonb_agg(result.id order by matchup.display_order)
        from private.matchups as matchup
        join private.matchup_result_versions as result
          on result.matchup_id = matchup.id
         and result.status = 'FINAL'
         and not exists (
           select 1 from private.matchup_result_versions as successor
           where successor.supersedes_id = result.id
         )
        where matchup.playoff_round_publication_id = v_w18_round.id
      ),
      'archiveVersion', p_archive_version,
      'supersedesArchiveId', p_supersedes_archive_id,
      'correctionId', p_correction_id,
      'positionReceiptCount', (
        select count(*) from private.position_receipts as receipt
        join private.weekly_cards as card on card.id = receipt.card_id
        where card.season_id = v_season.id
      ),
      'correctionCount', jsonb_array_length(v_corrections)
    )
  );
end;
$$;

revoke execute on function private.build_season_archive_v2(uuid, uuid, uuid, integer, uuid, uuid, timestamptz)
from public, anon, authenticated;

create or replace function private.append_phase8b_archive(
  p_season_id uuid,
  p_actor_user_id uuid,
  p_correction_id uuid default null
)
returns private.season_archive_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season private.seasons%rowtype;
  v_bracket private.playoff_publications%rowtype;
  v_round private.playoff_round_publications%rowtype;
  v_week18 private.season_weeks%rowtype;
  v_schedule private.schedule_publications%rowtype;
  v_previous private.season_archive_versions%rowtype;
  v_created private.season_archive_versions%rowtype;
  v_championship_result_id uuid;
  v_third_result_id uuid;
  v_w18_result_ids uuid[];
  v_archive_json jsonb;
  v_archive_hash text;
  v_version integer;
  v_published_at timestamptz := clock_timestamp();
begin
  select season.* into strict v_season
  from private.seasons as season
  where season.id = p_season_id and season.mode = 'LIVE'
  for update;
  perform private.assert_phase8_terminal_lineage(v_season.id);

  select publication.* into strict v_bracket
  from private.playoff_publications as publication
  where publication.season_id = v_season.id
    and publication.publication_stage = 'CHAMPION_FINAL'
    and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
    ) for share;
  select round.* into strict v_round
  from private.playoff_round_publications as round
  where round.season_id = v_season.id and round.nfl_week = 18
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    ) for share;
  select week.* into strict v_week18
  from private.season_weeks as week
  where week.id = v_round.week_id for share;

  if v_week18.state <> 'FINAL' then
    raise exception using errcode = '55000', message = 'Week 18 must be final before the complete archive can publish.';
  end if;
  if exists (
    select 1 from private.weekly_cards as card
    where card.week_id = v_week18.id
      and not exists (
        select 1 from private.weekly_score_versions as score
        where score.card_id = card.id and score.status = 'FINAL'
          and not exists (
            select 1 from private.weekly_score_versions as successor
            where successor.supersedes_id = score.id
          )
      )
  ) then
    raise exception using errcode = '55000', message = 'Every Week 18 card requires one terminal final score.';
  end if;
  if exists (
    select 1 from private.matchups as matchup
    where matchup.playoff_round_publication_id = v_round.id
      and not exists (
        select 1 from private.matchup_result_versions as result
        where result.matchup_id = matchup.id and result.status = 'FINAL'
          and not exists (
            select 1 from private.matchup_result_versions as successor
            where successor.supersedes_id = result.id
          )
      )
  ) then
    raise exception using errcode = '55000', message = 'Every Week 18 exhibition requires one terminal final result.';
  end if;
  if exists (
    select 1 from private.position_receipts as receipt
    join private.weekly_cards as card on card.id = receipt.card_id
    where card.week_id = v_week18.id
      and not exists (
        select 1 from private.settlement_versions as settlement
        where settlement.receipt_id = receipt.id
          and not exists (
            select 1 from private.settlement_versions as successor
            where successor.supersedes_id = settlement.id
          )
      )
  ) then
    raise exception using errcode = '55000', message = 'Every Week 18 receipt requires terminal settlement.';
  end if;

  select array_agg(result.id order by matchup.display_order)
  into v_w18_result_ids
  from private.matchups as matchup
  join private.matchup_result_versions as result
    on result.matchup_id = matchup.id
   and result.status = 'FINAL'
   and not exists (
     select 1 from private.matchup_result_versions as successor
     where successor.supersedes_id = result.id
   )
  where matchup.playoff_round_publication_id = v_round.id;
  select publication.* into strict v_schedule
  from private.schedule_publications as publication
  where publication.season_id = v_season.id
  order by publication.version desc limit 1;
  select archive.* into v_previous
  from private.season_archive_versions as archive
  where archive.season_id = v_season.id
    and not exists (
      select 1 from private.season_archive_versions as successor
      where successor.supersedes_id = archive.id
    ) for share;

  v_version := coalesce(v_previous.version, 0) + 1;
  v_championship_result_id := (
    v_bracket.bracket_state #>> '{championFinality,championshipResultVersionId}'
  )::uuid;
  v_third_result_id := (
    v_bracket.bracket_state #>> '{championFinality,thirdPlaceResultVersionId}'
  )::uuid;
  v_archive_json := private.build_season_archive_v2(
    v_season.id, v_bracket.id, v_round.id, v_version,
    v_previous.id, p_correction_id, v_published_at
  );
  if jsonb_array_length(v_archive_json #> '{regularSeason,weeks}') <> 14
    or jsonb_array_length(v_archive_json -> 'week18')
      <> v_bracket.roster_size / 2
    or jsonb_array_length(v_archive_json #> '{playoffs,finalPlacement}')
      <> v_bracket.roster_size then
    raise exception using errcode = '55000', message = 'The derived final archive is incomplete.';
  end if;
  v_archive_hash := encode(extensions.digest(v_archive_json::text, 'sha256'), 'hex');

  insert into private.season_archive_versions (
    season_id, league_id, ruleset_snapshot_id, schedule_publication_id,
    terminal_bracket_publication_id, championship_result_version_id,
    third_place_result_version_id, champion_entry_id, runner_up_entry_id,
    third_place_entry_id, third_place_tied, archive_hash, archive_json,
    published_by, published_at, archive_schema_version, version,
    supersedes_id, terminal_w17_result_version_ids,
    effective_w18_round_publication_id, effective_w18_nfl_week,
    terminal_w18_result_version_ids, correction_id
  ) values (
    v_season.id, v_season.league_id, v_season.ruleset_snapshot_id,
    v_schedule.id, v_bracket.id, v_championship_result_id,
    v_third_result_id, v_bracket.champion_entry_id,
    v_bracket.runner_up_entry_id,
    case when v_bracket.third_place_tied then null
      else v_bracket.third_place_entry_ids[1] end,
    v_bracket.third_place_tied, v_archive_hash, v_archive_json,
    p_actor_user_id, v_published_at, 2, v_version, v_previous.id,
    v_bracket.terminal_result_version_ids, v_round.id, 18,
    v_w18_result_ids, p_correction_id
  ) returning * into strict v_created;
  return v_created;
end;
$$;

revoke execute on function private.append_phase8b_archive(uuid, uuid, uuid)
from public, anon, authenticated;

create or replace function api.finalize_season_archive(
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
  v_archive private.season_archive_versions%rowtype;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
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
    and season.mode = 'LIVE'
    and season.lifecycle in (
      'PLAYOFFS', 'CHAMPION_FINAL', 'WEEK_18_EXHIBITION', 'FINAL'
    )
  order by season.created_at desc, season.id desc
  limit 1 for update;
  v_request_hash := encode(extensions.digest(
    p_league_id::text || ':' || v_season.id::text || ':FINAL_ARCHIVE',
    'sha256'
  ), 'hex');
  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'FINALIZE_SEASON_ARCHIVE'
    and command.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;
  if v_season.lifecycle <> 'WEEK_18_EXHIBITION' then
    raise exception using errcode = '55000', message = 'Week 18 must be final before the complete archive can publish.';
  end if;

  v_archive := private.append_phase8b_archive(v_season.id, v_user_id, null);
  update private.seasons set lifecycle = 'FINAL'
  where id = v_season.id and lifecycle = 'WEEK_18_EXHIBITION';

  v_response := jsonb_build_object(
    'archiveId', v_archive.id,
    'archiveVersion', v_archive.version,
    'supersedesId', v_archive.supersedes_id,
    'seasonId', v_archive.season_id,
    'leagueId', v_archive.league_id,
    'lifecycle', 'FINAL',
    'archiveHash', v_archive.archive_hash,
    'championEntryId', v_archive.champion_entry_id,
    'runnerUpEntryId', v_archive.runner_up_entry_id,
    'thirdPlaceEntryId', v_archive.third_place_entry_id,
    'thirdPlaceTied', v_archive.third_place_tied,
    'publishedAt', v_archive.published_at
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'FINALIZE_SEASON_ARCHIVE',
    p_idempotency_key, v_request_hash, v_response
  );
  return v_response;
end;
$$;

-- Compatibility name only. Publication still derives exclusively from stored
-- Week 18 facts and cannot close a season from Week 17.
create or replace function api.publish_live_season_archive(
  p_league_id uuid,
  p_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select api.finalize_season_archive(p_league_id, p_idempotency_key);
$$;

revoke all on function api.finalize_season_archive(uuid, text)
from public, anon;
grant execute on function api.finalize_season_archive(uuid, text)
to authenticated;
revoke all on function api.publish_live_season_archive(uuid, text)
from public, anon;
grant execute on function api.publish_live_season_archive(uuid, text)
to authenticated;

-- A finalized week stays FINAL while late-correction recomputation appends new
-- projections. The ordinary provisional path remains unchanged.
do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(
    'private.recompute_stage1_week(uuid,uuid)'::regprocedure
  ) into strict v_definition;
  v_old := 'if v_matchup_count > 0 and v_completed_matchup_count = v_matchup_count then';
  v_new := 'if v_week.nfl_week <> 18 and v_matchup_count > 0 and v_completed_matchup_count = v_matchup_count then';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'recompute_stage1_week standings guard changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'if v_all_events_complete and v_matchup_count = v_completed_matchup_count then';
  v_new := 'if v_week.state <> ''FINAL'' and v_all_events_complete and v_matchup_count = v_completed_matchup_count then';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'recompute_stage1_week terminal guard changed; migration refused';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

create or replace function private.finalize_late_week_versions(p_week_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_score private.weekly_score_versions%rowtype;
  v_matchup private.matchup_result_versions%rowtype;
  v_side_a_score_id uuid;
  v_side_b_score_id uuid;
  v_hash text;
begin
  for v_score in
    select score.*
    from private.weekly_score_versions as score
    where score.week_id = p_week_id
      and score.status = 'PROVISIONAL'
      and not exists (
        select 1 from private.weekly_score_versions as successor
        where successor.supersedes_id = score.id
      )
    order by score.card_id
  loop
    v_hash := encode(extensions.digest(
      v_score.input_hash || ':LATE_FINAL', 'sha256'
    ), 'hex');
    insert into private.weekly_score_versions (
      card_id, week_id, league_id, entry_id, input_hash, compliance,
      score_centicredits, is_complete, status, supersedes_id
    ) values (
      v_score.card_id, v_score.week_id, v_score.league_id,
      v_score.entry_id, v_hash, v_score.compliance,
      v_score.score_centicredits, v_score.is_complete, 'FINAL', v_score.id
    );
  end loop;

  for v_matchup in
    select result.*
    from private.matchup_result_versions as result
    where result.week_id = p_week_id
      and result.status = 'PROVISIONAL'
      and not exists (
        select 1 from private.matchup_result_versions as successor
        where successor.supersedes_id = result.id
      )
    order by result.matchup_id
  loop
    select score.id into strict v_side_a_score_id
    from private.weekly_score_versions as score
    join private.matchups as matchup
      on matchup.id = v_matchup.matchup_id
     and matchup.side_a_entry_id = score.entry_id
    where score.week_id = p_week_id
      and score.status = 'FINAL'
      and not exists (
        select 1 from private.weekly_score_versions as successor
        where successor.supersedes_id = score.id
      );
    select score.id into strict v_side_b_score_id
    from private.weekly_score_versions as score
    join private.matchups as matchup
      on matchup.id = v_matchup.matchup_id
     and matchup.side_b_entry_id = score.entry_id
    where score.week_id = p_week_id
      and score.status = 'FINAL'
      and not exists (
        select 1 from private.weekly_score_versions as successor
        where successor.supersedes_id = score.id
      );
    v_hash := encode(extensions.digest(
      v_matchup.input_hash || ':LATE_FINAL:' || v_side_a_score_id::text
      || ':' || v_side_b_score_id::text,
      'sha256'
    ), 'hex');
    insert into private.matchup_result_versions (
      matchup_id, week_id, league_id, side_a_score_version_id,
      side_b_score_version_id, side_a_decision, side_b_decision,
      side_a_points_for_centicredits, side_b_points_for_centicredits,
      input_hash, status, supersedes_id
    ) values (
      v_matchup.matchup_id, v_matchup.week_id, v_matchup.league_id,
      v_side_a_score_id, v_side_b_score_id, v_matchup.side_a_decision,
      v_matchup.side_b_decision,
      v_matchup.side_a_points_for_centicredits,
      v_matchup.side_b_points_for_centicredits,
      v_hash, 'FINAL', v_matchup.id
    );
  end loop;
end;
$$;

revoke execute on function private.finalize_late_week_versions(uuid)
from public, anon, authenticated;

create or replace function api.correct_finalized_week17_result(
  p_event_id uuid,
  p_status text,
  p_away_score integer,
  p_home_score integer,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_event private.sports_events%rowtype;
  v_week private.season_weeks%rowtype;
  v_season private.seasons%rowtype;
  v_previous_result private.event_result_versions%rowtype;
  v_previous_bracket private.playoff_publications%rowtype;
  v_new_bracket private.playoff_publications%rowtype;
  v_w18_round private.playoff_round_publications%rowtype;
  v_effective_w18_round private.playoff_round_publications%rowtype;
  v_archive private.season_archive_versions%rowtype;
  v_command private.command_receipts%rowtype;
  v_result_id uuid := gen_random_uuid();
  v_correction_id uuid := gen_random_uuid();
  v_result_version integer;
  v_request_hash text;
  v_input_hash text;
  v_before_summary jsonb;
  v_after_summary jsonb;
  v_response jsonb;
begin
  select event.* into strict v_event
  from private.sports_events as event
  where event.id = p_event_id for update;
  if v_user_id is null or not private.is_league_commissioner(v_event.league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  select week.* into strict v_week
  from private.season_weeks as week
  where week.id = v_event.week_id for share;
  select season.* into strict v_season
  from private.seasons as season
  where season.id = v_event.season_id
    and season.mode = 'LIVE'
    and season.lifecycle in (
      'CHAMPION_FINAL', 'WEEK_18_EXHIBITION', 'FINAL'
    ) for update;

  if v_week.nfl_week <> 17 or v_week.state <> 'FINAL' then
    raise exception using errcode = '55000', message = 'This command is limited to finalized Week 17 results.';
  end if;
  if upper(p_status) not in ('FINAL', 'VOID')
    or char_length(btrim(p_reason)) not between 10 and 500
    or (upper(p_status) = 'FINAL' and (
      p_away_score is null or p_home_score is null
      or p_away_score < 0 or p_home_score < 0
    ))
    or (upper(p_status) = 'VOID' and (
      p_away_score is not null or p_home_score is not null
    )) then
    raise exception using errcode = '22023', message = 'An objective result and visible reason are required.';
  end if;

  v_request_hash := encode(extensions.digest(
    p_event_id::text || ':' || upper(p_status) || ':'
      || coalesce(p_away_score::text, 'NULL') || ':'
      || coalesce(p_home_score::text, 'NULL') || ':' || btrim(p_reason),
    'sha256'
  ), 'hex');
  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'CORRECT_FINALIZED_WEEK17_RESULT'
    and command.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  select result.* into strict v_previous_result
  from private.event_result_versions as result
  where result.event_id = p_event_id
    and not exists (
      select 1 from private.event_result_versions as successor
      where successor.supersedes_id = result.id
    ) for share;
  if upper(p_status) = v_previous_result.status
    and p_away_score is not distinct from v_previous_result.away_score
    and p_home_score is not distinct from v_previous_result.home_score then
    raise exception using errcode = '22023', message = 'A correction must change the objective result.';
  end if;

  select publication.* into strict v_previous_bracket
  from private.playoff_publications as publication
  where publication.season_id = v_season.id
    and publication.publication_stage = 'CHAMPION_FINAL'
    and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
    ) for share;
  v_before_summary := jsonb_build_object(
    'eventResultVersionId', v_previous_result.id,
    'championPublicationId', v_previous_bracket.id,
    'championEntryId', v_previous_bracket.champion_entry_id
  );

  v_result_version := v_previous_result.version + 1;
  v_input_hash := encode(extensions.digest(
    v_request_hash || ':' || v_result_version::text,
    'sha256'
  ), 'hex');
  insert into private.event_result_versions (
    id, event_id, week_id, league_id, version, status, away_score,
    home_score, source, reason, recorded_by, supersedes_id, input_hash
  ) values (
    v_result_id, v_event.id, v_week.id, v_event.league_id,
    v_result_version, upper(p_status),
    case when upper(p_status) = 'FINAL' then p_away_score else null end,
    case when upper(p_status) = 'FINAL' then p_home_score else null end,
    'MANUAL_OBJECTIVE', btrim(p_reason), v_user_id,
    v_previous_result.id, v_input_hash
  );

  perform private.recompute_stage1_week(v_week.id, v_result_id);
  perform private.finalize_late_week_versions(v_week.id);

  v_after_summary := jsonb_build_object(
    'eventResultVersionId', v_result_id,
    'weekState', 'FINAL'
  );
  insert into private.corrections (
    id, league_id, week_id, event_id, original_result_version_id,
    corrected_result_version_id, reason, actor_user_id,
    before_summary, after_summary
  ) values (
    v_correction_id, v_event.league_id, v_week.id, v_event.id,
    v_previous_result.id, v_result_id, btrim(p_reason), v_user_id,
    v_before_summary, v_after_summary
  );

  v_new_bracket := private.append_phase8b_champion_publication(
    v_season.id,
    v_user_id,
    v_correction_id
  );

  select round.* into v_w18_round
  from private.playoff_round_publications as round
  where round.season_id = v_season.id and round.nfl_week = 18
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    ) for share;
  if v_w18_round.id is not null then
    v_effective_w18_round := private.rebuild_week18_round_after_correction(
      v_season.id,
      v_new_bracket.id,
      v_user_id
    );
  end if;

  if v_season.lifecycle = 'FINAL' then
    v_archive := private.append_phase8b_archive(
      v_season.id,
      v_user_id,
      v_correction_id
    );
  end if;

  perform private.assert_phase8_terminal_lineage(v_season.id);
  v_response := jsonb_build_object(
    'eventId', v_event.id,
    'resultVersionId', v_result_id,
    'version', v_result_version,
    'correctionId', v_correction_id,
    'championPublicationId', v_new_bracket.id,
    'championVersion', v_new_bracket.version,
    'previousChampionEntryId', v_previous_bracket.champion_entry_id,
    'championEntryId', v_new_bracket.champion_entry_id,
    'week18RoundId', v_effective_w18_round.id,
    'week18RoundVersion', v_effective_w18_round.version,
    'week18PairingSuperseded', v_effective_w18_round.id is distinct from v_w18_round.id,
    'week18PairingReplaceable', case
      when v_effective_w18_round.id is null then null
      else private.is_week18_pairing_replaceable(v_effective_w18_round.id)
    end,
    'archiveId', v_archive.id,
    'archiveVersion', v_archive.version,
    'lifecycle', v_season.lifecycle
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key,
    request_hash, response_json
  ) values (
    v_event.league_id, v_user_id, 'CORRECT_FINALIZED_WEEK17_RESULT',
    p_idempotency_key, v_request_hash, v_response
  );
  return v_response;
end;
$$;

revoke all on function api.correct_finalized_week17_result(uuid, text, integer, integer, text, text)
from public, anon;
grant execute on function api.correct_finalized_week17_result(uuid, text, integer, integer, text, text)
to authenticated;

create or replace function api.get_season_archive(p_league_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_league private.leagues%rowtype;
  v_archive private.season_archive_versions%rowtype;
  v_viewer_entry_id uuid;
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

  if exists (
    select 1 from private.season_archive_versions as child
    join private.season_archive_versions as parent
      on parent.id = child.supersedes_id
    where child.league_id = v_league.id
      and parent.season_id <> child.season_id
  ) or exists (
    select 1 from private.season_archive_versions as candidate
    where candidate.league_id = v_league.id
      and not exists (
        select 1 from private.season_archive_versions as successor
        where successor.supersedes_id = candidate.id
      )
    group by candidate.season_id having count(*) > 1
  ) then
    raise exception using errcode = '55000', message = 'The final archive has competing terminal versions.';
  end if;

  select archive.* into v_archive
  from private.season_archive_versions as archive
  where archive.league_id = v_league.id
    and not exists (
      select 1 from private.season_archive_versions as successor
      where successor.supersedes_id = archive.id
    )
  order by archive.published_at desc, archive.id desc
  limit 1;
  if not found then return null; end if;

  select entry.id into strict v_viewer_entry_id
  from private.season_entries as entry
  where entry.season_id = v_archive.season_id
    and entry.user_id = v_user_id;

  -- schemaVersion 1 documents are returned byte-for-byte with only the same
  -- viewer/envelope metadata that the legacy read path already supplied.
  return v_archive.archive_json || jsonb_build_object(
    'viewerEntryId', v_viewer_entry_id,
    'archiveId', v_archive.id,
    'archiveHash', v_archive.archive_hash,
    'archiveVersion', v_archive.version,
    'supersedesArchiveId', v_archive.supersedes_id,
    'correctionId', v_archive.correction_id,
    'publishedAt', v_archive.published_at
  );
end;
$$;

revoke all on function api.get_season_archive(text) from public, anon;
grant execute on function api.get_season_archive(text) to authenticated;

-- Retired caller-authored Simulation archive endpoints remain unavailable.
revoke all on function api.publish_simulation_season_archive(uuid, jsonb, text)
from public, anon, authenticated;
revoke all on function api.get_simulation_season_archive(text)
from public, anon, authenticated;
revoke all on table private.simulation_season_archives
from public, anon, authenticated;

create or replace function api.get_playoff_state(p_league_slug text)
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
  order by season.created_at desc, season.id desc limit 1;

  if (
    select count(*) from private.playoff_publications as candidate
    where candidate.season_id = v_season.id
      and not exists (
        select 1 from private.playoff_publications as successor
        where successor.supersedes_id = candidate.id
      )
  ) > 1 then
    raise exception using errcode = '55000', message = 'The bracket lineage has competing terminal versions.';
  end if;
  select publication.* into v_publication
  from private.playoff_publications as publication
  where publication.season_id = v_season.id
    and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
    );
  if v_publication.id is null then return null; end if;

  if exists (
    select 1 from private.playoff_round_publications as candidate
    where candidate.season_id = v_season.id
      and not exists (
        select 1 from private.playoff_round_publications as successor
        where successor.supersedes_id = candidate.id
      )
    group by candidate.nfl_week having count(*) > 1
  ) then
    raise exception using errcode = '55000', message = 'A postseason week has competing terminal round versions.';
  end if;

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
      'version', v_publication.version,
      'supersedesId', v_publication.supersedes_id,
      'stage', v_publication.publication_stage,
      'publishedAt', v_publication.published_at,
      'inputHash', v_publication.input_hash,
      'sourceResultVersionIds', to_jsonb(v_publication.source_result_version_ids),
      'rosterSize', v_publication.roster_size,
      'expectedQualifierCount', v_publication.expected_qualifier_count,
      'actualQualifierCount', jsonb_array_length(v_publication.qualifiers),
      'standings', v_publication.standings_json,
      'qualifiers', v_publication.qualifiers,
      'bracket', coalesce(v_publication.bracket_state, v_publication.bracket_json),
      'legacy', v_publication.bracket_state is null,
      'tieRule', 'Higher qualification seed advances an exact championship tie or dual incompletion',
      'attendanceMissLimit', 3,
      'championFinality', case
        when v_publication.publication_stage <> 'CHAMPION_FINAL' then null
        else jsonb_build_object(
          'championEntryId', v_publication.champion_entry_id,
          'runnerUpEntryId', v_publication.runner_up_entry_id,
          'thirdPlaceEntryIds', to_jsonb(v_publication.third_place_entry_ids),
          'thirdPlaceTied', v_publication.third_place_tied,
          'finalPlacement', v_publication.final_placement_json,
          'terminalResultVersionIds', to_jsonb(v_publication.terminal_result_version_ids),
          'finalizedAt', v_publication.champion_finalized_at
        ) end,
      'championLineage', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', version.id,
          'version', version.version,
          'supersedesId', version.supersedes_id,
          'championEntryId', version.champion_entry_id,
          'runnerUpEntryId', version.runner_up_entry_id,
          'thirdPlaceEntryIds', to_jsonb(version.third_place_entry_ids),
          'thirdPlaceTied', version.third_place_tied,
          'correctionId', version.correction_id,
          'finalizedAt', version.champion_finalized_at,
          'effective', version.id = v_publication.id
        ) order by version.version)
        from private.playoff_publications as version
        where version.season_id = v_season.id
          and version.publication_stage = 'CHAMPION_FINAL'
      ), '[]'::jsonb),
      'correctionEvidence', jsonb_build_object(
        'effectiveVersion', v_publication.version,
        'supersedesVersionId', v_publication.supersedes_id,
        'priorVersionCount', v_publication.version - 1,
        'sourceResultVersionIds', to_jsonb(v_publication.source_result_version_ids)
      )
    ),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', round.id,
        'version', round.version,
        'supersedesId', round.supersedes_id,
        'week', round.nfl_week,
        'scope', round.stage_scope,
        'state', week.state,
        'commonLockAt', week.common_lock_at,
        'publishedAt', round.published_at,
        'inputHash', round.input_hash,
        'sourceResultVersionIds', to_jsonb(round.source_result_version_ids),
        'pairingReplaceable', case when round.nfl_week = 18
          then private.is_week18_pairing_replaceable(round.id) else null end,
        'matchups', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', matchup.id,
            'game', matchup.display_order,
            'role', matchup.postseason_role,
            'scope', matchup.scope,
            'label', round.matchups_json #>> array[
              (matchup.display_order - 1)::text,
              'label'
            ],
            'byeExhibition', coalesce((
              round.matchups_json #>> array[
                (matchup.display_order - 1)::text,
                'byeExhibition'
              ]
            )::boolean, false),
            'sideA', jsonb_build_object(
              'entryId', matchup.side_a_entry_id,
              'displayName', side_a_profile.display_name,
              'qualificationSeed', private.playoff_qualification_seed(
                v_publication.id,
                matchup.side_a_entry_id
              )
            ),
            'sideB', jsonb_build_object(
              'entryId', matchup.side_b_entry_id,
              'displayName', side_b_profile.display_name,
              'qualificationSeed', private.playoff_qualification_seed(
                v_publication.id,
                matchup.side_b_entry_id
              )
            ),
            'result', case when result.id is null then null else jsonb_build_object(
              'id', result.id,
              'status', result.status,
              'sideADecision', case
                when matchup.postseason_role <> 'CHAMPIONSHIP'
                  and (side_a_score.compliance = 'INCOMPLETE'
                    or side_b_score.compliance = 'INCOMPLETE') then null
                else result.side_a_decision end,
              'sideBDecision', case
                when matchup.postseason_role <> 'CHAMPIONSHIP'
                  and (side_a_score.compliance = 'INCOMPLETE'
                    or side_b_score.compliance = 'INCOMPLETE') then null
                else result.side_b_decision end,
              'sideAScoreCenticredits', result.side_a_points_for_centicredits,
              'sideBScoreCenticredits', result.side_b_points_for_centicredits,
              'sideAParticipation', case
                when matchup.postseason_role <> 'CHAMPIONSHIP'
                  and side_a_score.compliance = 'INCOMPLETE'
                  then 'EXHIBITION_MISS' else 'COMPLETED' end,
              'sideBParticipation', case
                when matchup.postseason_role <> 'CHAMPIONSHIP'
                  and side_b_score.compliance = 'INCOMPLETE'
                  then 'EXHIBITION_MISS' else 'COMPLETED' end,
              'advancingEntryId', case
                when result.status = 'FINAL'
                  and matchup.postseason_role = 'CHAMPIONSHIP'
                  then private.phase8_championship_outcome(
                    matchup.id,
                    v_publication.id
                  ) #>> '{winner,entryId}'
                else null end
            ) end
          ) order by matchup.display_order)
          from private.matchups as matchup
          join private.season_entries as side_a_entry
            on side_a_entry.id = matchup.side_a_entry_id
          join private.profiles as side_a_profile
            on side_a_profile.id = side_a_entry.user_id
          join private.season_entries as side_b_entry
            on side_b_entry.id = matchup.side_b_entry_id
          join private.profiles as side_b_profile
            on side_b_profile.id = side_b_entry.user_id
          left join lateral (
            select candidate.*
            from private.matchup_result_versions as candidate
            where candidate.matchup_id = matchup.id
              and not exists (
                select 1 from private.matchup_result_versions as successor
                where successor.supersedes_id = candidate.id
              )
          ) as result on true
          left join private.weekly_score_versions as side_a_score
            on side_a_score.id = result.side_a_score_version_id
          left join private.weekly_score_versions as side_b_score
            on side_b_score.id = result.side_b_score_version_id
          where matchup.playoff_round_publication_id = round.id
        ), '[]'::jsonb)
      ) order by round.nfl_week)
      from private.playoff_round_publications as round
      join private.season_weeks as week on week.id = round.week_id
      where round.season_id = v_season.id
        and not exists (
          select 1 from private.playoff_round_publications as successor
          where successor.supersedes_id = round.id
        )
    ), '[]'::jsonb),
    'archiveComplete', exists (
      select 1 from private.season_archive_versions as archive
      where archive.season_id = v_season.id
        and not exists (
          select 1 from private.season_archive_versions as successor
          where successor.supersedes_id = archive.id
        )
    ),
    'viewer', jsonb_build_object(
      'userId', v_user_id,
      'isCommissioner', private.is_league_commissioner(v_league.id)
    )
  );
end;
$$;

revoke all on function api.get_playoff_state(text) from public, anon;
grant execute on function api.get_playoff_state(text) to authenticated;

comment on table private.season_archive_versions is
  'Mode-neutral append-only archive version chain. Legacy Live schemaVersion 1 rows remain version-1 roots; new final archives use schemaVersion 2.';
comment on function api.finalize_champion_bracket(uuid, text) is
  'Derives and appends champion finality from terminal Week 17 facts after the correction window.';
comment on function api.publish_week18_exhibition(uuid, uuid, text[], text) is
  'Publishes deterministic adjacent Week 18 exhibitions through the reviewed provider slate path.';
comment on function api.correct_finalized_week17_result(uuid, text, integer, integer, text, text) is
  'Appends a documented objective Week 17 correction and every affected champion, Week 18, and archive version atomically.';
comment on function api.finalize_season_archive(uuid, text) is
  'Derives schemaVersion 2 final history only after terminal Week 18 settlement.';

create or replace function api.get_week17_correction_operations(
  p_league_slug text
)
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
  v_week17 private.season_weeks%rowtype;
  v_w18_round private.playoff_round_publications%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  select league.* into strict v_league
  from private.leagues as league
  where league.slug = lower(p_league_slug);
  if not private.is_league_commissioner(v_league.id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = v_league.id
    and season.mode = 'LIVE'
  order by season.created_at desc, season.id desc limit 1;
  if v_season.lifecycle not in (
    'CHAMPION_FINAL', 'WEEK_18_EXHIBITION', 'FINAL'
  ) then
    return null;
  end if;
  select week.* into strict v_week17
  from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = 17;
  select round.* into v_w18_round
  from private.playoff_round_publications as round
  where round.season_id = v_season.id and round.nfl_week = 18
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    );

  return jsonb_build_object(
    'weekState', v_week17.state,
    'pairingPublished', v_w18_round.id is not null,
    'pairingReplaceable', case when v_w18_round.id is null then null
      else private.is_week18_pairing_replaceable(v_w18_round.id) end,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'externalEventId', event.fixture_event_key,
        'awayTeam', event.away_team,
        'homeTeam', event.home_team,
        'scheduledStartAt', event.scheduled_start_at,
        'correctionCount', (
          select count(*) from private.corrections as correction
          where correction.event_id = event.id
        ),
        'result', jsonb_build_object(
          'id', result.id,
          'version', result.version,
          'status', result.status,
          'awayScore', result.away_score,
          'homeScore', result.home_score,
          'source', result.source,
          'reason', result.reason,
          'recordedAt', result.created_at
        )
      ) order by event.scheduled_start_at, event.id)
      from private.sports_events as event
      join lateral (
        select candidate.*
        from private.event_result_versions as candidate
        where candidate.event_id = event.id
          and not exists (
            select 1 from private.event_result_versions as successor
            where successor.supersedes_id = candidate.id
          )
      ) as result on true
      where event.week_id = v_week17.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function api.get_week17_correction_operations(text)
from public, anon;
grant execute on function api.get_week17_correction_operations(text)
to authenticated;
