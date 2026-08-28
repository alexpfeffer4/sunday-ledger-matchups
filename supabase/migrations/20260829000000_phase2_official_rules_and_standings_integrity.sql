-- Phase 2 keeps the only creatable Rulesets in a private, migration-owned
-- allowlist. The member-facing create command receives no identity, JSON, or
-- digest from its caller.

create table private.authoritative_season_rulesets (
  mode text primary key check (mode in ('LIVE', 'SIMULATION')),
  ruleset_id text not null unique,
  ruleset_version text not null,
  product_bible_id text not null,
  product_bible_version text not null,
  canonical_json jsonb not null,
  sha256_hash text not null unique check (sha256_hash ~ '^[0-9a-f]{64}$'),
  check (canonical_json ->> 'mode' = mode),
  check (canonical_json ->> 'id' = ruleset_id),
  check (canonical_json ->> 'version' = ruleset_version),
  check (canonical_json ->> 'productBibleId' = product_bible_id),
  check (canonical_json ->> 'productBibleVersion' = product_bible_version)
);

alter table private.authoritative_season_rulesets enable row level security;
revoke all on table private.authoritative_season_rulesets
from public, anon, authenticated;

insert into private.authoritative_season_rulesets (
  mode,
  ruleset_id,
  ruleset_version,
  product_bible_id,
  product_bible_version,
  canonical_json,
  sha256_hash
)
values
  (
    'LIVE',
    'SUNDAY-LEDGER-POC-SEASON-RULESET-V1',
    '1.1',
    'SUNDAY-LEDGER-PRODUCT-BIBLE-V3',
    '3.0',
    $ruleset${"attendance":{"dualIncompleteDecisions":["LOSS","LOSS"],"incompleteCardDecision":"LOSS","incompleteCardMisses":1,"incompleteCardPointsForCenticredits":0,"playoffIneligibilityAtMisses":3},"card":{"acceptanceUnit":"WHOLE_CARD_ATOMIC","carryoverCredits":false,"irreversibleAction":"CONFIRM_AND_SEAL_CARD","maximumPositions":20,"minimumPositions":1,"minimumStakeCredits":50,"stakePrecision":"WHOLE_CREDITS","weeklyAllocationCredits":1000},"concentration":{"aggregateFavoriteExposureCapCredits":null,"eligibleOddsMaximum":null,"eligibleOddsMinimum":null,"heavyFavoriteSinglePositionCapCredits":750,"heavyFavoriteThresholdAmerican":-200,"standardSinglePositionCapCredits":1000,"status":"SETTLED_FOR_POC_V1"},"format":"SUNDAY_LEDGER_MATCHUPS","id":"SUNDAY-LEDGER-POC-SEASON-RULESET-V1","markets":{"eligible":["MONEYLINE","SPREAD","TOTAL"],"referenceBook":"draftkings"},"mode":"LIVE","playoffs":{"higherSeedAdvancesExactTie":true,"largeLeagueQualifiers":6,"smallLeagueMaximumSize":8,"smallLeagueQualifiers":4},"productBibleId":"SUNDAY-LEDGER-PRODUCT-BIBLE-V3","productBibleVersion":"3.0","roster":{"creationPreselection":10,"supportedSizes":[4,6,8,10,12,14,16]},"schedule":{"championshipWeek":17,"exhibitionWeek":18,"postseasonStartWeek":15,"regularSeasonWeeks":14},"seasonLabel":"POC Season 1","settlement":{"correctionWindowHours":24,"lossReturn":"ZERO","postponementWindowHours":48,"precisionCenticredits":1,"pushVoidReturn":"STAKE","rounding":"HALF_UP","winReturn":"STAKE_PLUS_PROFIT"},"slate":{"commonLockOffsetMinutes":5,"earlyGamesRequireCommissionerSelection":true,"includesMondayNight":true,"revealTrigger":"EVENT_START","standardSundayStartHourEastern":13},"sport":"NFL","standings":{"tiebreakOrder":["MATCHUP_WIN_PERCENTAGE","POINTS_FOR","ALL_PLAY_PERCENTAGE","BALANCED_HEAD_TO_HEAD","FEWER_ATTENDANCE_MISSES","HIGHEST_SINGLE_WEEK_SCORE","STORED_DETERMINISTIC_RANDOM"]},"version":"1.1"}$ruleset$::jsonb,
    '4bba08222402fbe24f706cbb5c6bd7b9aa7c50da5bc8c039f7929aaf4cfcb629'
  ),
  (
    'SIMULATION',
    'SUNDAY-LEDGER-SIMULATION-SEASON-RULESET-V1',
    '1.1',
    'SUNDAY-LEDGER-PRODUCT-BIBLE-V3',
    '3.0',
    $ruleset${"attendance":{"dualIncompleteDecisions":["LOSS","LOSS"],"incompleteCardDecision":"LOSS","incompleteCardMisses":1,"incompleteCardPointsForCenticredits":0,"playoffIneligibilityAtMisses":3},"card":{"acceptanceUnit":"WHOLE_CARD_ATOMIC","carryoverCredits":false,"irreversibleAction":"CONFIRM_AND_SEAL_CARD","maximumPositions":20,"minimumPositions":1,"minimumStakeCredits":50,"stakePrecision":"WHOLE_CREDITS","weeklyAllocationCredits":1000},"concentration":{"aggregateFavoriteExposureCapCredits":null,"eligibleOddsMaximum":null,"eligibleOddsMinimum":null,"heavyFavoriteSinglePositionCapCredits":750,"heavyFavoriteThresholdAmerican":-200,"standardSinglePositionCapCredits":1000,"status":"SETTLED_FOR_POC_V1"},"format":"SUNDAY_LEDGER_MATCHUPS","id":"SUNDAY-LEDGER-SIMULATION-SEASON-RULESET-V1","markets":{"eligible":["MONEYLINE","SPREAD","TOTAL"],"referenceBook":"draftkings"},"mode":"SIMULATION","playoffs":{"higherSeedAdvancesExactTie":true,"largeLeagueQualifiers":6,"smallLeagueMaximumSize":8,"smallLeagueQualifiers":4},"productBibleId":"SUNDAY-LEDGER-PRODUCT-BIBLE-V3","productBibleVersion":"3.0","roster":{"creationPreselection":10,"supportedSizes":[4,6,8,10,12,14,16]},"schedule":{"championshipWeek":17,"exhibitionWeek":18,"postseasonStartWeek":15,"regularSeasonWeeks":14},"seasonLabel":"POC Season 1 · Simulation","settlement":{"correctionWindowHours":24,"lossReturn":"ZERO","postponementWindowHours":48,"precisionCenticredits":1,"pushVoidReturn":"STAKE","rounding":"HALF_UP","winReturn":"STAKE_PLUS_PROFIT"},"slate":{"commonLockOffsetMinutes":5,"earlyGamesRequireCommissionerSelection":true,"includesMondayNight":true,"revealTrigger":"EVENT_START","standardSundayStartHourEastern":13},"sport":"NFL","standings":{"tiebreakOrder":["MATCHUP_WIN_PERCENTAGE","POINTS_FOR","ALL_PLAY_PERCENTAGE","BALANCED_HEAD_TO_HEAD","FEWER_ATTENDANCE_MISSES","HIGHEST_SINGLE_WEEK_SCORE","STORED_DETERMINISTIC_RANDOM"]},"version":"1.1"}$ruleset$::jsonb,
    'dc9a63b54eba31536518b319e5d88889dae0ac9d71e3f37630fa6e1a786e36ff'
  );

