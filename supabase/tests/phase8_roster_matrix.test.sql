begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email)
values (
  'd1000000-0000-4000-8000-000000000001',
  'phase8-roster-matrix-commissioner@example.test'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

create temporary table phase8_roster_matrix (
  roster_size integer primary key,
  league_id uuid not null,
  season_id uuid not null,
  slug text not null unique
);

create or replace function pg_temp.phase8_roster_import(
  p_league_id uuid,
  p_slug text,
  p_week integer
)
returns uuid
language plpgsql
volatile
as $$
declare
  v_external_id text := p_slug || '-week-' || p_week::text;
  v_import_id uuid;
  -- Live publication uses the transaction-stable season clock. Keep the
  -- provider observation on that same trusted clock even though this matrix
  -- exercises many leagues inside one pgTAP transaction.
  v_observed_at timestamptz := now();
begin
  select (api.store_live_odds_import(
    p_league_id,
    jsonb_build_object(
      'source', 'THE_ODDS_API',
      'fetchedAt', v_observed_at,
      'events', jsonb_build_array(jsonb_build_object(
        'source', 'THE_ODDS_API',
        'externalEventId', v_external_id,
        'sportKey', 'americanfootball_nfl',
        'awayTeam', 'Buffalo Bills',
        'homeTeam', 'New York Jets',
        'scheduledStartAt', v_observed_at + interval '30 minutes',
        'markets', jsonb_build_array(
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'MONEYLINE',
            'outcomeKey', 'AWAY', 'proposition', 'Buffalo Bills to win',
            'lineMilli', null, 'americanOdds', -160, 'observedAt', v_observed_at
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'MONEYLINE',
            'outcomeKey', 'HOME', 'proposition', 'New York Jets to win',
            'lineMilli', null, 'americanOdds', 140, 'observedAt', v_observed_at
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'SPREAD',
            'outcomeKey', 'AWAY', 'proposition', 'Buffalo Bills -3.5',
            'lineMilli', -3500, 'americanOdds', -110, 'observedAt', v_observed_at
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'SPREAD',
            'outcomeKey', 'HOME', 'proposition', 'New York Jets +3.5',
            'lineMilli', 3500, 'americanOdds', -110, 'observedAt', v_observed_at
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'TOTAL',
            'outcomeKey', 'OVER', 'proposition', 'Over 44.5',
            'lineMilli', 44500, 'americanOdds', -110, 'observedAt', v_observed_at
          ),
          jsonb_build_object(
            'sourceBook', 'draftkings', 'marketType', 'TOTAL',
            'outcomeKey', 'UNDER', 'proposition', 'Under 44.5',
            'lineMilli', 44500, 'americanOdds', -110, 'observedAt', v_observed_at
          )
        )
      ))
    ),
    p_slug || '-import-' || p_week::text
  ) ->> 'importId')::uuid into strict v_import_id;
  return v_import_id;
end;
$$;

create or replace function pg_temp.phase8_close_matrix_week(
  p_season_id uuid,
  p_week integer
)
returns void
language plpgsql
volatile
as $$
declare
  v_week private.season_weeks%rowtype;
begin
  select week.* into strict v_week
  from private.season_weeks as week
  where week.season_id = p_season_id and week.nfl_week = p_week;

  update private.weekly_cards
  set compliance = 'INCOMPLETE', locked_at = clock_timestamp()
  where week_id = v_week.id;

  insert into private.weekly_score_versions (
    card_id, week_id, league_id, entry_id, input_hash, compliance,
    score_centicredits, is_complete, status
  )
  select
    card.id, card.week_id, card.league_id, card.entry_id,
    encode(extensions.digest(card.id::text || ':matrix-final', 'sha256'), 'hex'),
    'INCOMPLETE', 0, false, 'FINAL'
  from private.weekly_cards as card
  where card.week_id = v_week.id;

  insert into private.matchup_result_versions (
    matchup_id, week_id, league_id, side_a_score_version_id,
    side_b_score_version_id, side_a_decision, side_b_decision,
    side_a_points_for_centicredits, side_b_points_for_centicredits,
    input_hash, status
  )
  select
    matchup.id, matchup.week_id, matchup.league_id,
    side_a_score.id, side_b_score.id,
    case when matchup.postseason_role = 'THIRD_PLACE' then 'TIE' else 'LOSS' end,
    case when matchup.postseason_role = 'THIRD_PLACE' then 'TIE' else 'LOSS' end,
    0, 0,
    encode(extensions.digest(matchup.id::text || ':matrix-final', 'sha256'), 'hex'),
    'FINAL'
  from private.matchups as matchup
  join private.weekly_score_versions as side_a_score
    on side_a_score.week_id = matchup.week_id
   and side_a_score.entry_id = matchup.side_a_entry_id
   and side_a_score.status = 'FINAL'
  join private.weekly_score_versions as side_b_score
    on side_b_score.week_id = matchup.week_id
   and side_b_score.entry_id = matchup.side_b_entry_id
   and side_b_score.status = 'FINAL'
  where matchup.week_id = v_week.id;

  update private.season_weeks
  set state = 'FINAL',
      locked_at = clock_timestamp(),
      correction_window_closes_at = clock_timestamp() - interval '1 second'
  where id = v_week.id;
