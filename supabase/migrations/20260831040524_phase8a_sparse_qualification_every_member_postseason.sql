-- Phase 8A: sparse qualification and one matchup/card per member in Weeks 15–17.
-- Existing Stage 3 JSON remains untouched. Legacy rows become version-1 roots;
-- all Phase 8A facts append through one qualification and one round lineage.

alter table private.playoff_publications
  add column version integer,
  add column supersedes_id uuid,
  add column bracket_state jsonb,
  add column source_result_version_ids uuid[];

alter table private.playoff_publications disable trigger playoff_publications_append_only;
update private.playoff_publications
set version = 1,
    source_result_version_ids = '{}'::uuid[]
where version is null;
alter table private.playoff_publications enable trigger playoff_publications_append_only;

alter table private.playoff_publications
  alter column version set not null,
  alter column source_result_version_ids set not null,
  add constraint playoff_publications_version_positive check (version > 0),
  add constraint playoff_publications_bracket_state_object
    check (bracket_state is null or jsonb_typeof(bracket_state) = 'object'),
  add constraint playoff_publications_version_parent_check
    check ((version = 1 and supersedes_id is null) or (version > 1 and supersedes_id is not null));

alter table private.playoff_publications
  drop constraint playoff_publications_season_id_key,
  drop constraint playoff_publications_week14_standings_snapshot_id_key,
  drop constraint playoff_publications_season_id_input_hash_key;

alter table private.playoff_publications
  add constraint playoff_publications_season_version_key unique (season_id, version),
  add constraint playoff_publications_season_input_hash_key unique (season_id, input_hash),
  add constraint playoff_publications_id_season_key unique (id, season_id),
  add constraint playoff_publications_supersedes_same_season_fk
    foreign key (supersedes_id, season_id)
    references private.playoff_publications (id, season_id);

create unique index playoff_publications_one_successor_idx
  on private.playoff_publications (supersedes_id)
  where supersedes_id is not null;
create index playoff_publications_terminal_idx
  on private.playoff_publications (season_id, version desc);
create index playoff_publications_supersedes_fk_idx
  on private.playoff_publications (supersedes_id, season_id);

alter table private.playoff_round_publications
  add column version integer,
  add column supersedes_id uuid;

alter table private.playoff_round_publications disable trigger playoff_round_publications_append_only;
update private.playoff_round_publications set version = 1 where version is null;
alter table private.playoff_round_publications enable trigger playoff_round_publications_append_only;

alter table private.playoff_round_publications
  alter column version set not null,
  add constraint playoff_round_publications_version_positive check (version > 0),
  add constraint playoff_round_publications_version_parent_check
    check ((version = 1 and supersedes_id is null) or (version > 1 and supersedes_id is not null));

alter table private.playoff_round_publications
  drop constraint playoff_round_publications_season_id_nfl_week_key,
  drop constraint playoff_round_publications_week_id_key;

alter table private.playoff_round_publications
  add constraint playoff_round_publications_season_week_version_key
    unique (season_id, nfl_week, version),
  add constraint playoff_round_publications_id_season_week_key
    unique (id, season_id, nfl_week),
  add constraint playoff_round_publications_supersedes_same_week_fk
    foreign key (supersedes_id, season_id, nfl_week)
    references private.playoff_round_publications (id, season_id, nfl_week);

create unique index playoff_round_publications_one_successor_idx
  on private.playoff_round_publications (supersedes_id)
  where supersedes_id is not null;
create index playoff_round_publications_terminal_idx
  on private.playoff_round_publications (season_id, nfl_week, version desc);
create index playoff_round_publications_supersedes_fk_idx
  on private.playoff_round_publications (supersedes_id, season_id, nfl_week);

alter table private.matchups
  add column postseason_role text
    check (postseason_role in ('CHAMPIONSHIP', 'THIRD_PLACE', 'PLACEMENT', 'EXHIBITION'));

alter table private.matchups
  drop constraint matchups_week_id_display_order_key;
create unique index matchups_regular_week_display_order_key
  on private.matchups (week_id, display_order)
  where playoff_round_publication_id is null;
create unique index matchups_postseason_round_display_order_key
  on private.matchups (playoff_round_publication_id, display_order)
  where playoff_round_publication_id is not null;
create index matchups_postseason_role_idx
  on private.matchups (week_id, postseason_role, display_order)
  where postseason_role is not null;

create or replace function private.enforce_playoff_publication_lineage()
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
  from private.playoff_publications as parent
  where parent.id = new.supersedes_id and parent.season_id = new.season_id
  for key share;
  if new.version <> v_parent_version + 1 then
    raise exception using errcode = '55000', message = 'Qualification versions must be contiguous.';
  end if;
  if exists (
    select 1 from private.playoff_publications as successor
    where successor.supersedes_id = new.supersedes_id
  ) then
    raise exception using errcode = '55000', message = 'The qualification lineage already has a successor.';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_playoff_round_lineage()
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
  from private.playoff_round_publications as parent
  where parent.id = new.supersedes_id
    and parent.season_id = new.season_id
    and parent.nfl_week = new.nfl_week
  for key share;
  if new.version <> v_parent_version + 1 then
    raise exception using errcode = '55000', message = 'Postseason round versions must be contiguous.';
  end if;
  if exists (
    select 1 from private.playoff_round_publications as successor
    where successor.supersedes_id = new.supersedes_id
  ) then
    raise exception using errcode = '55000', message = 'The postseason round lineage already has a successor.';
  end if;
  return new;
end;
$$;

create trigger playoff_publications_lineage_guard
before insert on private.playoff_publications
for each row execute function private.enforce_playoff_publication_lineage();
create trigger playoff_round_publications_lineage_guard
before insert on private.playoff_round_publications
for each row execute function private.enforce_playoff_round_lineage();

revoke execute on function private.enforce_playoff_publication_lineage()
from public, anon, authenticated;
revoke execute on function private.enforce_playoff_round_lineage()
from public, anon, authenticated;