-- The owner decision applies V1.1 to snapshots that have not frozen. Promote
-- only exact V1.0 application snapshots; a caller-forged draft is not trusted.
update private.season_ruleset_snapshots as snapshot
set
  ruleset_id = authoritative.ruleset_id,
  ruleset_version = authoritative.ruleset_version,
  product_bible_id = authoritative.product_bible_id,
  product_bible_version = authoritative.product_bible_version,
  canonical_json = authoritative.canonical_json,
  sha256_hash = authoritative.sha256_hash,
  published_at = clock_timestamp()
from private.authoritative_season_rulesets as authoritative
where snapshot.frozen_at is null
  and snapshot.mode = authoritative.mode
  and snapshot.ruleset_id = authoritative.ruleset_id
  and snapshot.ruleset_version = '1.0'
  and snapshot.product_bible_id = authoritative.product_bible_id
  and snapshot.product_bible_version = authoritative.product_bible_version
  and snapshot.sha256_hash = case snapshot.mode
    when 'LIVE' then '4665600e28e386f17c0e56ad4aa5ab2b511363073f12fd57927424ae1716d108'
    when 'SIMULATION' then '8a751226b44b608dd0e4400a1785d747d21df82e1df16494544428a3b4019e0a'
  end
  and snapshot.canonical_json = jsonb_set(
    authoritative.canonical_json
      #- '{standings}'
      #- '{concentration,status}'
      #- '{card,carryoverCredits}'
      #- '{card,acceptanceUnit}'
      #- '{card,irreversibleAction}'
      #- '{slate,revealTrigger}'
      #- '{settlement,winReturn}'
      #- '{settlement,lossReturn}'
      #- '{settlement,pushVoidReturn}'
      #- '{attendance,incompleteCardDecision}'
      #- '{attendance,incompleteCardPointsForCenticredits}'
      #- '{attendance,incompleteCardMisses}'
      #- '{attendance,dualIncompleteDecisions}',
    '{version}',
    '"1.0"'::jsonb
  );