end;
$$;

do $matrix$
declare
  v_roster_size integer;
  v_seed integer;
  v_slug text;
  v_user_id uuid;
  v_league_id uuid;
  v_season_id uuid;
  v_week_id uuid;
  v_import_id uuid;
begin
  foreach v_roster_size in array array[4, 6, 8, 10, 12, 14, 16] loop
    v_slug := 'phase8-roster-' || v_roster_size::text;
    perform api.create_league(
      'Phase 8 roster ' || v_roster_size::text,
      v_slug,
      'LIVE',
      2026
    );

    select league.id, season.id into strict v_league_id, v_season_id
    from private.leagues as league
    join private.seasons as season on season.league_id = league.id
    where league.slug = v_slug
    order by season.created_at desc, season.id desc
    limit 1;

    for v_seed in 2..v_roster_size loop
      v_user_id := md5(v_slug || ':member:' || v_seed::text)::uuid;
      insert into auth.users (id, email)
      values (v_user_id, v_slug || '-member-' || v_seed::text || '@example.test');
      insert into private.profiles (id, display_name)
      values (v_user_id, 'Roster ' || v_roster_size::text || ' Seed ' || v_seed::text);
      insert into private.league_memberships (league_id, user_id, role)
      values (v_league_id, v_user_id, 'MEMBER');
      insert into private.season_entries (
        season_id, league_id, user_id, standing_tiebreak
      ) values (
        v_season_id, v_league_id, v_user_id,
        encode(extensions.digest(v_season_id::text || v_user_id::text, 'sha256'), 'hex')
      );
    end loop;

    update private.season_ruleset_snapshots
    set frozen_at = clock_timestamp()
    where id = (
      select ruleset_snapshot_id from private.seasons where id = v_season_id
    );
    update private.seasons
    set lifecycle = 'REGULAR',
        roster_locked_at = clock_timestamp()
    where id = v_season_id;

    v_week_id := gen_random_uuid();
    insert into private.season_weeks (
      id, season_id, league_id, nfl_week, scope, state, opens_at,
      common_lock_at, locked_at, correction_window_closes_at
    ) values (
      v_week_id, v_season_id, v_league_id, 14, 'REGULAR', 'FINAL',
      clock_timestamp() - interval '2 days',
      clock_timestamp() - interval '1 day',
      clock_timestamp() - interval '1 day',
      clock_timestamp() - interval '1 hour'
    );

    insert into private.standings_snapshots (
      season_id, week_id, league_id, through_week, ordered_rows,
      input_hash, status
    )
    select
      v_season_id, v_week_id, v_league_id, 14,
      jsonb_agg(jsonb_build_object(
        'seed', standing.seed,
        'entryId', standing.entry_id,
        'displayName', standing.display_name,
        'wins', v_roster_size - standing.seed,
        'losses', standing.seed,
        'ties', 0,
        'pointsForCenticredits', 2000000 - standing.seed * 10000,
        'allPlayHalfWinUnits', 200 - standing.seed,
        'allPlayComparisonCount', 126,
        'attendanceMisses', 0,
        'highestWeekCenticredits', 200000 - standing.seed * 1000,
        'deterministicTiebreak', lpad(standing.seed::text, 64, '0')
      ) order by standing.seed),
      encode(extensions.digest(v_slug || ':week14', 'sha256'), 'hex'),
      'FINAL'
    from (
      select
        row_number() over (order by entry.id)::integer as seed,
        entry.id as entry_id,
        profile.display_name
      from private.season_entries as entry
      join private.profiles as profile on profile.id = entry.user_id
      where entry.season_id = v_season_id
    ) as standing;

    perform api.publish_playoff_qualification(
      v_league_id,
      v_slug || '-qualification'
    );

    for v_seed in 15..17 loop
      v_import_id := pg_temp.phase8_roster_import(v_league_id, v_slug, v_seed);
      perform api.publish_postseason_week(
        v_league_id,
        v_import_id,
        array[v_slug || '-week-' || v_seed::text],
        v_slug || '-publish-' || v_seed::text
      );
      perform pg_temp.phase8_close_matrix_week(v_season_id, v_seed);
    end loop;

    perform api.finalize_champion_bracket(
      v_league_id,
      v_slug || '-champion-final'
    );
    v_import_id := pg_temp.phase8_roster_import(v_league_id, v_slug, 18);
    perform api.publish_week18_exhibition(
      v_league_id,
      v_import_id,
      array[v_slug || '-week-18'],
      v_slug || '-publish-18'
    );

    insert into phase8_roster_matrix (roster_size, league_id, season_id, slug)
    values (v_roster_size, v_league_id, v_season_id, v_slug);
  end loop;