create or replace function private.phase8_ruleset_is_complete(p_rules jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    p_rules #>> '{playoffs,minimumChampionshipField}' = '4'
    and p_rules #>> '{playoffs,selectionOrder}' = 'ELIGIBLE_BEFORE_REINSTATED'
    and p_rules #>> '{playoffs,reinstatementReason}' = 'MINIMUM_FOUR_CHAMPIONSHIP_FIELD'
    and p_rules #>> '{playoffs,noReinstatementAtOrAboveEligibleCount}' = '4'
    and p_rules #>> '{playoffs,sixSlotVacancyBehavior,vacantSlotsRemainVacant}' = 'true'
    and p_rules #> '{playoffs,sixSlotVacancyBehavior,fourParticipantsVacantSeeds}' = '[5, 6]'::jsonb
    and p_rules #> '{playoffs,sixSlotVacancyBehavior,fourParticipantsAutomaticAdvances}' = '[3, 4]'::jsonb
    and p_rules #> '{playoffs,sixSlotVacancyBehavior,fiveParticipantsVacantSeeds}' = '[6]'::jsonb
    and p_rules #> '{playoffs,sixSlotVacancyBehavior,fiveParticipantsAutomaticAdvances}' = '[3]'::jsonb
    and p_rules #> '{playoffs,everyMemberPostseasonParticipation,weeks}' = '[15, 16, 17]'::jsonb
    and p_rules #>> '{playoffs,everyMemberPostseasonParticipation,cardsPerMemberPerWeek}' = '1'
    and p_rules #>> '{playoffs,everyMemberPostseasonParticipation,matchupsPerMemberPerWeek}' = '1'
    and p_rules #>> '{playoffs,everyMemberPostseasonParticipation,remainingPairingOrder}' = 'ADJACENT_FROZEN_WEEK_14_ORDER'
    and p_rules #>> '{playoffs,everyMemberPostseasonParticipation,byeExhibitions}' = 'true'
    and p_rules #>> '{playoffs,everyMemberPostseasonParticipation,rematchesAllowed}' = 'true'
    and p_rules #>> '{playoffs,regularSeasonAttendanceFrozenAfterWeek}' = '14'
    and p_rules #>> '{playoffs,exhibitionMiss,marker}' = 'EXHIBITION_MISS'
    and p_rules #>> '{playoffs,exhibitionMiss,scoreCenticredits}' = '0'
    and p_rules #>> '{playoffs,exhibitionMiss,affectsOfficialCompetition}' = 'false'
    and p_rules #> '{playoffs,postseasonRoles}' = '["CHAMPIONSHIP", "THIRD_PLACE", "PLACEMENT", "EXHIBITION"]'::jsonb
    and p_rules #>> '{playoffs,championshipAdvancement,advancingRole}' = 'CHAMPIONSHIP'
    and p_rules #>> '{playoffs,championshipAdvancement,higherSeedAdvancesExactTie}' = 'true'
    and p_rules #>> '{playoffs,championshipAdvancement,singleIncompleteEliminated}' = 'true'
    and p_rules #>> '{playoffs,championshipAdvancement,dualIncompleteAdvancesHigherSeed}' = 'true'
    and p_rules #>> '{playoffs,championshipAdvancement,reseedSemifinals}' = 'SEED_1_VS_LOWEST_REMAINING';
$$;

revoke execute on function private.phase8_ruleset_is_complete(jsonb)
from public, anon, authenticated;

-- Promote only the migration-owned catalog and not-yet-frozen snapshots.
-- Frozen V1.1 snapshots keep their original JSON and digest byte-for-byte.
do $migration$
declare
  v_live jsonb := $phase8_live${"attendance":{"dualIncompleteDecisions":["LOSS","LOSS"],"incompleteCardDecision":"LOSS","incompleteCardMisses":1,"incompleteCardPointsForCenticredits":0,"playoffIneligibilityAtMisses":3},"card":{"acceptanceUnit":"WHOLE_CARD_ATOMIC","carryoverCredits":false,"irreversibleAction":"CONFIRM_AND_SEAL_CARD","maximumPositions":20,"minimumPositions":1,"minimumStakeCredits":50,"stakePrecision":"WHOLE_CREDITS","weeklyAllocationCredits":1000},"concentration":{"aggregateFavoriteExposureCapCredits":null,"eligibleOddsMaximum":null,"eligibleOddsMinimum":null,"heavyFavoriteSinglePositionCapCredits":750,"heavyFavoriteThresholdAmerican":-200,"standardSinglePositionCapCredits":1000,"status":"SETTLED_FOR_POC_V1"},"format":"SUNDAY_LEDGER_MATCHUPS","id":"SUNDAY-LEDGER-POC-SEASON-RULESET-V1","markets":{"eligible":["MONEYLINE","SPREAD","TOTAL"],"referenceBook":"draftkings"},"mode":"LIVE","playoffs":{"championshipAdvancement":{"advancingRole":"CHAMPIONSHIP","dualIncompleteAdvancesHigherSeed":true,"higherSeedAdvancesExactTie":true,"reseedSemifinals":"SEED_1_VS_LOWEST_REMAINING","singleIncompleteEliminated":true},"everyMemberPostseasonParticipation":{"byeExhibitions":true,"cardsPerMemberPerWeek":1,"matchupsPerMemberPerWeek":1,"remainingPairingOrder":"ADJACENT_FROZEN_WEEK_14_ORDER","rematchesAllowed":true,"weeks":[15,16,17]},"exhibitionMiss":{"affectsOfficialCompetition":false,"marker":"EXHIBITION_MISS","scoreCenticredits":0},"largeLeagueQualifiers":6,"minimumChampionshipField":4,"noReinstatementAtOrAboveEligibleCount":4,"postseasonRoles":["CHAMPIONSHIP","THIRD_PLACE","PLACEMENT","EXHIBITION"],"regularSeasonAttendanceFrozenAfterWeek":14,"reinstatementReason":"MINIMUM_FOUR_CHAMPIONSHIP_FIELD","selectionOrder":"ELIGIBLE_BEFORE_REINSTATED","sixSlotVacancyBehavior":{"fiveParticipantsAutomaticAdvances":[3],"fiveParticipantsVacantSeeds":[6],"fourParticipantsAutomaticAdvances":[3,4],"fourParticipantsVacantSeeds":[5,6],"vacantSlotsRemainVacant":true},"smallLeagueMaximumSize":8,"smallLeagueQualifiers":4},"productBibleId":"SUNDAY-LEDGER-PRODUCT-BIBLE-V3","productBibleVersion":"3.0","roster":{"creationPreselection":10,"supportedSizes":[4,6,8,10,12,14,16]},"schedule":{"championshipWeek":17,"exhibitionWeek":18,"postseasonStartWeek":15,"regularSeasonWeeks":14},"seasonLabel":"POC Season 1","settlement":{"correctionWindowHours":24,"lossReturn":"ZERO","postponementWindowHours":48,"precisionCenticredits":1,"pushVoidReturn":"STAKE","rounding":"HALF_UP","winReturn":"STAKE_PLUS_PROFIT"},"slate":{"commonLockOffsetMinutes":5,"earlyGamesRequireCommissionerSelection":true,"includesMondayNight":true,"revealTrigger":"EVENT_START","standardSundayStartHourEastern":13},"sport":"NFL","standings":{"tiebreakOrder":["MATCHUP_WIN_PERCENTAGE","POINTS_FOR","ALL_PLAY_PERCENTAGE","BALANCED_HEAD_TO_HEAD","FEWER_ATTENDANCE_MISSES","HIGHEST_SINGLE_WEEK_SCORE","STORED_DETERMINISTIC_RANDOM"]},"version":"1.1"}$phase8_live$::jsonb;
  v_simulation jsonb := $phase8_simulation${"attendance":{"dualIncompleteDecisions":["LOSS","LOSS"],"incompleteCardDecision":"LOSS","incompleteCardMisses":1,"incompleteCardPointsForCenticredits":0,"playoffIneligibilityAtMisses":3},"card":{"acceptanceUnit":"WHOLE_CARD_ATOMIC","carryoverCredits":false,"irreversibleAction":"CONFIRM_AND_SEAL_CARD","maximumPositions":20,"minimumPositions":1,"minimumStakeCredits":50,"stakePrecision":"WHOLE_CREDITS","weeklyAllocationCredits":1000},"concentration":{"aggregateFavoriteExposureCapCredits":null,"eligibleOddsMaximum":null,"eligibleOddsMinimum":null,"heavyFavoriteSinglePositionCapCredits":750,"heavyFavoriteThresholdAmerican":-200,"standardSinglePositionCapCredits":1000,"status":"SETTLED_FOR_POC_V1"},"format":"SUNDAY_LEDGER_MATCHUPS","id":"SUNDAY-LEDGER-SIMULATION-SEASON-RULESET-V1","markets":{"eligible":["MONEYLINE","SPREAD","TOTAL"],"referenceBook":"draftkings"},"mode":"SIMULATION","playoffs":{"championshipAdvancement":{"advancingRole":"CHAMPIONSHIP","dualIncompleteAdvancesHigherSeed":true,"higherSeedAdvancesExactTie":true,"reseedSemifinals":"SEED_1_VS_LOWEST_REMAINING","singleIncompleteEliminated":true},"everyMemberPostseasonParticipation":{"byeExhibitions":true,"cardsPerMemberPerWeek":1,"matchupsPerMemberPerWeek":1,"remainingPairingOrder":"ADJACENT_FROZEN_WEEK_14_ORDER","rematchesAllowed":true,"weeks":[15,16,17]},"exhibitionMiss":{"affectsOfficialCompetition":false,"marker":"EXHIBITION_MISS","scoreCenticredits":0},"largeLeagueQualifiers":6,"minimumChampionshipField":4,"noReinstatementAtOrAboveEligibleCount":4,"postseasonRoles":["CHAMPIONSHIP","THIRD_PLACE","PLACEMENT","EXHIBITION"],"regularSeasonAttendanceFrozenAfterWeek":14,"reinstatementReason":"MINIMUM_FOUR_CHAMPIONSHIP_FIELD","selectionOrder":"ELIGIBLE_BEFORE_REINSTATED","sixSlotVacancyBehavior":{"fiveParticipantsAutomaticAdvances":[3],"fiveParticipantsVacantSeeds":[6],"fourParticipantsAutomaticAdvances":[3,4],"fourParticipantsVacantSeeds":[5,6],"vacantSlotsRemainVacant":true},"smallLeagueMaximumSize":8,"smallLeagueQualifiers":4},"productBibleId":"SUNDAY-LEDGER-PRODUCT-BIBLE-V3","productBibleVersion":"3.0","roster":{"creationPreselection":10,"supportedSizes":[4,6,8,10,12,14,16]},"schedule":{"championshipWeek":17,"exhibitionWeek":18,"postseasonStartWeek":15,"regularSeasonWeeks":14},"seasonLabel":"POC Season 1 · Simulation","settlement":{"correctionWindowHours":24,"lossReturn":"ZERO","postponementWindowHours":48,"precisionCenticredits":1,"pushVoidReturn":"STAKE","rounding":"HALF_UP","winReturn":"STAKE_PLUS_PROFIT"},"slate":{"commonLockOffsetMinutes":5,"earlyGamesRequireCommissionerSelection":true,"includesMondayNight":true,"revealTrigger":"EVENT_START","standardSundayStartHourEastern":13},"sport":"NFL","standings":{"tiebreakOrder":["MATCHUP_WIN_PERCENTAGE","POINTS_FOR","ALL_PLAY_PERCENTAGE","BALANCED_HEAD_TO_HEAD","FEWER_ATTENDANCE_MISSES","HIGHEST_SINGLE_WEEK_SCORE","STORED_DETERMINISTIC_RANDOM"]},"version":"1.1"}$phase8_simulation$::jsonb;
begin
  update private.season_ruleset_snapshots as snapshot
  set canonical_json = case snapshot.mode when 'LIVE' then v_live else v_simulation end,
      sha256_hash = case snapshot.mode
        when 'LIVE' then '047550e7661915d3ba4d8e4046f85ab9474eac7b857fbba398cb4d9b91a5766c'
        else '64772aad744ed8d5ec12b9e43e1303a610fc92051c250204bffb20c00f5e7a7d' end,
      published_at = clock_timestamp()
  where snapshot.frozen_at is null
    and snapshot.ruleset_version = '1.1'
    and snapshot.canonical_json = (
      select authoritative.canonical_json
      from private.authoritative_season_rulesets as authoritative
      where authoritative.mode = snapshot.mode
    )
    and snapshot.sha256_hash = case snapshot.mode
      when 'LIVE' then '4bba08222402fbe24f706cbb5c6bd7b9aa7c50da5bc8c039f7929aaf4cfcb629'
      else 'dc9a63b54eba31536518b319e5d88889dae0ac9d71e3f37630fa6e1a786e36ff' end;

  update private.authoritative_season_rulesets as authoritative
  set canonical_json = case authoritative.mode when 'LIVE' then v_live else v_simulation end,
      sha256_hash = case authoritative.mode
        when 'LIVE' then '047550e7661915d3ba4d8e4046f85ab9474eac7b857fbba398cb4d9b91a5766c'
        else '64772aad744ed8d5ec12b9e43e1303a610fc92051c250204bffb20c00f5e7a7d' end;
end;
$migration$;

create or replace function private.build_phase8_playoff_publication(
  p_ordered_rows jsonb,
  p_roster_size integer,
  p_ineligibility_misses integer
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_format text;
  v_maximum integer;
  v_eligible_count integer;
  v_reinstate_count integer;
  v_qualifiers jsonb;
  v_slots jsonb;
  v_advancements jsonb := '[]'::jsonb;
  v_entry jsonb;
begin
  if p_roster_size not in (4, 6, 8, 10, 12, 14, 16)
    or p_ineligibility_misses <= 0
    or jsonb_typeof(p_ordered_rows) <> 'array'
    or jsonb_array_length(p_ordered_rows) <> p_roster_size then
    raise exception using errcode = '22023', message = 'The final standings do not match a supported frozen roster.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_ordered_rows) with ordinality as standing(value, ordinality)
    where jsonb_typeof(standing.value) <> 'object'
      or (standing.value ->> 'seed')::integer <> standing.ordinality
      or standing.value ->> 'entryId' is null
      or standing.value ->> 'displayName' is null
      or (standing.value ->> 'attendanceMisses')::integer < 0
  ) or (
    select count(distinct standing.value ->> 'entryId')
    from jsonb_array_elements(p_ordered_rows) as standing(value)
  ) <> p_roster_size then
    raise exception using errcode = '22023', message = 'The final standings are not a complete deterministic ordering.';
  end if;

  v_format := case when p_roster_size <= 8 then 'FOUR_SLOT' else 'SIX_SLOT' end;
  v_maximum := case when v_format = 'FOUR_SLOT' then 4 else 6 end;
  select least(count(*)::integer, v_maximum) into v_eligible_count
  from jsonb_array_elements(p_ordered_rows) as standing(value)
  where (standing.value ->> 'attendanceMisses')::integer < p_ineligibility_misses;
  v_reinstate_count := greatest(0, 4 - v_eligible_count);

  with candidates as (
    select standing.value, standing.ordinality::integer as regular_seed, 0 as selection_group
    from jsonb_array_elements(p_ordered_rows) with ordinality as standing(value, ordinality)
    where (standing.value ->> 'attendanceMisses')::integer < p_ineligibility_misses
    order by standing.ordinality
    limit v_maximum
  ), reinstated as (
    select standing.value, standing.ordinality::integer as regular_seed, 1 as selection_group
    from jsonb_array_elements(p_ordered_rows) with ordinality as standing(value, ordinality)
    where (standing.value ->> 'attendanceMisses')::integer >= p_ineligibility_misses
    order by standing.ordinality
    limit v_reinstate_count
  ), selected as (
    select * from candidates union all select * from reinstated
  ), seeded as (
    select *, row_number() over (order by selection_group, regular_seed)::integer as qualification_seed
    from selected
  )
  select jsonb_agg(
    seeded.value || jsonb_build_object(
      'regularSeasonSeed', seeded.regular_seed,
      'qualificationSeed', seeded.qualification_seed,
      'eligibilityStatus', case when seeded.selection_group = 0 then 'ELIGIBLE' else 'INELIGIBLE' end,
      'selectionReason', case when seeded.selection_group = 0 then 'ELIGIBLE_STANDINGS' else 'MINIMUM_FOUR_CHAMPIONSHIP_FIELD' end,
      'attendanceMissesUsedByQualification', (seeded.value ->> 'attendanceMisses')::integer
    ) order by seeded.qualification_seed
  ) into v_qualifiers from seeded;

  if jsonb_array_length(v_qualifiers) < 4 then
    raise exception using errcode = '55000', message = 'The frozen roster cannot produce the minimum four-member field.';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'slot', slot.seed,
      'state', case when qualifier.value is null then 'VACANT' else 'OCCUPIED' end,
      'entry', qualifier.value
    ) order by slot.seed
  ) into v_slots
  from generate_series(1, v_maximum) as slot(seed)
  left join lateral (
    select candidate.value
    from jsonb_array_elements(v_qualifiers) as candidate(value)
    where (candidate.value ->> 'qualificationSeed')::integer = slot.seed
  ) as qualifier on true;

  if v_format = 'FOUR_SLOT' then
    for v_entry in
      select candidate.value from jsonb_array_elements(v_qualifiers) as candidate(value)
      order by (candidate.value ->> 'qualificationSeed')::integer
    loop
      v_advancements := v_advancements || jsonb_build_array(jsonb_build_object(
        'entry', v_entry, 'fromWeek', 15, 'toWeek', 16, 'reason', 'FOUR_SLOT_EXHIBITION_BYE'
      ));
    end loop;
  else
    for v_entry in
      select candidate.value from jsonb_array_elements(v_qualifiers) as candidate(value)
      where (candidate.value ->> 'qualificationSeed')::integer in (1, 2)
      order by (candidate.value ->> 'qualificationSeed')::integer
    loop
      v_advancements := v_advancements || jsonb_build_array(jsonb_build_object(
        'entry', v_entry, 'fromWeek', 15, 'toWeek', 16, 'reason', 'TOP_TWO_SEED_BYE'
      ));
    end loop;
    if jsonb_array_length(v_qualifiers) = 4 then
      foreach v_eligible_count in array array[3, 4] loop
        v_entry := private.playoff_entry_by_seed(v_qualifiers, v_eligible_count);
        v_advancements := v_advancements || jsonb_build_array(jsonb_build_object(
          'entry', v_entry, 'fromWeek', 15, 'toWeek', 16, 'reason', 'VACANT_OPPONENT'
        ));
      end loop;
    elsif jsonb_array_length(v_qualifiers) = 5 then
      v_entry := private.playoff_entry_by_seed(v_qualifiers, 3);
      v_advancements := v_advancements || jsonb_build_array(jsonb_build_object(
        'entry', v_entry, 'fromWeek', 15, 'toWeek', 16, 'reason', 'VACANT_OPPONENT'
      ));
    end if;
  end if;

  return jsonb_build_object(
    'expectedQualifierCount', v_maximum,
    'actualQualifierCount', jsonb_array_length(v_qualifiers),
    'qualifiers', v_qualifiers,
    'bracketState', jsonb_build_object(
      'format', v_format,
      'minimumFieldSize', 4,
      'maximumFieldSize', v_maximum,
      'slots', v_slots,
      'automaticWeek15Advancements', v_advancements,
      'championshipAdvancementRule', 'HIGHER_QUALIFICATION_SEED_ON_EXACT_TIE_OR_DUAL_INCOMPLETION'
    )
  );