create or replace function private.guard_frozen_ruleset()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.frozen_at is not null then
    raise exception using
      errcode = '55000',
      message = 'A frozen season ruleset snapshot is immutable.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if old.frozen_at is null and new.frozen_at is not null and not exists (
    select 1
    from private.authoritative_season_rulesets as authoritative
    where authoritative.mode = new.mode
      and authoritative.ruleset_id = new.ruleset_id
      and authoritative.ruleset_version = new.ruleset_version
      and authoritative.product_bible_id = new.product_bible_id
      and authoritative.product_bible_version = new.product_bible_version
      and authoritative.canonical_json = new.canonical_json
      and authoritative.sha256_hash = new.sha256_hash
  ) then
    raise exception using
      errcode = '55000',
      message = 'The season Ruleset is not an authoritative published snapshot.';
  end if;
  return new;
end;
$$;

revoke execute on function api.create_league(
  text, text, text, integer, text, text, text, text, jsonb, text
) from public, anon, authenticated;
drop function api.create_league(
  text, text, text, integer, text, text, text, text, jsonb, text
);

create function api.create_league(
  p_name text,
  p_slug text,
  p_mode text,
  p_nfl_year integer
)
returns table (league_id uuid, season_id uuid, league_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_league_id uuid := gen_random_uuid();
  v_snapshot_id uuid := gen_random_uuid();
  v_season_id uuid := gen_random_uuid();
  v_entry_id uuid := gen_random_uuid();
  v_mode text := upper(p_mode);
  v_slug text := lower(btrim(p_slug));
  v_roster_seed text := encode(extensions.gen_random_bytes(32), 'hex');
  v_ruleset private.authoritative_season_rulesets%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required.';
  end if;
  if v_mode not in ('LIVE', 'SIMULATION') then
    raise exception using errcode = '22023', message = 'Mode must be LIVE or SIMULATION.';
  end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'League slug is invalid.';
  end if;

  select authoritative.* into strict v_ruleset
  from private.authoritative_season_rulesets as authoritative
  where authoritative.mode = v_mode;

  insert into private.profiles (id, display_name)
  values (
    v_user_id,
    left(split_part(coalesce((select auth.jwt()) ->> 'email', 'Member'), '@', 1), 60)
  )
  on conflict (id) do nothing;

  insert into private.leagues (id, name, slug, created_by)
  values (v_league_id, btrim(p_name), v_slug, v_user_id);

  insert into private.league_memberships (league_id, user_id, role)
  values (v_league_id, v_user_id, 'COMMISSIONER');

  insert into private.season_ruleset_snapshots (
    id, ruleset_id, ruleset_version, product_bible_id,
    product_bible_version, mode, canonical_json, sha256_hash
  ) values (
    v_snapshot_id, v_ruleset.ruleset_id, v_ruleset.ruleset_version,
    v_ruleset.product_bible_id, v_ruleset.product_bible_version,
    v_ruleset.mode, v_ruleset.canonical_json, v_ruleset.sha256_hash
  );

  insert into private.seasons (
    id, league_id, ruleset_snapshot_id, mode, nfl_year,
    roster_seed, schedule_seed, simulated_now
  ) values (
    v_season_id, v_league_id, v_snapshot_id, v_mode, p_nfl_year,
    v_roster_seed, encode(extensions.gen_random_bytes(32), 'hex'),
    case when v_mode = 'SIMULATION' then now() else null end
  );

  insert into private.season_entries (
    id, season_id, league_id, user_id, standing_tiebreak
  ) values (
    v_entry_id, v_season_id, v_league_id, v_user_id,
    encode(
      extensions.digest(v_roster_seed || 'standings' || v_entry_id::text, 'sha256'),
      'hex'
    )
  );

  return query select v_league_id, v_season_id, v_slug;
end;
$$;

revoke execute on function api.create_league(text, text, text, integer)
from public, anon;
grant execute on function api.create_league(text, text, text, integer)
to authenticated;

create function api.get_season_ruleset(p_league_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'rulesetId', snapshot.ruleset_id,
    'rulesetVersion', snapshot.ruleset_version,
    'productBibleId', snapshot.product_bible_id,
    'productBibleVersion', snapshot.product_bible_version,
    'mode', snapshot.mode,
    'canonicalJson', snapshot.canonical_json,
    'sha256Hash', snapshot.sha256_hash,
    'publishedAt', snapshot.published_at,
    'frozenAt', snapshot.frozen_at
  )
  from private.leagues as league
  join private.seasons as season on season.league_id = league.id
  join private.season_ruleset_snapshots as snapshot
    on snapshot.id = season.ruleset_snapshot_id
  where league.slug = p_league_slug
    and (select private.is_league_member(league.id))
  limit 1;
$$;

revoke execute on function api.get_season_ruleset(text) from public, anon;
grant execute on function api.get_season_ruleset(text) to authenticated;

-- A mini-table is balanced only when every unordered pair is present and all
-- pair meeting counts are the same positive value. Equal per-member totals are
-- insufficient for groups larger than three.
create function private.head_to_head_group_is_balanced(
  p_group_size integer,
  p_pair_meeting_counts integer[]
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select coalesce(
    p_group_size > 1
      and cardinality(p_pair_meeting_counts)
        = (p_group_size * (p_group_size - 1)) / 2
      and p_pair_meeting_counts[1] > 0
      and not exists (
        select 1
        from unnest(p_pair_meeting_counts) as meeting_count(value)
        where meeting_count.value <> p_pair_meeting_counts[1]
      ),
    false
  );
$$;

revoke execute on function private.head_to_head_group_is_balanced(integer, integer[])
from public, anon, authenticated;

create or replace function private.build_regular_standings(p_week_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_week as (
    select week.season_id, week.nfl_week
    from private.season_weeks as week
    where week.id = p_week_id
      and week.scope = 'REGULAR'
  ), latest_matchup_results as (
    select distinct on (result.matchup_id)
      result.*,
      week.nfl_week
    from private.matchup_result_versions as result
    join private.matchups as matchup on matchup.id = result.matchup_id
    join private.season_weeks as week on week.id = matchup.week_id
    join current_week on current_week.season_id = week.season_id
    where week.scope = 'REGULAR'
      and week.nfl_week <= current_week.nfl_week
    order by result.matchup_id, result.created_at desc, result.id desc
  ), entry_results as (
    select
      matchup.side_a_entry_id as entry_id,
      matchup.side_b_entry_id as opponent_entry_id,
      result.nfl_week,
      result.side_a_decision as decision,
      result.side_a_points_for_centicredits as points_for_centicredits
    from latest_matchup_results as result
    join private.matchups as matchup on matchup.id = result.matchup_id
    union all
    select
      matchup.side_b_entry_id,
      matchup.side_a_entry_id,
      result.nfl_week,
      result.side_b_decision,
      result.side_b_points_for_centicredits
    from latest_matchup_results as result
    join private.matchups as matchup on matchup.id = result.matchup_id
  ), latest_scores as (
    select distinct on (score.week_id, score.entry_id)
      score.week_id,
      week.nfl_week,
      score.entry_id,
      score.compliance,
      score.score_centicredits
    from private.weekly_score_versions as score
    join private.season_weeks as week on week.id = score.week_id
    join current_week on current_week.season_id = week.season_id
    where week.scope = 'REGULAR'
      and week.nfl_week <= current_week.nfl_week
    order by score.week_id, score.entry_id, score.created_at desc, score.id desc
  ), all_play_weekly as (
    select
      score.entry_id,
      count(other.entry_id)::integer as comparison_count,
      coalesce(sum(
        case
          when score.score_centicredits > other.score_centicredits then 2
          when score.score_centicredits = other.score_centicredits then 1
          else 0
        end
      ), 0)::integer as half_win_units
    from latest_scores as score
    join latest_scores as other
      on other.week_id = score.week_id
     and other.entry_id <> score.entry_id
     and other.compliance = 'COMPLIANT'
    where score.compliance = 'COMPLIANT'
    group by score.week_id, score.entry_id
  ), all_play_totals as (
    select
      weekly.entry_id,
      sum(weekly.comparison_count)::integer as comparison_count,
      sum(weekly.half_win_units)::integer as half_win_units
    from all_play_weekly as weekly
    group by weekly.entry_id
  ), record_totals as (
    select
      entry.id as entry_id,
      profile.display_name,
      count(*) filter (where result.decision = 'WIN')::integer as wins,
      count(*) filter (where result.decision = 'LOSS')::integer as losses,
      count(*) filter (where result.decision = 'TIE')::integer as ties,
      coalesce(sum(result.points_for_centicredits), 0)::bigint as points_for_centicredits,
      count(*) filter (where score.compliance = 'INCOMPLETE')::integer as attendance_misses,
      coalesce(max(score.score_centicredits), 0)::bigint as highest_week_centicredits,
      coalesce(all_play.half_win_units, 0)::integer as all_play_half_win_units,
      coalesce(all_play.comparison_count, 0)::integer as all_play_comparison_count,
      entry.standing_tiebreak
    from current_week
    join private.season_entries as entry on entry.season_id = current_week.season_id
    join private.profiles as profile on profile.id = entry.user_id
    left join entry_results as result on result.entry_id = entry.id
    left join latest_scores as score on score.entry_id = entry.id
      and score.nfl_week = result.nfl_week
    left join all_play_totals as all_play on all_play.entry_id = entry.id
    group by
      entry.id,
      profile.display_name,
      entry.standing_tiebreak,
      all_play.half_win_units,
      all_play.comparison_count
  ), primary_metrics as (
    select
      totals.*,
      totals.wins + totals.losses + totals.ties as games,
      (totals.wins * 2 + totals.ties)::numeric
        / nullif((totals.wins + totals.losses + totals.ties) * 2, 0) as win_percentage,
      totals.all_play_half_win_units::numeric
        / nullif(totals.all_play_comparison_count * 2, 0) as all_play_percentage
    from record_totals as totals
  ), grouped as (
    select
      metrics.*,
      dense_rank() over (
        order by
          metrics.win_percentage desc nulls last,
          metrics.points_for_centicredits desc,
          metrics.all_play_percentage desc nulls last
      ) as primary_group,
      count(*) over (
        partition by
          metrics.win_percentage,
          metrics.points_for_centicredits,
          metrics.all_play_percentage
      )::integer as primary_group_size
    from primary_metrics as metrics
  ), head_to_head_totals as (
    select
      tied.primary_group,
      result.entry_id,
      count(*)::integer as comparison_count,
      sum(case result.decision when 'WIN' then 2 when 'TIE' then 1 else 0 end)::integer
        as half_win_units
    from grouped as tied
    join entry_results as result on result.entry_id = tied.entry_id
    join grouped as opponent
      on opponent.entry_id = result.opponent_entry_id
     and opponent.primary_group = tied.primary_group
    where tied.primary_group_size > 1
    group by tied.primary_group, result.entry_id
  ), head_to_head_pair_counts as (
    select
      tied.primary_group,
      result.entry_id as first_entry_id,
      result.opponent_entry_id as second_entry_id,
      count(*)::integer as meeting_count
    from grouped as tied
    join entry_results as result on result.entry_id = tied.entry_id
    join grouped as opponent
      on opponent.entry_id = result.opponent_entry_id
     and opponent.primary_group = tied.primary_group
    where tied.primary_group_size > 1
      and result.entry_id < result.opponent_entry_id
    group by
      tied.primary_group,
      result.entry_id,
      result.opponent_entry_id
  ), head_to_head_applicability as (
    select
      tied.primary_group,
      private.head_to_head_group_is_balanced(
        tied.primary_group_size,
        array_agg(pair.meeting_count order by pair.first_entry_id, pair.second_entry_id)
          filter (where pair.first_entry_id is not null)
      ) as applies
    from (
      select distinct primary_group, primary_group_size
      from grouped
      where primary_group_size > 1
    ) as tied
    left join head_to_head_pair_counts as pair
      on pair.primary_group = tied.primary_group
    group by tied.primary_group, tied.primary_group_size
  ), ranked as (
    select
      tied.*,
      coalesce(head_to_head.half_win_units, 0)::integer as head_to_head_half_win_units,
      coalesce(head_to_head.comparison_count, 0)::integer as head_to_head_comparison_count,
      coalesce(applicability.applies, false) as head_to_head_applied,
      row_number() over (
        order by
          tied.win_percentage desc nulls last,
          tied.points_for_centicredits desc,
          tied.all_play_percentage desc nulls last,
          case when applicability.applies then
            head_to_head.half_win_units::numeric
              / nullif(head_to_head.comparison_count * 2, 0)
          end desc nulls last,
          tied.attendance_misses asc,
          tied.highest_week_centicredits desc,
          tied.standing_tiebreak asc
      ) as seed
    from grouped as tied
    left join head_to_head_totals as head_to_head
      on head_to_head.primary_group = tied.primary_group
     and head_to_head.entry_id = tied.entry_id
    left join head_to_head_applicability as applicability
      on applicability.primary_group = tied.primary_group
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'seed', ranked.seed,
      'entryId', ranked.entry_id,
      'displayName', ranked.display_name,
      'wins', ranked.wins,
      'losses', ranked.losses,
      'ties', ranked.ties,
      'pointsForCenticredits', ranked.points_for_centicredits,
      'allPlayHalfWinUnits', ranked.all_play_half_win_units,
      'allPlayComparisonCount', ranked.all_play_comparison_count,
      'headToHeadApplied', ranked.head_to_head_applied,
      'headToHeadHalfWinUnits', ranked.head_to_head_half_win_units,
      'headToHeadComparisonCount', ranked.head_to_head_comparison_count,
      'attendanceMisses', ranked.attendance_misses,
      'highestWeekCenticredits', ranked.highest_week_centicredits,
      'deterministicTiebreak', ranked.standing_tiebreak
    ) order by ranked.seed
  ), '[]'::jsonb)
  from ranked;
$$;

revoke execute on function private.build_regular_standings(uuid)
from public, anon, authenticated;

notify pgrst, 'reload schema';