end;
$matrix$;

select ok(
  not exists (
    select 1
    from generate_series(15, 18) as expected(nfl_week)
    left join private.season_weeks as week
      on week.season_id = matrix.season_id
     and week.nfl_week = expected.nfl_week
    left join lateral (
      select count(*)::integer as count
      from private.weekly_cards as card where card.week_id = week.id
    ) as cards on true
    where cards.count is distinct from matrix.roster_size
  ),
  'roster ' || matrix.roster_size::text
    || ' receives exactly one card per member in Weeks 15 through 18'
)
from phase8_roster_matrix as matrix
order by matrix.roster_size;

select ok(
  not exists (
    select 1
    from generate_series(15, 18) as expected(nfl_week)
    join private.season_weeks as week
      on week.season_id = matrix.season_id
     and week.nfl_week = expected.nfl_week
    left join lateral (
      select
        count(*)::integer as matchup_count,
        count(distinct participant.entry_id)::integer as participant_count,
        bool_or(matchup.side_a_entry_id = matchup.side_b_entry_id) as has_self_pair
      from private.matchups as matchup
      cross join lateral (values
        (matchup.side_a_entry_id),
        (matchup.side_b_entry_id)
      ) as participant(entry_id)
      where matchup.week_id = week.id
        and private.is_effective_postseason_matchup(matchup.id)
    ) as participation on true
    where participation.matchup_count is distinct from matrix.roster_size / 2
       or participation.participant_count is distinct from matrix.roster_size
       or coalesce(participation.has_self_pair, false)
  ),
  'roster ' || matrix.roster_size::text
    || ' has one effective matchup appearance per member without self-pairs'
)
from phase8_roster_matrix as matrix
order by matrix.roster_size;

select ok(
  not exists (
    select 1
    from private.matchups as matchup
    join private.season_weeks as week on week.id = matchup.week_id
    where week.season_id = matrix.season_id
      and week.nfl_week between 15 and 18
      and matchup.postseason_role is null
  ),
  'roster ' || matrix.roster_size::text
    || ' stores an explicit role on every new postseason matchup'
)
from phase8_roster_matrix as matrix
order by matrix.roster_size;

select ok(
  not exists (
    select 1
    from private.season_weeks as week
    where week.season_id = matrix.season_id
      and week.nfl_week between 15 and 17
      and exists (
        select 1
        from private.matchups as advancing
        join private.matchups as remaining
          on remaining.week_id = advancing.week_id
        where advancing.week_id = week.id
          and advancing.postseason_role in ('CHAMPIONSHIP', 'THIRD_PLACE')
          and remaining.postseason_role in ('PLACEMENT', 'EXHIBITION')
          and advancing.display_order > remaining.display_order
      )
  ),
  'roster ' || matrix.roster_size::text
    || ' assigns championship and third-place games before remaining pairings'
)
from phase8_roster_matrix as matrix
order by matrix.roster_size;

select * from finish();
rollback;