end;
$$;

revoke execute on function private.build_phase8_playoff_publication(jsonb, integer, integer)
from public, anon, authenticated;

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

create or replace function private.assert_phase8_terminal_lineage(p_season_id uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.event_result_versions as child
    join private.event_result_versions as parent on parent.id = child.supersedes_id
    join private.sports_events as event on event.id = child.event_id
    where event.season_id = p_season_id
      and (parent.event_id <> child.event_id or parent.week_id <> child.week_id or parent.league_id <> child.league_id)
  ) or exists (
    select 1 from private.event_result_versions as candidate
    join private.sports_events as event on event.id = candidate.event_id
    where event.season_id = p_season_id
      and not exists (select 1 from private.event_result_versions as successor where successor.supersedes_id = candidate.id)
    group by candidate.event_id having count(*) > 1
  ) then
    raise exception using errcode = '55000', message = 'Competing official event results require resolution.';
  end if;
  if exists (
    select 1 from private.weekly_score_versions as child
    join private.weekly_score_versions as parent on parent.id = child.supersedes_id
    join private.season_weeks as week on week.id = child.week_id
    where week.season_id = p_season_id
      and (parent.card_id <> child.card_id or parent.week_id <> child.week_id
        or parent.league_id <> child.league_id or parent.entry_id <> child.entry_id)
  ) or exists (
    select 1 from private.weekly_score_versions as candidate
    join private.season_weeks as week on week.id = candidate.week_id
    where week.season_id = p_season_id
      and not exists (select 1 from private.weekly_score_versions as successor where successor.supersedes_id = candidate.id)
    group by candidate.card_id having count(*) > 1
  ) then
    raise exception using errcode = '55000', message = 'Competing official weekly scores require resolution.';
  end if;
  if exists (
    select 1 from private.matchup_result_versions as child
    join private.matchup_result_versions as parent on parent.id = child.supersedes_id
    join private.matchups as matchup on matchup.id = child.matchup_id
    where matchup.season_id = p_season_id
      and (parent.matchup_id <> child.matchup_id or parent.week_id <> child.week_id or parent.league_id <> child.league_id)
  ) or exists (
    select 1 from private.matchup_result_versions as candidate
    join private.matchups as matchup on matchup.id = candidate.matchup_id
    where matchup.season_id = p_season_id
      and not exists (select 1 from private.matchup_result_versions as successor where successor.supersedes_id = candidate.id)
    group by candidate.matchup_id having count(*) > 1
  ) then
    raise exception using errcode = '55000', message = 'Competing official matchup results require resolution.';
  end if;
end;
$$;

revoke execute on function private.assert_phase8_terminal_lineage(uuid)
from public, anon, authenticated;

create or replace function private.phase8_championship_outcome(
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
  v_publication private.playoff_publications%rowtype;
  v_side_a_seed integer;
  v_side_b_seed integer;
  v_winner_seed integer;
  v_loser_seed integer;
  v_advanced_by text;
begin
  select matchup.* into strict v_matchup
  from private.matchups as matchup
  where matchup.id = p_matchup_id
    and matchup.postseason_role = 'CHAMPIONSHIP'
    and private.is_effective_postseason_matchup(matchup.id);

  if (
    select count(*)
    from private.matchup_result_versions as candidate
    where candidate.matchup_id = v_matchup.id
      and candidate.status = 'FINAL'
      and not exists (
        select 1 from private.matchup_result_versions as successor
        where successor.supersedes_id = candidate.id
      )
  ) <> 1 then
    raise exception using errcode = '55000', message = 'A championship matchup requires one terminal final result.';
  end if;

  select result.* into strict v_result
  from private.matchup_result_versions as result
  where result.matchup_id = v_matchup.id
    and result.status = 'FINAL'
    and not exists (
      select 1 from private.matchup_result_versions as successor
      where successor.supersedes_id = result.id
    );

  select publication.* into strict v_publication
  from private.playoff_publications as publication
  where publication.id = p_playoff_publication_id
    and publication.season_id = v_matchup.season_id
    and publication.league_id = v_matchup.league_id;
  v_side_a_seed := private.playoff_qualification_seed(v_publication.id, v_matchup.side_a_entry_id);
  v_side_b_seed := private.playoff_qualification_seed(v_publication.id, v_matchup.side_b_entry_id);
  if v_side_a_seed is null or v_side_b_seed is null then
    raise exception using errcode = '55000', message = 'A championship matchup contains an entry outside the terminal field.';
  end if;

  if v_result.side_a_decision = 'WIN' then
    v_winner_seed := v_side_a_seed; v_loser_seed := v_side_b_seed; v_advanced_by := 'SCORE_OR_SINGLE_INCOMPLETION';
  elsif v_result.side_b_decision = 'WIN' then
    v_winner_seed := v_side_b_seed; v_loser_seed := v_side_a_seed; v_advanced_by := 'SCORE_OR_SINGLE_INCOMPLETION';
  elsif v_side_a_seed < v_side_b_seed then
    v_winner_seed := v_side_a_seed; v_loser_seed := v_side_b_seed; v_advanced_by := 'HIGHER_QUALIFICATION_SEED';
  else
    v_winner_seed := v_side_b_seed; v_loser_seed := v_side_a_seed; v_advanced_by := 'HIGHER_QUALIFICATION_SEED';
  end if;
  return jsonb_build_object(
    'matchupId', v_matchup.id,
    'resultVersionId', v_result.id,
    'winner', private.playoff_entry_by_seed(v_publication.qualifiers, v_winner_seed),
    'loser', private.playoff_entry_by_seed(v_publication.qualifiers, v_loser_seed),
    'advancedBy', v_advanced_by
  );
end;
$$;

revoke execute on function private.phase8_championship_outcome(uuid, uuid)
from public, anon, authenticated;

create or replace function private.build_phase8_postseason_round(
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
  v_games jsonb := '[]'::jsonb;
  v_outcomes jsonb := '[]'::jsonb;
  v_source_ids uuid[] := '{}'::uuid[];
  v_reserved uuid[] := '{}'::uuid[];
  v_bye_ids uuid[] := '{}'::uuid[];
  v_remaining jsonb[] := '{}'::jsonb[];
  v_survivors jsonb[] := '{}'::jsonb[];
  v_row jsonb;
  v_side_a jsonb;
  v_side_b jsonb;
  v_role text;
  v_game integer := 0;
  v_seed_one jsonb;
  v_seed_two jsonb;
  v_first jsonb;
  v_second jsonb;
  v_participants uuid[];
begin
  if p_nfl_week not between 15 and 17 then
    raise exception using errcode = '22023', message = 'Postseason publication supports Weeks 15 through 17.';
  end if;
  select publication.* into strict v_publication
  from private.playoff_publications as publication
  where publication.id = p_playoff_publication_id
    and publication.bracket_state is not null
    and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
    );

  if p_nfl_week = 15 and v_publication.bracket_state ->> 'format' = 'SIX_SLOT' then
    foreach v_game in array array[3, 4] loop
      v_side_a := private.playoff_entry_by_seed(v_publication.qualifiers, v_game);
      v_side_b := private.playoff_entry_by_seed(v_publication.qualifiers, case when v_game = 3 then 6 else 5 end);
      if v_side_a is not null and v_side_b is not null then
        v_games := v_games || jsonb_build_array(jsonb_build_object(
          'game', jsonb_array_length(v_games) + 1,
          'role', 'CHAMPIONSHIP',
          'label', 'Opening round · ' || v_game::text || ' vs ' || (case when v_game = 3 then 6 else 5 end)::text,
          'byeExhibition', false,
          'sideA', v_side_a,
          'sideB', v_side_b
        ));
        v_reserved := v_reserved || array[(v_side_a ->> 'entryId')::uuid, (v_side_b ->> 'entryId')::uuid];
      end if;
    end loop;
  elsif p_nfl_week = 16 and v_publication.bracket_state ->> 'format' = 'FOUR_SLOT' then
    v_games := jsonb_build_array(
      jsonb_build_object('game', 1, 'role', 'CHAMPIONSHIP', 'label', 'Semifinal · 1 vs 4', 'byeExhibition', false,
        'sideA', private.playoff_entry_by_seed(v_publication.qualifiers, 1), 'sideB', private.playoff_entry_by_seed(v_publication.qualifiers, 4)),
      jsonb_build_object('game', 2, 'role', 'CHAMPIONSHIP', 'label', 'Semifinal · 2 vs 3', 'byeExhibition', false,
        'sideA', private.playoff_entry_by_seed(v_publication.qualifiers, 2), 'sideB', private.playoff_entry_by_seed(v_publication.qualifiers, 3))
    );
    v_reserved := array[
      (v_publication.qualifiers #>> '{0,entryId}')::uuid,
      (v_publication.qualifiers #>> '{1,entryId}')::uuid,
      (v_publication.qualifiers #>> '{2,entryId}')::uuid,
      (v_publication.qualifiers #>> '{3,entryId}')::uuid
    ];
  elsif p_nfl_week = 16 then
    if (
      select count(*) from private.playoff_round_publications as round
      where round.season_id = v_publication.season_id and round.nfl_week = 15
        and not exists (select 1 from private.playoff_round_publications as successor where successor.supersedes_id = round.id)
    ) <> 1 then
      raise exception using errcode = '55000', message = 'Week 15 has no unambiguous terminal round.';
    end if;
    select round.* into strict v_prior_round
    from private.playoff_round_publications as round
    join private.season_weeks as week on week.id = round.week_id and week.state = 'FINAL'
    where round.season_id = v_publication.season_id and round.nfl_week = 15
      and round.playoff_publication_id = v_publication.id
      and not exists (select 1 from private.playoff_round_publications as successor where successor.supersedes_id = round.id);
    select coalesce(jsonb_agg(private.phase8_championship_outcome(matchup.id, v_publication.id) order by matchup.display_order), '[]'::jsonb)
    into v_outcomes
    from private.matchups as matchup
    where matchup.playoff_round_publication_id = v_prior_round.id and matchup.postseason_role = 'CHAMPIONSHIP';
    select coalesce(array_agg((outcome.value ->> 'resultVersionId')::uuid order by outcome.ordinality), '{}'::uuid[])
    into v_source_ids from jsonb_array_elements(v_outcomes) with ordinality as outcome(value, ordinality);
    select coalesce(array_agg(outcome.value -> 'winner' order by (outcome.value #>> '{winner,qualificationSeed}')::integer), '{}'::jsonb[])
    into v_survivors from jsonb_array_elements(v_outcomes) as outcome(value);
    select v_survivors || coalesce(array_agg(advance.value -> 'entry' order by (advance.value #>> '{entry,qualificationSeed}')::integer), '{}'::jsonb[])
    into v_survivors
    from jsonb_array_elements(v_publication.bracket_state -> 'automaticWeek15Advancements') as advance(value)
    where advance.value ->> 'reason' = 'VACANT_OPPONENT';
    if cardinality(v_survivors) <> 2 then
      raise exception using errcode = '55000', message = 'Week 16 requires exactly two Week 15 survivors.';
    end if;
    select survivor into v_first from unnest(v_survivors) as survivor order by (survivor ->> 'qualificationSeed')::integer desc limit 1;
    select survivor into v_second from unnest(v_survivors) as survivor order by (survivor ->> 'qualificationSeed')::integer asc limit 1;
    v_seed_one := private.playoff_entry_by_seed(v_publication.qualifiers, 1);
    v_seed_two := private.playoff_entry_by_seed(v_publication.qualifiers, 2);
    v_games := jsonb_build_array(
      jsonb_build_object('game', 1, 'role', 'CHAMPIONSHIP', 'label', 'Semifinal · No. 1 seed vs lowest remaining seed', 'byeExhibition', false, 'sideA', v_seed_one, 'sideB', v_first),
      jsonb_build_object('game', 2, 'role', 'CHAMPIONSHIP', 'label', 'Semifinal · No. 2 seed', 'byeExhibition', false, 'sideA', v_seed_two, 'sideB', v_second)
    );
    v_reserved := array[(v_seed_one ->> 'entryId')::uuid, (v_seed_two ->> 'entryId')::uuid, (v_first ->> 'entryId')::uuid, (v_second ->> 'entryId')::uuid];
  elsif p_nfl_week = 17 then
    if (
      select count(*) from private.playoff_round_publications as round
      where round.season_id = v_publication.season_id and round.nfl_week = 16
        and not exists (select 1 from private.playoff_round_publications as successor where successor.supersedes_id = round.id)
    ) <> 1 then
      raise exception using errcode = '55000', message = 'Week 16 has no unambiguous terminal round.';
    end if;
    select round.* into strict v_prior_round
    from private.playoff_round_publications as round
    join private.season_weeks as week on week.id = round.week_id and week.state = 'FINAL'
    where round.season_id = v_publication.season_id and round.nfl_week = 16
      and round.playoff_publication_id = v_publication.id
      and not exists (select 1 from private.playoff_round_publications as successor where successor.supersedes_id = round.id);
    select jsonb_agg(private.phase8_championship_outcome(matchup.id, v_publication.id) order by matchup.display_order)
    into v_outcomes
    from private.matchups as matchup
    where matchup.playoff_round_publication_id = v_prior_round.id and matchup.postseason_role = 'CHAMPIONSHIP';
    if jsonb_array_length(coalesce(v_outcomes, '[]'::jsonb)) <> 2 then
      raise exception using errcode = '55000', message = 'Week 17 requires two terminal semifinal outcomes.';
    end if;
    select array_agg((outcome.value ->> 'resultVersionId')::uuid order by outcome.ordinality)
    into v_source_ids from jsonb_array_elements(v_outcomes) with ordinality as outcome(value, ordinality);
    v_games := jsonb_build_array(
      jsonb_build_object('game', 1, 'role', 'CHAMPIONSHIP', 'label', 'Championship', 'byeExhibition', false, 'sideA', v_outcomes #> '{0,winner}', 'sideB', v_outcomes #> '{1,winner}'),
      jsonb_build_object('game', 2, 'role', 'THIRD_PLACE', 'label', 'Third place', 'byeExhibition', false, 'sideA', v_outcomes #> '{0,loser}', 'sideB', v_outcomes #> '{1,loser}')
    );
    v_reserved := array[
      (v_outcomes #>> '{0,winner,entryId}')::uuid, (v_outcomes #>> '{1,winner,entryId}')::uuid,
      (v_outcomes #>> '{0,loser,entryId}')::uuid, (v_outcomes #>> '{1,loser,entryId}')::uuid
    ];
  end if;

  if p_nfl_week = 15 then
    select coalesce(array_agg((advance.value #>> '{entry,entryId}')::uuid), '{}'::uuid[])
    into v_bye_ids
    from jsonb_array_elements(v_publication.bracket_state -> 'automaticWeek15Advancements') as advance(value);
  end if;

  for v_row in
    select standing.value
    from jsonb_array_elements(v_publication.standings_json) with ordinality as standing(value, ordinality)
    where not ((standing.value ->> 'entryId')::uuid = any(v_reserved))
    order by standing.ordinality
  loop
    v_remaining := array_append(v_remaining,
      v_row || jsonb_build_object(
        'regularSeasonSeed', (v_row ->> 'seed')::integer,
        'qualificationSeed', private.playoff_qualification_seed(v_publication.id, (v_row ->> 'entryId')::uuid)
      )
    );
  end loop;
  if cardinality(v_remaining) % 2 <> 0 then
    raise exception using errcode = '55000', message = 'Every-member pairing left an unpaired member.';
  end if;
  v_game := jsonb_array_length(v_games);
  for v_game in 1..(cardinality(v_remaining) / 2) loop
    v_side_a := v_remaining[v_game * 2 - 1];
    v_side_b := v_remaining[v_game * 2];
    v_role := case
      when p_nfl_week = 15 then 'EXHIBITION'
      when (v_side_a ->> 'entryId')::uuid = any(v_bye_ids)
        or (v_side_b ->> 'entryId')::uuid = any(v_bye_ids) then 'EXHIBITION'
      when v_side_a -> 'qualificationSeed' <> 'null'::jsonb
        and v_side_b -> 'qualificationSeed' <> 'null'::jsonb then 'PLACEMENT'
      else 'EXHIBITION'
    end;
    v_games := v_games || jsonb_build_array(jsonb_build_object(
      'game', jsonb_array_length(v_games) + 1,
      'role', v_role,
      'label', case
        when v_role = 'PLACEMENT' then 'Placement matchup'
        when (v_side_a ->> 'entryId')::uuid = any(v_bye_ids)
          or (v_side_b ->> 'entryId')::uuid = any(v_bye_ids) then 'Bye exhibition'
        else 'Exhibition'
      end,
      'byeExhibition', (v_side_a ->> 'entryId')::uuid = any(v_bye_ids) or (v_side_b ->> 'entryId')::uuid = any(v_bye_ids),
      'sideA', v_side_a,
      'sideB', v_side_b
    ));
  end loop;

  select array_agg(participant.entry_id order by participant.entry_id) into v_participants
  from (
    select (game.value #>> '{sideA,entryId}')::uuid as entry_id from jsonb_array_elements(v_games) as game(value)
    union all
    select (game.value #>> '{sideB,entryId}')::uuid from jsonb_array_elements(v_games) as game(value)
  ) as participant;
  if jsonb_array_length(v_games) <> v_publication.roster_size / 2
    or cardinality(v_participants) <> v_publication.roster_size
    or (select count(distinct entry_id) from unnest(v_participants) as entry_id) <> v_publication.roster_size then
    raise exception using errcode = '55000', message = 'Every member must appear exactly once in the effective postseason round.';
  end if;
  return jsonb_build_object(
    'week', p_nfl_week,
    'stageScope', case when exists (select 1 from jsonb_array_elements(v_games) as game(value) where game.value ->> 'role' = 'CHAMPIONSHIP') then 'PLAYOFF' else 'EXHIBITION' end,
    'games', v_games,
    'participantEntryIds', to_jsonb(v_participants),
    'sourceResultVersionIds', to_jsonb(v_source_ids)
  );
end;
$$;

revoke execute on function private.build_phase8_postseason_round(uuid, integer)
from public, anon, authenticated;

create or replace function api.publish_playoff_qualification(
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
  v_standings private.standings_snapshots%rowtype;
  v_ruleset private.season_ruleset_snapshots%rowtype;
  v_current private.playoff_publications%rowtype;
  v_publication private.playoff_publications%rowtype;
  v_command private.command_receipts%rowtype;
  v_roster_size integer;
  v_generated jsonb;
  v_input_hash text;
  v_request_hash text;
  v_source_ids uuid[];
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
  where season.league_id = p_league_id and season.mode = 'LIVE'
    and season.lifecycle in ('REGULAR', 'PLAYOFFS')
  order by season.created_at desc, season.id desc limit 1 for update;
  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = 14 and week.scope = 'REGULAR'
  for share;
  if v_week.state <> 'FINAL' then
    raise exception using errcode = '55000', message = 'Week 14 must be final before playoff qualification can publish.';
  end if;
  perform private.assert_phase8_terminal_lineage(v_season.id);
  select ruleset.* into strict v_ruleset
  from private.season_ruleset_snapshots as ruleset
  where ruleset.id = v_season.ruleset_snapshot_id for share;
  if v_ruleset.frozen_at is null or not private.phase8_ruleset_is_complete(v_ruleset.canonical_json) then
    raise exception using errcode = '55000', message = 'The frozen Ruleset lacks the required V1.1 postseason policy.';
  end if;

  if exists (
    select 1 from private.standings_snapshots as child
    join private.standings_snapshots as parent on parent.id = child.supersedes_id
    where child.season_id = v_season.id and child.through_week = 14
      and (parent.season_id <> child.season_id or parent.week_id <> child.week_id
        or parent.league_id <> child.league_id or parent.through_week <> child.through_week)
  ) or (
    select count(*) from private.standings_snapshots as candidate
    where candidate.season_id = v_season.id and candidate.week_id = v_week.id
      and candidate.through_week = 14 and candidate.status = 'FINAL'
      and not exists (select 1 from private.standings_snapshots as successor where successor.supersedes_id = candidate.id)
  ) <> 1 then
    raise exception using errcode = '55000', message = 'Week 14 has no unambiguous terminal final standings lineage.';
  end if;
  select standings.* into strict v_standings
  from private.standings_snapshots as standings
  where standings.season_id = v_season.id and standings.week_id = v_week.id
    and standings.through_week = 14 and standings.status = 'FINAL'
    and not exists (select 1 from private.standings_snapshots as successor where successor.supersedes_id = standings.id)
  for share;
  select count(*) into v_roster_size from private.season_entries as entry
  where entry.season_id = v_season.id and entry.league_id = p_league_id;
  v_generated := private.build_phase8_playoff_publication(
    v_standings.ordered_rows,
    v_roster_size,
    (v_ruleset.canonical_json #>> '{attendance,playoffIneligibilityAtMisses}')::integer
  );
  select coalesce(array_agg(result.id order by matchup.display_order), '{}'::uuid[])
  into v_source_ids
  from private.matchups as matchup
  join private.matchup_result_versions as result on result.matchup_id = matchup.id
  where matchup.week_id = v_week.id and result.status = 'FINAL'
    and not exists (select 1 from private.matchup_result_versions as successor where successor.supersedes_id = result.id);
  v_input_hash := encode(extensions.digest(
    v_season.id::text || ':' || v_standings.id::text || ':' || v_standings.input_hash
    || ':' || v_ruleset.sha256_hash || ':' || v_generated::text
    || ':' || array_to_string(v_source_ids, ','), 'sha256'), 'hex');
  v_request_hash := encode(extensions.digest(p_league_id::text || ':' || v_input_hash, 'sha256'), 'hex');

  select command.* into v_command from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'PUBLISH_PLAYOFF_QUALIFICATION'
    and command.idempotency_key = p_idempotency_key for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  if exists (
    select 1 from private.playoff_publications as child
    join private.playoff_publications as parent on parent.id = child.supersedes_id
    where child.season_id = v_season.id and parent.season_id <> child.season_id
  ) or (
    select count(*) from private.playoff_publications as candidate
    where candidate.season_id = v_season.id
      and not exists (select 1 from private.playoff_publications as successor where successor.supersedes_id = candidate.id)
  ) > 1 then
    raise exception using errcode = '55000', message = 'The qualification lineage has competing terminal versions.';
  end if;
  select publication.* into v_current
  from private.playoff_publications as publication
  where publication.season_id = v_season.id
    and not exists (select 1 from private.playoff_publications as successor where successor.supersedes_id = publication.id)
  for share;

  if v_current.id is not null and v_current.input_hash <> v_input_hash and exists (
    select 1 from private.weekly_cards as card
    join private.season_weeks as downstream on downstream.id = card.week_id
    where downstream.season_id = v_season.id and downstream.nfl_week between 15 and 17
      and card.locked_at is not null
  ) then
    raise exception using errcode = '55000', message = 'Qualification cannot change after a downstream card seals.';
  end if;

  if v_current.id is not null and v_current.input_hash = v_input_hash then
    v_publication := v_current;
  else
    insert into private.playoff_publications (
      season_id, league_id, week14_standings_snapshot_id, ruleset_snapshot_id,
      roster_size, expected_qualifier_count, standings_json, qualifiers,
      bracket_json, bracket_state, source_result_version_ids, input_hash,
      created_by, version, supersedes_id
    ) values (
      v_season.id, p_league_id, v_standings.id, v_ruleset.id,
      v_roster_size, (v_generated ->> 'expectedQualifierCount')::integer,
      v_standings.ordered_rows, v_generated -> 'qualifiers', '{}'::jsonb,
      v_generated -> 'bracketState', v_source_ids, v_input_hash, v_user_id,
      coalesce(v_current.version, 0) + 1, v_current.id
    ) returning * into strict v_publication;
  end if;
  update private.seasons set lifecycle = 'PLAYOFFS'
  where id = v_season.id and lifecycle = 'REGULAR';
  v_response := jsonb_build_object(
    'publicationId', v_publication.id, 'version', v_publication.version,
    'supersedesId', v_publication.supersedes_id, 'seasonId', v_season.id,
    'leagueId', p_league_id, 'lifecycle', 'PLAYOFFS',
    'rosterSize', v_roster_size,
    'expectedQualifierCount', v_publication.expected_qualifier_count,
    'actualQualifierCount', jsonb_array_length(v_publication.qualifiers),
    'format', v_publication.bracket_state ->> 'format',
    'publishedAt', v_publication.published_at, 'inputHash', v_publication.input_hash
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key, request_hash, response_json
  ) values (p_league_id, v_user_id, 'PUBLISH_PLAYOFF_QUALIFICATION', p_idempotency_key, v_request_hash, v_response);
  return v_response;
end;
$$;

revoke all on function api.publish_playoff_qualification(uuid, text) from public, anon;
grant execute on function api.publish_playoff_qualification(uuid, text) to authenticated;

create or replace function api.publish_postseason_week(
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
  v_publication private.playoff_publications%rowtype;
  v_latest_week private.season_weeks%rowtype;
  v_week private.season_weeks%rowtype;
  v_prior_round private.playoff_round_publications%rowtype;
  v_superseded_round private.playoff_round_publications%rowtype;
  v_import private.live_odds_imports%rowtype;
  v_command private.command_receipts%rowtype;
  v_round jsonb;
  v_selected_event_ids text[];
  v_source_result_ids uuid[];
  v_request_hash text;
  v_input_hash text;
  v_published_at timestamptz := clock_timestamp();
  v_first_kickoff_at timestamptz;
  v_common_lock_at timestamptz;
  v_next_week integer;
  v_available_count integer;
  v_selected_count integer;
  v_matchup_count integer;
  v_card_count integer;
  v_round_version integer;
  v_slate_version integer;
  v_week_id uuid;
  v_slate_id uuid := gen_random_uuid();
  v_round_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_snapshot_id uuid;
  v_event_json jsonb;
  v_market_json jsonb;
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
  select array_agg(btrim(event_id) order by btrim(event_id)) into v_selected_event_ids
  from unnest(p_external_event_ids) as selected(event_id);
  if exists (select 1 from unnest(v_selected_event_ids) as selected(event_id) where selected.event_id = '')
    or (select count(*) from unnest(v_selected_event_ids)) <>
       (select count(distinct event_id) from unnest(v_selected_event_ids) as selected(event_id)) then
    raise exception using errcode = '22023', message = 'Selected event identifiers must be unique and non-empty.';
  end if;
  v_request_hash := encode(extensions.digest(
    p_league_id::text || ':' || p_import_id::text || ':' || array_to_string(v_selected_event_ids, ','),
    'sha256'), 'hex');
  select command.* into v_command from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'PUBLISH_POSTSEASON_WEEK'
    and command.idempotency_key = p_idempotency_key for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;

  select season.* into strict v_season from private.seasons as season
  where season.league_id = p_league_id and season.mode = 'LIVE' and season.lifecycle = 'PLAYOFFS'
  order by season.created_at desc, season.id desc limit 1 for update;
  perform private.assert_phase8_terminal_lineage(v_season.id);
  if (
    select count(*) from private.playoff_publications as candidate
    where candidate.season_id = v_season.id
      and not exists (select 1 from private.playoff_publications as successor where successor.supersedes_id = candidate.id)
  ) <> 1 then
    raise exception using errcode = '55000', message = 'The qualification lineage has no unambiguous terminal version.';
  end if;
  select publication.* into strict v_publication
  from private.playoff_publications as publication
  where publication.season_id = v_season.id and publication.bracket_state is not null
    and not exists (select 1 from private.playoff_publications as successor where successor.supersedes_id = publication.id)
  for share;
  select week.* into strict v_latest_week from private.season_weeks as week
  where week.season_id = v_season.id order by week.nfl_week desc limit 1 for update;

  if v_latest_week.nfl_week = 14 then
    if v_latest_week.state <> 'FINAL' then
      raise exception using errcode = '55000', message = 'Week 14 must be final before Week 15 can publish.';
    end if;
    v_next_week := 15;
  elsif v_latest_week.nfl_week between 15 and 17 then
    if (
      select count(*) from private.playoff_round_publications as round
      where round.season_id = v_season.id and round.nfl_week = v_latest_week.nfl_week
        and not exists (select 1 from private.playoff_round_publications as successor where successor.supersedes_id = round.id)
    ) <> 1 then
      raise exception using errcode = '55000', message = 'The current postseason week has no unambiguous terminal round.';
    end if;
    select round.* into strict v_prior_round from private.playoff_round_publications as round
    where round.season_id = v_season.id and round.nfl_week = v_latest_week.nfl_week
      and not exists (select 1 from private.playoff_round_publications as successor where successor.supersedes_id = round.id)
    for share;
    if v_latest_week.state = 'FINAL' then
      if v_prior_round.playoff_publication_id <> v_publication.id then
        raise exception using errcode = '55000', message = 'A finalized postseason round cannot be rebuilt from corrected qualification.';
      end if;
      if v_latest_week.nfl_week >= 17 then
        raise exception using errcode = '55000', message = 'No additional Phase 8A postseason week can publish.';
      end if;
      v_next_week := v_latest_week.nfl_week + 1;
    elsif v_prior_round.playoff_publication_id <> v_publication.id then
      if exists (select 1 from private.weekly_cards as card where card.week_id = v_latest_week.id and card.locked_at is not null) then
        raise exception using errcode = '55000', message = 'The current postseason round cannot change after a card seals.';
      end if;
      v_next_week := v_latest_week.nfl_week;
      v_superseded_round := v_prior_round;
    else
      raise exception using errcode = '55000', message = 'The current week must be final before the next postseason week can publish.';
    end if;
  else
    raise exception using errcode = '55000', message = 'Postseason publication requires terminal Week 14 through Week 16 state.';
  end if;

  v_round := private.build_phase8_postseason_round(v_publication.id, v_next_week);
  select coalesce(array_agg(source.value::uuid order by source.ordinality), '{}'::uuid[])
  into v_source_result_ids
  from jsonb_array_elements_text(v_round -> 'sourceResultVersionIds') with ordinality as source(value, ordinality);
  select odds_import.* into strict v_import from private.live_odds_imports as odds_import
  where odds_import.id = p_import_id and odds_import.season_id = v_season.id and odds_import.league_id = p_league_id;
  if exists (
    select 1 from private.live_odds_imports as newer_import
    where newer_import.season_id = v_season.id
      and (newer_import.created_at, newer_import.id) > (v_import.created_at, v_import.id)
  ) then
    raise exception using errcode = '40001', message = 'A newer reviewed import is available.';
  end if;
  select count(*) into v_available_count
  from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
  where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids);
  v_selected_count := cardinality(v_selected_event_ids);
  if v_available_count <> v_selected_count then
    raise exception using errcode = '22023', message = 'Every selected event must belong to the reviewed import.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
    cross join lateral jsonb_array_elements(provider_event.value -> 'markets') as provider_market(value)
    where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids)
      and ((provider_market.value ->> 'observedAt')::timestamptz > v_published_at
        or (provider_market.value ->> 'observedAt')::timestamptz < v_published_at - interval '2 minutes')
  ) then
    raise exception using errcode = '55000', message = 'Every selected event requires six fresh current quotes before cards open.';
  end if;
  select min((provider_event.value ->> 'scheduledStartAt')::timestamptz) into v_first_kickoff_at
  from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
  where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids);
  v_common_lock_at := v_first_kickoff_at - interval '5 minutes';
  if v_common_lock_at <= v_published_at then
    raise exception using errcode = '22023', message = 'The selected slate has already reached common lock.';
  end if;
  v_input_hash := encode(extensions.digest(
    v_publication.input_hash || ':' || v_next_week::text || ':' || v_import.payload_hash
    || ':' || array_to_string(v_selected_event_ids, ',') || ':' || (v_round -> 'games')::text
    || ':' || array_to_string(v_source_result_ids, ','), 'sha256'), 'hex');

  if v_superseded_round.id is null then
    v_week_id := gen_random_uuid();
    insert into private.season_weeks (
      id, season_id, league_id, nfl_week, scope, state, opens_at, common_lock_at
    ) values (
      v_week_id, v_season.id, p_league_id, v_next_week,
      case when v_round ->> 'stageScope' = 'EXHIBITION' then 'EXHIBITION' else 'PLAYOFF' end,
      'OPEN', v_published_at, v_common_lock_at
    ) returning * into v_week;
    v_slate_version := 1;
    v_round_version := 1;
  else
    v_week := v_latest_week;
    v_week_id := v_week.id;
    if v_week.common_lock_at <> v_common_lock_at then
      raise exception using errcode = '55000', message = 'A corrected unsealed round must retain the published common lock.';
    end if;
    select coalesce(max(slate.version), 0) + 1 into v_slate_version
    from private.slates as slate where slate.week_id = v_week_id;
    v_round_version := v_superseded_round.version + 1;
  end if;
  insert into private.slates (
    id, week_id, season_id, league_id, version, fixture_id, common_lock_at, published_at
  ) values (
    v_slate_id, v_week_id, v_season.id, p_league_id, v_slate_version,
    'live-postseason-import:' || v_import.id::text, v_common_lock_at, v_published_at
  );

  for v_event_json in
    select provider_event.value from jsonb_array_elements(v_import.normalized_json -> 'events') as provider_event(value)
    where provider_event.value ->> 'externalEventId' = any(v_selected_event_ids)
    order by (provider_event.value ->> 'scheduledStartAt')::timestamptz, provider_event.value ->> 'externalEventId'
  loop
    select event.id into v_event_id from private.sports_events as event
    where event.season_id = v_season.id and event.fixture_event_key = v_event_json ->> 'externalEventId';
    if v_event_id is null then
      v_event_id := gen_random_uuid();
      insert into private.sports_events (
        id, week_id, season_id, league_id, fixture_event_key, away_team,
        home_team, scheduled_start_at, provider_health
      ) values (
        v_event_id, v_week_id, v_season.id, p_league_id,
        v_event_json ->> 'externalEventId', v_event_json ->> 'awayTeam', v_event_json ->> 'homeTeam',
        (v_event_json ->> 'scheduledStartAt')::timestamptz, 'HEALTHY'
      );
    end if;
    for v_market_json in
      select provider_market.value from jsonb_array_elements(v_event_json -> 'markets') as provider_market(value)
      order by provider_market.value ->> 'marketType', provider_market.value ->> 'outcomeKey'
    loop
      v_line_milli := case when jsonb_typeof(v_market_json -> 'lineMilli') = 'null' then null
        else (v_market_json ->> 'lineMilli')::integer end;
      v_snapshot_id := gen_random_uuid();
      insert into private.market_snapshots (
        id, event_id, week_id, league_id, book_key, market_type, outcome_key,
        proposition, line_milli, american_odds, quality_status, observed_at, payload_hash
      ) values (
        v_snapshot_id, v_event_id, v_week_id, p_league_id,
        lower(v_market_json ->> 'sourceBook'), upper(v_market_json ->> 'marketType'),
        upper(v_market_json ->> 'outcomeKey'), v_market_json ->> 'proposition',
        v_line_milli, (v_market_json ->> 'americanOdds')::integer, 'HEALTHY',
        (v_market_json ->> 'observedAt')::timestamptz,
        encode(extensions.digest((v_event_json ->> 'externalEventId') || ':' || v_market_json::text, 'sha256'), 'hex')
      ) on conflict (event_id, book_key, market_type, outcome_key, line_milli, payload_hash)
      do nothing returning id into v_snapshot_id;
      if v_snapshot_id is null then
        select snapshot.id into strict v_snapshot_id
        from private.market_snapshots as snapshot
        where snapshot.event_id = v_event_id
          and snapshot.book_key = lower(v_market_json ->> 'sourceBook')
          and snapshot.market_type = upper(v_market_json ->> 'marketType')
          and snapshot.outcome_key = upper(v_market_json ->> 'outcomeKey')
          and snapshot.line_milli is not distinct from v_line_milli
          and snapshot.payload_hash = encode(extensions.digest((v_event_json ->> 'externalEventId') || ':' || v_market_json::text, 'sha256'), 'hex');
      end if;
      insert into private.slate_items (slate_id, event_id, market_snapshot_id, week_id, league_id)
      values (v_slate_id, v_event_id, v_snapshot_id, v_week_id, p_league_id);
    end loop;
  end loop;

  insert into private.playoff_round_publications (
    id, playoff_publication_id, season_id, league_id, week_id,
    live_odds_import_id, nfl_week, stage_scope, selected_external_event_ids,
    participant_entry_ids, matchups_json, source_result_version_ids,
    input_hash, created_by, published_at, version, supersedes_id
  ) values (
    v_round_id, v_publication.id, v_season.id, p_league_id, v_week_id,
    v_import.id, v_next_week, v_round ->> 'stageScope', v_selected_event_ids,
    (
      select array_agg(participant.value::uuid order by participant.ordinality)
      from jsonb_array_elements_text(v_round -> 'participantEntryIds')
        with ordinality as participant(value, ordinality)
    ),
    v_round -> 'games', v_source_result_ids, v_input_hash, v_user_id, v_published_at,
    v_round_version, v_superseded_round.id
  );
  insert into private.matchups (
    week_id, season_id, league_id, schedule_publication_id,
    playoff_round_publication_id, side_a_entry_id, side_b_entry_id,
    scope, postseason_role, display_order
  )
  select
    v_week_id, v_season.id, p_league_id, null, v_round_id,
    (game.value #>> '{sideA,entryId}')::uuid, (game.value #>> '{sideB,entryId}')::uuid,
    case game.value ->> 'role' when 'CHAMPIONSHIP' then 'PLAYOFF'
      when 'EXHIBITION' then 'EXHIBITION' else 'PLACEMENT' end,
    game.value ->> 'role', game.ordinality::integer
  from jsonb_array_elements(v_round -> 'games') with ordinality as game(value, ordinality)
  order by game.ordinality;
  get diagnostics v_matchup_count = row_count;
  insert into private.weekly_cards (
    week_id, season_id, league_id, entry_id, owner_user_id, granted_credits, granted_at
  )
  select v_week_id, v_season.id, p_league_id, entry.id, entry.user_id, 1000, v_published_at
  from private.season_entries as entry where entry.season_id = v_season.id
  order by entry.id on conflict (week_id, entry_id) do nothing;
  select count(*) into v_card_count from private.weekly_cards as card where card.week_id = v_week_id;
  if v_matchup_count <> v_publication.roster_size / 2 or v_card_count <> v_publication.roster_size
    or exists (select 1 from private.matchups as matchup where matchup.playoff_round_publication_id = v_round_id and matchup.postseason_role is null) then
    raise exception using errcode = '55000', message = 'The postseason round did not materialize one matchup and card per member.';
  end if;

  v_response := jsonb_build_object(
    'leagueId', p_league_id, 'seasonId', v_season.id,
    'playoffPublicationId', v_publication.id, 'playoffVersion', v_publication.version,
    'roundPublicationId', v_round_id, 'roundVersion', v_round_version,
    'supersedesRoundId', v_superseded_round.id, 'weekId', v_week_id,
    'slateId', v_slate_id, 'importId', v_import.id, 'week', v_next_week,
    'scope', v_round ->> 'stageScope', 'eventCount', v_selected_count,
    'marketCount', v_selected_count * 6, 'matchupCount', v_matchup_count,
    'cardCount', v_card_count, 'grantedCreditsPerEntry', 1000,
    'commonLockAt', v_common_lock_at, 'publishedAt', v_published_at,
    'inputHash', v_input_hash, 'weekState', v_week.state
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key, request_hash, response_json
  ) values (p_league_id, v_user_id, 'PUBLISH_POSTSEASON_WEEK', p_idempotency_key, v_request_hash, v_response);
  return v_response;
end;
$$;

revoke all on function api.publish_postseason_week(uuid, uuid, text[], text) from public, anon;
grant execute on function api.publish_postseason_week(uuid, uuid, text[], text) to authenticated;

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
  select league.* into strict v_league from private.leagues as league where league.slug = lower(p_league_slug);
  if not private.is_league_member(v_league.id) then
    raise exception using errcode = '42501', message = 'League membership required.';
  end if;
  select season.* into strict v_season from private.seasons as season
  where season.league_id = v_league.id and season.mode = 'LIVE'
  order by season.created_at desc, season.id desc limit 1;
  if exists (
    select 1 from private.playoff_publications as child
    join private.playoff_publications as parent on parent.id = child.supersedes_id
    where child.season_id = v_season.id and parent.season_id <> child.season_id
  ) or (
    select count(*) from private.playoff_publications as candidate
    where candidate.season_id = v_season.id
      and not exists (select 1 from private.playoff_publications as successor where successor.supersedes_id = candidate.id)
  ) > 1 then
    raise exception using errcode = '55000', message = 'The qualification lineage has competing terminal versions.';
  end if;
  select publication.* into v_publication from private.playoff_publications as publication
  where publication.season_id = v_season.id
    and not exists (select 1 from private.playoff_publications as successor where successor.supersedes_id = publication.id);
  if v_publication.id is null then return null; end if;
  if exists (
    select 1 from private.playoff_round_publications as child
    join private.playoff_round_publications as parent on parent.id = child.supersedes_id
    where child.season_id = v_season.id
      and (parent.season_id <> child.season_id or parent.nfl_week <> child.nfl_week)
  ) or exists (
    select 1 from private.playoff_round_publications as candidate
    where candidate.season_id = v_season.id
      and not exists (select 1 from private.playoff_round_publications as successor where successor.supersedes_id = candidate.id)
    group by candidate.nfl_week having count(*) > 1
  ) then
    raise exception using errcode = '55000', message = 'A postseason week has competing terminal round versions.';
  end if;

  return jsonb_build_object(
    'league', jsonb_build_object(
      'id', v_league.id, 'name', v_league.name, 'slug', v_league.slug,
      'nflYear', v_season.nfl_year, 'lifecycle', v_season.lifecycle
    ),
    'publication', jsonb_build_object(
      'id', v_publication.id, 'version', v_publication.version,
      'supersedesId', v_publication.supersedes_id,
      'publishedAt', v_publication.published_at, 'inputHash', v_publication.input_hash,
      'sourceResultVersionIds', to_jsonb(v_publication.source_result_version_ids),
      'rosterSize', v_publication.roster_size,
      'expectedQualifierCount', v_publication.expected_qualifier_count,
      'actualQualifierCount', jsonb_array_length(v_publication.qualifiers),
      'standings', v_publication.standings_json, 'qualifiers', v_publication.qualifiers,
      'bracket', coalesce(v_publication.bracket_state, v_publication.bracket_json),
      'legacy', v_publication.bracket_state is null,
      'tieRule', 'Higher qualification seed advances an exact championship tie or dual incompletion',
      'attendanceMissLimit', 3,
      'correctionEvidence', jsonb_build_object(
        'effectiveVersion', v_publication.version,
        'supersedesVersionId', v_publication.supersedes_id,
        'priorVersionCount', v_publication.version - 1,
        'sourceResultVersionIds', to_jsonb(v_publication.source_result_version_ids)
      )
    ),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', round.id, 'version', round.version, 'supersedesId', round.supersedes_id,
        'week', round.nfl_week, 'scope', round.stage_scope, 'state', week.state,
        'commonLockAt', week.common_lock_at, 'publishedAt', round.published_at,
        'inputHash', round.input_hash,
        'sourceResultVersionIds', to_jsonb(round.source_result_version_ids),
        'matchups', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', matchup.id, 'game', matchup.display_order,
            'role', matchup.postseason_role,
            'scope', matchup.scope,
            'label', round.matchups_json #>> array[(matchup.display_order - 1)::text, 'label'],
            'byeExhibition', coalesce((round.matchups_json #>> array[(matchup.display_order - 1)::text, 'byeExhibition'])::boolean, false),
            'sideA', jsonb_build_object(
              'entryId', matchup.side_a_entry_id, 'displayName', side_a_profile.display_name,
              'qualificationSeed', private.playoff_qualification_seed(v_publication.id, matchup.side_a_entry_id)
            ),
            'sideB', jsonb_build_object(
              'entryId', matchup.side_b_entry_id, 'displayName', side_b_profile.display_name,
              'qualificationSeed', private.playoff_qualification_seed(v_publication.id, matchup.side_b_entry_id)
            ),
            'result', case when result.id is null then null else jsonb_build_object(
              'id', result.id, 'status', result.status,
              'sideADecision', case when matchup.postseason_role <> 'CHAMPIONSHIP'
                and (side_a_score.compliance = 'INCOMPLETE' or side_b_score.compliance = 'INCOMPLETE') then null else result.side_a_decision end,
              'sideBDecision', case when matchup.postseason_role <> 'CHAMPIONSHIP'
                and (side_a_score.compliance = 'INCOMPLETE' or side_b_score.compliance = 'INCOMPLETE') then null else result.side_b_decision end,
              'sideAScoreCenticredits', result.side_a_points_for_centicredits,
              'sideBScoreCenticredits', result.side_b_points_for_centicredits,
              'sideAParticipation', case when matchup.postseason_role <> 'CHAMPIONSHIP' and side_a_score.compliance = 'INCOMPLETE' then 'EXHIBITION_MISS' else 'COMPLETED' end,
              'sideBParticipation', case when matchup.postseason_role <> 'CHAMPIONSHIP' and side_b_score.compliance = 'INCOMPLETE' then 'EXHIBITION_MISS' else 'COMPLETED' end,
              'advancingEntryId', case when result.status = 'FINAL' and matchup.postseason_role = 'CHAMPIONSHIP'
                then private.phase8_championship_outcome(matchup.id, v_publication.id) #>> '{winner,entryId}' else null end
            ) end
          ) order by matchup.display_order)
          from private.matchups as matchup
          join private.season_entries as side_a_entry on side_a_entry.id = matchup.side_a_entry_id
          join private.profiles as side_a_profile on side_a_profile.id = side_a_entry.user_id
          join private.season_entries as side_b_entry on side_b_entry.id = matchup.side_b_entry_id
          join private.profiles as side_b_profile on side_b_profile.id = side_b_entry.user_id
          left join lateral (
            select candidate.* from private.matchup_result_versions as candidate
            where candidate.matchup_id = matchup.id
              and not exists (select 1 from private.matchup_result_versions as successor where successor.supersedes_id = candidate.id)
            limit 1
          ) as result on true
          left join private.weekly_score_versions as side_a_score on side_a_score.id = result.side_a_score_version_id
          left join private.weekly_score_versions as side_b_score on side_b_score.id = result.side_b_score_version_id
          where matchup.playoff_round_publication_id = round.id
        ), '[]'::jsonb)
      ) order by round.nfl_week)
      from private.playoff_round_publications as round
      join private.season_weeks as week on week.id = round.week_id
      where round.season_id = v_season.id
        and round.playoff_publication_id = v_publication.id
        and not exists (select 1 from private.playoff_round_publications as successor where successor.supersedes_id = round.id)
    ), '[]'::jsonb),
    'viewer', jsonb_build_object('userId', v_user_id, 'isCommissioner', private.is_league_commissioner(v_league.id))
  );
end;
$$;

revoke all on function api.get_playoff_state(text) from public, anon;
grant execute on function api.get_playoff_state(text) to authenticated;

-- Live-named entry points remain compatibility aliases only. The qualification,
-- pairing, and advancement implementations live exclusively behind the new RPCs.
create or replace function api.publish_live_playoff_qualification(p_league_id uuid, p_idempotency_key text)
returns jsonb language sql security invoker set search_path = ''
as $$ select api.publish_playoff_qualification(p_league_id, p_idempotency_key); $$;
create or replace function api.publish_next_live_postseason_week(
  p_league_id uuid, p_import_id uuid, p_external_event_ids text[], p_idempotency_key text
)
returns jsonb language sql security invoker set search_path = ''
as $$ select api.publish_postseason_week(p_league_id, p_import_id, p_external_event_ids, p_idempotency_key); $$;
create or replace function api.get_live_playoff_state(p_league_slug text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select api.get_playoff_state(p_league_slug); $$;

revoke all on function api.publish_live_playoff_qualification(uuid, text) from public, anon;
grant execute on function api.publish_live_playoff_qualification(uuid, text) to authenticated;
revoke all on function api.publish_next_live_postseason_week(uuid, uuid, text[], text) from public, anon;
grant execute on function api.publish_next_live_postseason_week(uuid, uuid, text[], text) to authenticated;
revoke all on function api.get_live_playoff_state(text) from public, anon;
grant execute on function api.get_live_playoff_state(text) to authenticated;

-- Keep the existing card/settlement implementation, but make every generic
-- matchup selector ignore superseded postseason materializations.
do $migration$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef('private.recompute_stage1_week(uuid,uuid)'::regprocedure) into v_definition;
  v_old := 'where matchup.week_id = p_week_id';
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) < 2 then
    raise exception 'recompute_stage1_week matchup selectors changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old,
    v_old || E'\n      and private.is_effective_postseason_matchup(matchup.id)');
  v_old := E'from private.matchups\n  where week_id = p_week_id;';
  v_new := E'from private.matchups as counted_matchup\n  where counted_matchup.week_id = p_week_id\n    and private.is_effective_postseason_matchup(counted_matchup.id);';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'recompute_stage1_week matchup count changed; migration refused';
  end if;
  execute replace(v_definition, v_old, v_new);

  select pg_get_functiondef('api.get_stage1_state(text)'::regprocedure) into v_definition;
  v_old := 'where matchup.week_id = v_week.id';
  if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) < 2 then
    raise exception 'get_stage1_state matchup selectors changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old,
    v_old || E'\n        and private.is_effective_postseason_matchup(matchup.id)');
  v_old := E'''scope'', matchup.scope,\n          ''sideAEntryId'', matchup.side_a_entry_id,';
  v_new := E'''scope'', matchup.scope,\n          ''postseasonRole'', matchup.postseason_role,\n          ''sideAEntryId'', matchup.side_a_entry_id,';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'get_stage1_state schedule role projection changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := E'''id'', v_matchup.id,\n      ''selfEntryId'', v_entry.id,';
  v_new := E'''id'', v_matchup.id,\n      ''postseasonRole'', v_matchup.postseason_role,\n      ''selfEntryId'', v_entry.id,';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'get_stage1_state matchup role projection changed; migration refused';
  end if;
  execute replace(v_definition, v_old, v_new);

  select pg_get_functiondef('api.get_weekly_close_state(text)'::regprocedure) into v_definition;
  v_old := E'''scope'', matchup.scope,\n          ''displayOrder'', matchup.display_order,';
  v_new := E'''scope'', matchup.scope,\n          ''postseasonRole'', matchup.postseason_role,\n          ''displayOrder'', matchup.display_order,';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'get_weekly_close_state matchup projection changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := E'''sideADecision'', result.side_a_decision,\n            ''sideBDecision'', result.side_b_decision,';
  v_new := E'''sideADecision'', result.side_a_decision,\n            ''sideBDecision'', result.side_b_decision,\n            ''sideAParticipation'', case when matchup.postseason_role <> ''CHAMPIONSHIP'' and (\n              select score.compliance from private.weekly_score_versions as score where score.id = result.side_a_score_version_id\n            ) = ''INCOMPLETE'' then ''EXHIBITION_MISS'' else ''COMPLETED'' end,\n            ''sideBParticipation'', case when matchup.postseason_role <> ''CHAMPIONSHIP'' and (\n              select score.compliance from private.weekly_score_versions as score where score.id = result.side_b_score_version_id\n            ) = ''INCOMPLETE'' then ''EXHIBITION_MISS'' else ''COMPLETED'' end,';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'get_weekly_close_state result projection changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  v_old := 'where matchup.league_id = v_league.id';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'get_weekly_close_state matchup filter changed; migration refused';
  end if;
  v_definition := replace(v_definition, v_old,
    v_old || E'\n        and private.is_effective_postseason_matchup(matchup.id)');
  v_old := E'where publication.season_id = v_season.id\n        and publication.league_id = v_league.id\n      limit 1';
  v_new := E'where publication.season_id = v_season.id\n        and publication.league_id = v_league.id\n        and not exists (\n          select 1 from private.playoff_publications as successor\n          where successor.supersedes_id = publication.id\n        )\n      limit 1';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'get_weekly_close_state playoff field selector changed; migration refused';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;
