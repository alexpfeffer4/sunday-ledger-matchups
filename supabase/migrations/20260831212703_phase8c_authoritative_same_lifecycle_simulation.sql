-- Phase 8C: authoritative Simulation uses the Live competitive lifecycle.
--
-- The only variable inputs accepted by the Simulation provider boundary are
-- an approved pack id, week, result step, and monotonic time. Teams, markets,
-- scores, corrections, cards, winners, standings, brackets, and archives are
-- never caller-authored by these commands.

alter table private.live_odds_imports
  drop constraint live_odds_imports_source_check;
alter table private.live_odds_imports
  add constraint live_odds_imports_source_check
  check (source in ('THE_ODDS_API', 'SIMULATION_FIXTURE'));

alter table private.live_score_imports
  drop constraint live_score_imports_source_check;
alter table private.live_score_imports
  add constraint live_score_imports_source_check
  check (source in ('THE_ODDS_API', 'SIMULATION_FIXTURE'));

create table private.simulation_fixture_manifests (
  pack_id text primary key,
  pack_version integer not null check (pack_version > 0),
  seed text not null,
  week_count integer not null check (week_count = 18),
  manifest_hash text not null unique check (manifest_hash ~ '^[0-9a-f]{64}$'),
  manifest_json jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(manifest_json) = 'object'),
  check (manifest_json ->> 'packId' = pack_id),
  check ((manifest_json ->> 'version')::integer = pack_version),
  check (manifest_json ->> 'seed' = seed),
  check (jsonb_array_length(manifest_json -> 'weeks') = week_count)
);

alter table private.simulation_fixture_manifests enable row level security;
revoke all on table private.simulation_fixture_manifests
from public, anon, authenticated;

create trigger simulation_fixture_manifests_append_only
before update or delete on private.simulation_fixture_manifests
for each row execute function private.reject_competitive_mutation();

do $fixture_seed$
declare
  v_teams constant text[] := array[
    'Arizona Firebirds', 'Atlanta Talons', 'Baltimore Admirals', 'Boston Harbors',
    'Buffalo Stampede', 'Carolina Copperheads', 'Chicago Union', 'Cincinnati Rivermen',
    'Cleveland Guardians', 'Dallas Wranglers', 'Denver Summit', 'Detroit Motors',
    'Houston Comets', 'Indianapolis Racers', 'Jacksonville Tritons', 'Kansas City Kings',
    'Las Vegas Outlaws', 'Los Angeles Stars', 'Memphis Hounds', 'Miami Breakers',
    'Minnesota Northmen', 'Nashville Sound', 'New England Minutemen', 'New Orleans Crescents',
    'New York Knights', 'Orlando Orbits', 'Philadelphia Founders', 'Phoenix Scorpions',
    'Pittsburgh Forge', 'San Francisco Gold', 'Seattle Evergreens', 'Washington Sentinels'
  ];
  v_week integer;
  v_event_index integer;
  v_kickoff timestamptz;
  v_observed_at timestamptz;
  v_final_at timestamptz;
  v_away text;
  v_home text;
  v_external_id text;
  v_away_spread integer;
  v_total integer;
  v_away_score integer;
  v_home_score integer;
  v_status text;
  v_events jsonb;
  v_weeks jsonb := '[]'::jsonb;
  v_versions jsonb;
  v_manifest jsonb;
begin
  for v_week in 1..18 loop
    v_events := '[]'::jsonb;
    for v_event_index in 0..7 loop
      v_kickoff := '2026-09-13 17:00:00+00'::timestamptz
        + make_interval(days => (v_week - 1) * 7)
        + make_interval(mins => (v_event_index % 4) * 65);
      v_observed_at := v_kickoff - interval '60 minutes';
      v_away := v_teams[1 + ((v_event_index * 2 + v_week - 1) % 32)];
      v_home := v_teams[1 + ((31 - v_event_index * 2 + v_week - 1) % 32)];
      v_external_id := 'sim26-w' || lpad(v_week::text, 2, '0')
        || '-e' || lpad((v_event_index + 1)::text, 2, '0') || '-'
        || substr(encode(extensions.digest(v_week::text || ':' || v_event_index::text, 'sha256'), 'hex'), 1, 8);
      v_away_spread := (case when (v_week + v_event_index) % 2 = 0 then -1 else 1 end)
        * (1000 + ((v_week * 3 + v_event_index) % 8) * 1000 +
          case when (v_week + v_event_index) % 2 = 0 then 500 else 0 end);
      v_total := (37000 + ((v_week * 5 + v_event_index * 3) % 17) * 1000 + 500);
      v_away_score := 10 + ((v_week * 7 + v_event_index * 5) % 28);
      v_home_score := 10 + ((v_week * 11 + v_event_index * 3) % 28);
      v_status := case
        when (v_week = 3 and v_event_index = 2)
          or (v_week = 7 and v_event_index = 3) then 'VOID'
        else 'FINAL'
      end;
      v_final_at := v_kickoff + case
        when v_week = 7 and v_event_index = 3 then interval '48 hours'
        else interval '3 hours 30 minutes'
      end;
      v_versions := jsonb_build_array(
        jsonb_build_object(
          'version', 1, 'availableAt', v_kickoff + interval '5 minutes',
          'status', 'LIVE', 'completed', false,
          'awayScore', 0, 'homeScore', 0,
          'reason', 'Scripted fixture event entered live state.'
        ),
        jsonb_build_object(
          'version', 2, 'availableAt', v_final_at,
          'status', v_status, 'completed', true,
          'awayScore', case when v_status = 'VOID' then null else v_away_score end,
          'homeScore', case when v_status = 'VOID' then null else v_home_score end,
          'reason', case
            when v_week = 7 and v_event_index = 3 then 'Scripted 48-hour postponement boundary expired.'
            when v_status = 'VOID' then 'Scripted provider void.'
            else 'Scripted final score became available.'
          end
        )
      );
      if (v_week = 8 and v_event_index = 4)
        or (v_week = 17 and v_event_index = 5) then
        v_versions := v_versions || jsonb_build_array(jsonb_build_object(
          'version', 3, 'availableAt', v_kickoff + interval '30 hours',
          'status', 'FINAL', 'completed', true,
          'awayScore', v_home_score, 'homeScore', v_away_score,
          'reason', case when v_week = 17
            then 'Scripted Week 17 objective correction.'
            else 'Scripted objective correction superseded the first final.' end
        ));
      end if;
      v_events := v_events || jsonb_build_array(jsonb_build_object(
        'source', 'SIMULATION_FIXTURE',
        'externalEventId', v_external_id,
        'sportKey', 'americanfootball_nfl',
        'awayTeam', v_away,
        'homeTeam', v_home,
        'scheduledStartAt', v_kickoff,
        'markets', jsonb_build_array(
          jsonb_build_object('sourceBook', 'draftkings', 'marketType', 'MONEYLINE', 'outcomeKey', 'AWAY', 'proposition', v_away || ' to win', 'lineMilli', null, 'americanOdds', case when v_away_spread < 0 then -150 - v_week - v_event_index else 125 + v_week + v_event_index end, 'observedAt', v_observed_at),
          jsonb_build_object('sourceBook', 'draftkings', 'marketType', 'MONEYLINE', 'outcomeKey', 'HOME', 'proposition', v_home || ' to win', 'lineMilli', null, 'americanOdds', case when v_away_spread > 0 then -150 - v_week - v_event_index else 125 + v_week + v_event_index end, 'observedAt', v_observed_at),
          jsonb_build_object('sourceBook', 'draftkings', 'marketType', 'SPREAD', 'outcomeKey', 'AWAY', 'proposition', v_away || ' spread', 'lineMilli', v_away_spread, 'americanOdds', -110, 'observedAt', v_observed_at),
          jsonb_build_object('sourceBook', 'draftkings', 'marketType', 'SPREAD', 'outcomeKey', 'HOME', 'proposition', v_home || ' spread', 'lineMilli', -v_away_spread, 'americanOdds', -110, 'observedAt', v_observed_at),
          jsonb_build_object('sourceBook', 'draftkings', 'marketType', 'TOTAL', 'outcomeKey', 'OVER', 'proposition', 'Over ' || (v_total / 1000.0)::text, 'lineMilli', v_total, 'americanOdds', -110, 'observedAt', v_observed_at),
          jsonb_build_object('sourceBook', 'draftkings', 'marketType', 'TOTAL', 'outcomeKey', 'UNDER', 'proposition', 'Under ' || (v_total / 1000.0)::text, 'lineMilli', v_total, 'americanOdds', -110, 'observedAt', v_observed_at)
        ),
        'resultVersions', v_versions
      ));
    end loop;
    v_weeks := v_weeks || jsonb_build_array(jsonb_build_object(
      'week', v_week,
      'opensAt', (v_events #>> '{0,markets,0,observedAt}')::timestamptz,
      'events', v_events
    ));
  end loop;

  v_manifest := jsonb_build_object(
    'packId', 'sunday-ledger-authoritative-2026-v1',
    'version', 1,
    'seed', 'phase-8c-canonical-seed-v1',
    'weeks', v_weeks,
    'supportedRosterSizes', jsonb_build_array(4, 6, 8, 10, 12, 14, 16),
    'scenarios', $scenarios$[
      {"id":"WIN_LOSS","week":1},{"id":"PUSH","week":2},{"id":"VOID","week":3},
      {"id":"REGULAR_EXACT_TIE","week":4},{"id":"ONE_INCOMPLETE_CARD","week":5},
      {"id":"BOTH_CARDS_INCOMPLETE","week":6},{"id":"POSTPONEMENT_48H_VOID","week":7},
      {"id":"OBJECTIVE_CORRECTION","week":8},{"id":"THIRD_REGULAR_MISS","week":14},
      {"id":"ELIGIBLE_COUNTS_0_TO_6","week":14},{"id":"SIX_SLOT_VACANCIES","week":15},
      {"id":"BYE_EXHIBITIONS","week":15},{"id":"PLAYOFF_SINGLE_INCOMPLETE","week":15},
      {"id":"RESEEDING","week":16},{"id":"PLAYOFF_EXACT_TIE","week":16},
      {"id":"PLAYOFF_DUAL_INCOMPLETE","week":17},{"id":"EXHIBITION_MISSES","week":17},
      {"id":"CHAMPION_FINALITY","week":17},{"id":"W17_CORRECTION_BEFORE_W18_SEAL","week":17},
      {"id":"W17_CORRECTION_AFTER_W18_SEAL","week":17},{"id":"WEEK_18","week":18},
      {"id":"ARCHIVE_FINALITY","week":18}
    ]$scenarios$::jsonb
  );

  insert into private.simulation_fixture_manifests (
    pack_id, pack_version, seed, week_count, manifest_hash, manifest_json
  ) values (
    'sunday-ledger-authoritative-2026-v1', 1,
    'phase-8c-canonical-seed-v1', 18,
    encode(extensions.digest(v_manifest::text, 'sha256'), 'hex'), v_manifest
  );
end;
$fixture_seed$;

create or replace function private.assert_provider_source_matches_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
begin
  select season.mode into strict v_mode
  from private.seasons as season
  where season.id = new.season_id and season.league_id = new.league_id;
  if (v_mode = 'LIVE' and new.source <> 'THE_ODDS_API')
    or (v_mode = 'SIMULATION' and new.source <> 'SIMULATION_FIXTURE') then
    raise exception using errcode = '22023', message = 'Provider source does not match the frozen season mode.';
  end if;
  return new;
end;
$$;

revoke execute on function private.assert_provider_source_matches_mode()
from public, anon, authenticated;

create trigger live_odds_imports_mode_source_guard
before insert on private.live_odds_imports
for each row execute function private.assert_provider_source_matches_mode();
create trigger live_score_imports_mode_source_guard
before insert on private.live_score_imports
for each row execute function private.assert_provider_source_matches_mode();

create or replace function private.assert_result_source_matches_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
begin
  select season.mode into strict v_mode
  from private.sports_events as event
  join private.seasons as season on season.id = event.season_id
  where event.id = new.event_id
    and event.week_id = new.week_id
    and event.league_id = new.league_id;
  if (v_mode = 'LIVE' and new.source not in ('THE_ODDS_API', 'MANUAL_OBJECTIVE'))
    or (v_mode = 'SIMULATION' and new.source <> 'SIMULATION_FIXTURE') then
    raise exception using errcode = '22023', message = 'Result source does not match the frozen season mode.';
  end if;
  return new;
end;
$$;

revoke execute on function private.assert_result_source_matches_mode()
from public, anon, authenticated;

create trigger event_result_versions_mode_source_guard
before insert on private.event_result_versions
for each row execute function private.assert_result_source_matches_mode();

-- Reuse the existing publication authorities. They now derive their clock
-- from the season and require the reviewed import source to match its mode.
do $shared_authority$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('api.publish_live_week_slate(uuid,uuid,text[],text)'::regprocedure);
  if position('v_published_at timestamptz := clock_timestamp();' in v_definition) = 0
    or position('v_season.mode <> ''LIVE''' in v_definition) = 0 then
    raise exception 'Unexpected publish_live_week_slate definition';
  end if;
  v_definition := replace(v_definition,
    'v_published_at timestamptz := clock_timestamp();',
    'v_published_at timestamptz;');
  v_definition := replace(v_definition,
    'if v_season.mode <> ''LIVE'' or v_season.lifecycle <> ''DRAFT'' then',
    E'v_published_at := private.stage1_season_time(v_season.id);\n  if v_season.mode not in (''LIVE'', ''SIMULATION'') or v_season.lifecycle <> ''DRAFT'' then');
  v_definition := replace(v_definition,
    'and odds_import.league_id = p_league_id;',
    E'and odds_import.league_id = p_league_id;\n\n  if (v_season.mode = ''LIVE'' and v_import.source <> ''THE_ODDS_API'')\n    or (v_season.mode = ''SIMULATION'' and v_import.source <> ''SIMULATION_FIXTURE'') then\n    raise exception using errcode = ''22023'', message = ''Provider source does not match the frozen season mode.'';\n  end if;');
  begin
    execute v_definition || ';';
  exception when others then
    raise exception 'publish_live_week_slate rewrite failed: %', sqlerrm
      using detail = v_definition;
  end;

  v_definition := pg_get_functiondef('api.publish_next_live_week_slate(uuid,uuid,text[],text)'::regprocedure);
  if position('v_published_at timestamptz := clock_timestamp();' in v_definition) = 0
    or position('v_season.mode <> ''LIVE''' in v_definition) = 0 then
    raise exception 'Unexpected publish_next_live_week_slate definition';
  end if;
  v_definition := replace(v_definition,
    'v_published_at timestamptz := clock_timestamp();',
    'v_published_at timestamptz;');
  v_definition := replace(v_definition,
    'if v_season.mode <> ''LIVE''',
    E'v_published_at := private.stage1_season_time(v_season.id);\n  if v_season.mode not in (''LIVE'', ''SIMULATION'')');
  v_definition := replace(v_definition,
    'and odds_import.league_id = p_league_id;',
    E'and odds_import.league_id = p_league_id;\n\n  if (v_season.mode = ''LIVE'' and v_import.source <> ''THE_ODDS_API'')\n    or (v_season.mode = ''SIMULATION'' and v_import.source <> ''SIMULATION_FIXTURE'') then\n    raise exception using errcode = ''22023'', message = ''Provider source does not match the frozen season mode.'';\n  end if;');
  begin
    execute v_definition || ';';
  exception when others then
    raise exception 'publish_next_live_week_slate rewrite failed: %', sqlerrm
      using detail = v_definition;
  end;

  v_definition := pg_get_functiondef('api.lock_live_roster_and_open_week(uuid,text)'::regprocedure);
  if position('v_season.mode <> ''LIVE''' in v_definition) = 0
    or position('v_snapshot.mode <> ''LIVE''' in v_definition) = 0 then
    raise exception 'Unexpected lock_live_roster_and_open_week definition';
  end if;
  v_definition := replace(v_definition,
    'v_season.mode <> ''LIVE''',
    'v_season.mode not in (''LIVE'', ''SIMULATION'')');
  v_definition := replace(v_definition,
    'v_snapshot.mode <> ''LIVE''',
    'v_snapshot.mode <> v_season.mode');
  v_definition := replace(v_definition, 'forming Live season', 'forming authoritative season');
  v_definition := replace(v_definition, 'The Live ruleset', 'The authoritative ruleset');
  begin
    execute v_definition || ';';
  exception when others then
    raise exception 'lock_live_roster_and_open_week rewrite failed: %', sqlerrm
      using detail = v_definition;
  end;

  v_definition := pg_get_functiondef('private.set_initial_live_quote_head()'::regprocedure);
  if position('season.mode = ''LIVE''' in v_definition) = 0 then
    raise exception 'Unexpected set_initial_live_quote_head definition';
  end if;
  v_definition := replace(
    v_definition,
    'season.mode = ''LIVE''',
    'season.mode in (''LIVE'', ''SIMULATION'')'
  );
  begin
    execute v_definition || ';';
  exception when others then
    raise exception 'set_initial_live_quote_head rewrite failed: %', sqlerrm
      using detail = v_definition;
  end;

  v_definition := pg_get_functiondef('api.publish_playoff_qualification(uuid,text)'::regprocedure);
  if position('season.mode = ''LIVE''' in v_definition) = 0 then
    raise exception 'Unexpected publish_playoff_qualification definition';
  end if;
  v_definition := replace(v_definition,
    'season.mode = ''LIVE''',
    'season.mode in (''LIVE'', ''SIMULATION'')');
  begin
    execute v_definition || ';';
  exception when others then
    raise exception 'publish_playoff_qualification rewrite failed: %', sqlerrm
      using detail = v_definition;
  end;

  v_definition := pg_get_functiondef('api.publish_postseason_week(uuid,uuid,text[],text)'::regprocedure);
  if position('v_published_at timestamptz := clock_timestamp();' in v_definition) = 0
    or position('season.mode = ''LIVE''' in v_definition) = 0 then
    raise exception 'Unexpected publish_postseason_week definition';
  end if;
  v_definition := replace(v_definition,
    'v_published_at timestamptz := clock_timestamp();',
    'v_published_at timestamptz;');
  v_definition := replace(v_definition,
    'season.mode = ''LIVE''',
    'season.mode in (''LIVE'', ''SIMULATION'')');
  v_definition := replace(v_definition,
    'perform private.assert_phase8_terminal_lineage(v_season.id);',
    E'v_published_at := private.stage1_season_time(v_season.id);\n  perform private.assert_phase8_terminal_lineage(v_season.id);');
  v_definition := replace(v_definition,
    'where odds_import.id = p_import_id and odds_import.season_id = v_season.id and odds_import.league_id = p_league_id;',
    E'where odds_import.id = p_import_id and odds_import.season_id = v_season.id and odds_import.league_id = p_league_id;\n  if (v_season.mode = ''LIVE'' and v_import.source <> ''THE_ODDS_API'')\n    or (v_season.mode = ''SIMULATION'' and v_import.source <> ''SIMULATION_FIXTURE'') then\n    raise exception using errcode = ''22023'', message = ''Provider source does not match the frozen season mode.'';\n  end if;');
  begin
    execute v_definition || ';';
  exception when others then
    raise exception 'publish_postseason_week rewrite failed: %', sqlerrm
      using detail = v_definition;
  end;

  v_definition := pg_get_functiondef('api.advance_stage1_clock(uuid,timestamp with time zone,text)'::regprocedure);
  if position('season.lifecycle = ''REGULAR''' in v_definition) = 0 then
    raise exception 'Unexpected advance_stage1_clock definition';
  end if;
  v_definition := replace(v_definition,
    'season.lifecycle = ''REGULAR''',
    'season.lifecycle <> ''FINAL''');
  begin
    execute v_definition || ';';
  exception when others then
    raise exception 'advance_stage1_clock rewrite failed: %', sqlerrm
      using detail = v_definition;
  end;
end;
$shared_authority$;

-- Phase 8A/B postseason, champion, correction, archive and reads retain one
-- implementation. These replacements remove only the obsolete Live filter.
do $mode_neutral_phase8$
declare
  v_signature text;
  v_definition text;
begin
  foreach v_signature in array array[
    'api.finalize_champion_bracket(uuid,text)',
    'api.publish_week18_exhibition(uuid,uuid,text[],text)',
    'api.finalize_season_archive(uuid,text)',
    'api.correct_finalized_week17_result(uuid,text,integer,integer,text,text)',
    'api.get_playoff_state(text)',
    'api.get_week17_correction_operations(text)'
  ] loop
    v_definition := pg_get_functiondef(to_regprocedure(v_signature));
    if position('season.mode = ''LIVE''' in v_definition) = 0 then
      raise exception 'Unexpected Phase 8 function definition: %', v_signature;
    end if;
    v_definition := replace(v_definition,
      'season.mode = ''LIVE''',
      'season.mode in (''LIVE'', ''SIMULATION'')');
    execute v_definition || ';';
  end loop;

  v_definition := pg_get_functiondef(
    'api.correct_finalized_week17_result(uuid,text,integer,integer,text,text)'::regprocedure
  );
  if position('''MANUAL_OBJECTIVE'', btrim(p_reason)' in v_definition) = 0
    or position('if v_week.nfl_week <> 17' in v_definition) = 0 then
    raise exception 'Unexpected correct_finalized_week17_result trust boundary';
  end if;
  v_definition := replace(
    v_definition,
    '''MANUAL_OBJECTIVE'', btrim(p_reason)',
    'case when v_season.mode = ''SIMULATION'' then ''SIMULATION_FIXTURE'' else ''MANUAL_OBJECTIVE'' end, btrim(p_reason)'
  );
  v_definition := replace(
    v_definition,
    'if v_week.nfl_week <> 17',
    E'if v_season.mode = ''SIMULATION'' and not exists (\n    select 1\n    from private.simulation_fixture_manifests as manifest\n    cross join lateral jsonb_array_elements(manifest.manifest_json -> ''weeks'') as fixture_week(value)\n    cross join lateral jsonb_array_elements(fixture_week.value -> ''events'') as fixture_event(value)\n    cross join lateral jsonb_array_elements(fixture_event.value -> ''resultVersions'') as fixture_result(value)\n    where manifest.pack_id = ''sunday-ledger-authoritative-2026-v1''\n      and (fixture_week.value ->> ''week'')::integer = 17\n      and fixture_event.value ->> ''externalEventId'' = v_event.fixture_event_key\n      and (fixture_result.value ->> ''version'')::integer = 3\n      and upper(fixture_result.value ->> ''status'') = upper(p_status)\n      and nullif(fixture_result.value ->> ''awayScore'', '''')::integer is not distinct from p_away_score\n      and nullif(fixture_result.value ->> ''homeScore'', '''')::integer is not distinct from p_home_score\n      and fixture_result.value ->> ''reason'' = btrim(p_reason)\n      and (fixture_result.value ->> ''availableAt'')::timestamptz <= private.stage1_season_time(v_season.id)\n  ) then\n    raise exception using errcode = ''22023'', message = ''Simulation corrections must match the reviewed fixture manifest.'';\n  end if;\n\n  if v_week.nfl_week <> 17'
  );
  execute v_definition || ';';

  v_definition := pg_get_functiondef('private.build_season_archive_v2(uuid,uuid,uuid,integer,uuid,uuid,timestamp with time zone)'::regprocedure);
  if position('''mode'', ''LIVE''' in v_definition) = 0 then
    raise exception 'Unexpected build_season_archive_v2 definition';
  end if;
  v_definition := replace(v_definition, '''mode'', ''LIVE''', '''mode'', v_season.mode');
  execute v_definition || ';';

  v_definition := pg_get_functiondef('private.append_phase8b_archive(uuid,uuid,uuid)'::regprocedure);
  if position('season.mode = ''LIVE''' in v_definition) = 0
    or position('v_published_at timestamptz := clock_timestamp();' in v_definition) = 0 then
    raise exception 'Unexpected append_phase8b_archive definition';
  end if;
  v_definition := replace(v_definition,
    'v_published_at timestamptz := clock_timestamp();',
    'v_published_at timestamptz;');
  v_definition := replace(v_definition,
    'where season.id = p_season_id and season.mode = ''LIVE''',
    'where season.id = p_season_id and season.mode in (''LIVE'', ''SIMULATION'')');
  v_definition := replace(v_definition,
    'perform private.assert_phase8_terminal_lineage(v_season.id);',
    E'v_published_at := private.stage1_season_time(v_season.id);\n  perform private.assert_phase8_terminal_lineage(v_season.id);');
  execute v_definition || ';';
end;
$mode_neutral_phase8$;

create or replace function api.advance_simulated_time(
  p_league_id uuid,
  p_target timestamptz,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select api.advance_stage1_clock(p_league_id, p_target, p_idempotency_key);
$$;

revoke all on function api.advance_simulated_time(uuid, timestamptz, text)
from public, anon;
grant execute on function api.advance_simulated_time(uuid, timestamptz, text)
to authenticated;

create or replace function api.publish_simulation_fixture_week(
  p_league_id uuid,
  p_week integer,
  p_pack_id text,
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
  v_manifest private.simulation_fixture_manifests%rowtype;
  v_week_payload jsonb;
  v_import_payload jsonb;
  v_import private.live_odds_imports%rowtype;
  v_event_ids text[];
  v_now timestamptz;
  v_internal_key text;
  v_result jsonb;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if p_week not between 1 and 18 or char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Fixture week or idempotency key is invalid.';
  end if;
  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id and season.mode = 'SIMULATION'
    and season.lifecycle <> 'FINAL'
  order by season.created_at desc, season.id desc limit 1 for update;
  select manifest.* into strict v_manifest
  from private.simulation_fixture_manifests as manifest
  where manifest.pack_id = p_pack_id and manifest.pack_version = 1 for share;
  v_request_hash := encode(extensions.digest(
    p_league_id::text || ':' || p_week::text || ':' || v_manifest.manifest_hash,
    'sha256'
  ), 'hex');
  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'PUBLISH_SIMULATION_FIXTURE_WEEK'
    and command.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;
  select week_payload.value into strict v_week_payload
  from jsonb_array_elements(v_manifest.manifest_json -> 'weeks') as week_payload(value)
  where (week_payload.value ->> 'week')::integer = p_week;
  v_now := private.stage1_season_time(v_season.id);
  if v_now < (v_week_payload ->> 'opensAt')::timestamptz
    or v_now > (v_week_payload ->> 'opensAt')::timestamptz + interval '2 minutes' then
    raise exception using errcode = '55000', message = 'Advance the Simulation clock to the reviewed fixture publication time.';
  end if;
  select array_agg(event.value ->> 'externalEventId' order by event.ordinality),
    jsonb_build_object(
      'source', 'SIMULATION_FIXTURE', 'fetchedAt', v_now,
      'events', jsonb_agg(event.value - 'resultVersions' order by event.ordinality)
    )
  into v_event_ids, v_import_payload
  from jsonb_array_elements(v_week_payload -> 'events') with ordinality as event(value, ordinality);

  insert into private.live_odds_imports (
    season_id, league_id, source, sport_key, fetched_at, normalized_json,
    payload_hash, event_count, imported_by
  ) values (
    v_season.id, p_league_id, 'SIMULATION_FIXTURE', 'americanfootball_nfl',
    v_now, v_import_payload,
    encode(extensions.digest(v_import_payload::text, 'sha256'), 'hex'),
    cardinality(v_event_ids), v_user_id
  ) on conflict (season_id, payload_hash) do nothing;
  select odds_import.* into strict v_import
  from private.live_odds_imports as odds_import
  where odds_import.season_id = v_season.id
    and odds_import.payload_hash = encode(extensions.digest(v_import_payload::text, 'sha256'), 'hex')
    and odds_import.source = 'SIMULATION_FIXTURE';
  v_internal_key := 'simulation-publish:' || substr(encode(extensions.digest(
    p_idempotency_key || ':' || p_week::text || ':' || v_manifest.manifest_hash,
    'sha256'), 'hex'), 1, 48);
  if p_week = 1 then
    v_result := api.publish_live_week_slate(p_league_id, v_import.id, v_event_ids, v_internal_key);
  elsif p_week between 2 and 14 then
    v_result := api.publish_next_live_week_slate(p_league_id, v_import.id, v_event_ids, v_internal_key);
  elsif p_week between 15 and 17 then
    v_result := api.publish_postseason_week(p_league_id, v_import.id, v_event_ids, v_internal_key);
  else
    v_result := api.publish_week18_exhibition(p_league_id, v_import.id, v_event_ids, v_internal_key);
  end if;
  v_response := v_result || jsonb_build_object(
    'mode', 'SIMULATION', 'fixturePackId', v_manifest.pack_id,
    'fixtureManifestHash', v_manifest.manifest_hash,
    'fixtureWeek', p_week, 'providerSource', 'SIMULATION_FIXTURE'
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key, request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'PUBLISH_SIMULATION_FIXTURE_WEEK',
    p_idempotency_key, v_request_hash, v_response
  );
  return v_response;
end;
$$;

revoke all on function api.publish_simulation_fixture_week(uuid, integer, text, text)
from public, anon;
grant execute on function api.publish_simulation_fixture_week(uuid, integer, text, text)
to authenticated;

create or replace function api.apply_simulation_fixture_results(
  p_league_id uuid,
  p_week integer,
  p_step text,
  p_pack_id text,
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
  v_manifest private.simulation_fixture_manifests%rowtype;
  v_week_payload jsonb;
  v_result jsonb;
  v_event private.sports_events%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_score_payload jsonb;
  v_now timestamptz;
  v_applied integer := 0;
  v_internal_key text;
  v_command private.command_receipts%rowtype;
  v_request_hash text;
  v_response jsonb;
begin
  if v_user_id is null or not private.is_league_commissioner(p_league_id) then
    raise exception using errcode = '42501', message = 'Commissioner membership required.';
  end if;
  if p_week not between 1 and 18 or upper(p_step) not in ('LIVE', 'FINAL', 'CORRECTION')
    or char_length(p_idempotency_key) not between 8 and 120 then
    raise exception using errcode = '22023', message = 'Fixture result step is invalid.';
  end if;
  select season.* into strict v_season
  from private.seasons as season
  where season.league_id = p_league_id and season.mode = 'SIMULATION'
  order by season.created_at desc, season.id desc limit 1 for update;
  select week.* into strict v_week from private.season_weeks as week
  where week.season_id = v_season.id and week.nfl_week = p_week for update;
  select manifest.* into strict v_manifest
  from private.simulation_fixture_manifests as manifest
  where manifest.pack_id = p_pack_id and manifest.pack_version = 1 for share;
  v_request_hash := encode(extensions.digest(
    p_league_id::text || ':' || p_week::text || ':' || upper(p_step) || ':' || v_manifest.manifest_hash,
    'sha256'
  ), 'hex');
  select command.* into v_command
  from private.command_receipts as command
  where command.actor_user_id = v_user_id
    and command.command_name = 'APPLY_SIMULATION_FIXTURE_RESULTS'
    and command.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_command.request_hash <> v_request_hash then
      raise exception using errcode = '22000', message = 'Idempotency key was reused with a different request.';
    end if;
    return v_command.response_json;
  end if;
  select week_payload.value into strict v_week_payload
  from jsonb_array_elements(v_manifest.manifest_json -> 'weeks') as week_payload(value)
  where (week_payload.value ->> 'week')::integer = p_week;
  v_now := private.stage1_season_time(v_season.id);

  for v_result in
    select result_version.value || jsonb_build_object(
      'externalEventId', fixture_event.value ->> 'externalEventId',
      'awayTeam', fixture_event.value ->> 'awayTeam',
      'homeTeam', fixture_event.value ->> 'homeTeam',
      'scheduledStartAt', fixture_event.value ->> 'scheduledStartAt'
    )
    from jsonb_array_elements(v_week_payload -> 'events') as fixture_event(value)
    cross join lateral jsonb_array_elements(fixture_event.value -> 'resultVersions') as result_version(value)
    where (upper(p_step) = 'LIVE' and result_version.value ->> 'status' = 'LIVE')
      or (upper(p_step) = 'FINAL' and (result_version.value ->> 'version')::integer = 2)
      or (upper(p_step) = 'CORRECTION' and (result_version.value ->> 'version')::integer = 3)
    order by fixture_event.value ->> 'externalEventId'
  loop
    if (v_result ->> 'availableAt')::timestamptz > v_now then
      raise exception using errcode = '55000', message = 'The scripted result is not available at the simulated database time.';
    end if;
    select event.* into strict v_event from private.sports_events as event
    where event.season_id = v_season.id and event.week_id = v_week.id
      and event.fixture_event_key = v_result ->> 'externalEventId' for update;
    v_internal_key := 'simulation-result:' || substr(encode(extensions.digest(
      p_idempotency_key || ':' || v_event.id::text || ':' || (v_result ->> 'version'),
      'sha256'), 'hex'), 1, 48);
    if upper(p_step) = 'LIVE' then
      perform api.set_stage1_event_live(
        v_event.id, (v_result ->> 'scheduledStartAt')::timestamptz, v_internal_key
      );
    elsif upper(p_step) = 'CORRECTION' and v_week.state = 'FINAL' then
      perform api.correct_finalized_week17_result(
        v_event.id, v_result ->> 'status',
        nullif(v_result ->> 'awayScore', '')::integer,
        nullif(v_result ->> 'homeScore', '')::integer,
        v_result ->> 'reason', v_internal_key
      );
    else
      perform api.record_stage1_result(
        v_event.id, v_result ->> 'status',
        nullif(v_result ->> 'awayScore', '')::integer,
        nullif(v_result ->> 'homeScore', '')::integer,
        v_result ->> 'reason', 'SIMULATION_FIXTURE', v_internal_key
      );
    end if;
    v_results := v_results || jsonb_build_array(v_result);
    v_applied := v_applied + 1;
  end loop;
  if v_applied = 0 then
    raise exception using errcode = '22023', message = 'The approved fixture pack has no result for this step.';
  end if;
  v_score_payload := jsonb_build_object(
    'source', 'SIMULATION_FIXTURE', 'fetchedAt', v_now, 'events', v_results,
    'packId', v_manifest.pack_id, 'manifestHash', v_manifest.manifest_hash,
    'week', p_week, 'step', upper(p_step)
  );
  insert into private.live_score_imports (
    season_id, week_id, league_id, source, fetched_at, payload_hash, payload, imported_by
  ) values (
    v_season.id, v_week.id, p_league_id, 'SIMULATION_FIXTURE', v_now,
    encode(extensions.digest(v_score_payload::text, 'sha256'), 'hex'),
    v_score_payload, v_user_id
  ) on conflict (season_id, payload_hash) do nothing;
  v_response := jsonb_build_object(
    'leagueId', p_league_id, 'seasonId', v_season.id, 'weekId', v_week.id,
    'week', p_week, 'step', upper(p_step), 'appliedCount', v_applied,
    'fixturePackId', v_manifest.pack_id,
    'fixtureManifestHash', v_manifest.manifest_hash,
    'providerSource', 'SIMULATION_FIXTURE', 'simulatedNow', v_now
  );
  insert into private.command_receipts (
    league_id, actor_user_id, command_name, idempotency_key, request_hash, response_json
  ) values (
    p_league_id, v_user_id, 'APPLY_SIMULATION_FIXTURE_RESULTS',
    p_idempotency_key, v_request_hash, v_response
  );
  return v_response;
end;
$$;

revoke all on function api.apply_simulation_fixture_results(uuid, integer, text, text, text)
from public, anon;
grant execute on function api.apply_simulation_fixture_results(uuid, integer, text, text, text)
to authenticated;

-- A direct result call for Simulation must match the private reviewed pack.
do $harden_simulation_result$
declare
  v_definition text;
  v_anchor text := E'select week.* into strict v_week\n  from private.season_weeks as week\n  where week.id = v_event.week_id\n  for update;';
  v_guard text;
begin
  v_definition := pg_get_functiondef('api.record_stage1_result(uuid,text,integer,integer,text,text,text)'::regprocedure);
  if position(v_anchor in v_definition) = 0 then
    raise exception 'Unexpected record_stage1_result definition';
  end if;
  v_guard := v_anchor || $guard$

  if exists (
    select 1 from private.seasons as season
    where season.id = v_event.season_id and season.mode = 'SIMULATION'
  ) and (
    upper(p_source) <> 'SIMULATION_FIXTURE'
    or not exists (
      select 1
      from private.simulation_fixture_manifests as manifest
      cross join lateral jsonb_array_elements(manifest.manifest_json -> 'weeks') as fixture_week(value)
      cross join lateral jsonb_array_elements(fixture_week.value -> 'events') as fixture_event(value)
      cross join lateral jsonb_array_elements(fixture_event.value -> 'resultVersions') as fixture_result(value)
      where manifest.pack_id = 'sunday-ledger-authoritative-2026-v1'
        and (fixture_week.value ->> 'week')::integer = v_week.nfl_week
        and fixture_event.value ->> 'externalEventId' = v_event.fixture_event_key
        and upper(fixture_result.value ->> 'status') = upper(p_status)
        and nullif(fixture_result.value ->> 'awayScore', '')::integer is not distinct from p_away_score
        and nullif(fixture_result.value ->> 'homeScore', '')::integer is not distinct from p_home_score
        and fixture_result.value ->> 'reason' = btrim(p_reason)
        and (fixture_result.value ->> 'availableAt')::timestamptz <= private.stage1_season_time(v_event.season_id)
    )
  ) then
    raise exception using errcode = '22023', message = 'Simulation results must match the reviewed fixture manifest.';
  end if;$guard$;
  v_definition := replace(v_definition, v_anchor, v_guard);
  execute v_definition || ';';
end;
$harden_simulation_result$;

-- Compatibility/frozen-history boundary: the caller-authored archive path is
-- retained only as hidden storage and remains denied to every application role.
revoke all on function api.publish_simulation_season_archive(uuid, jsonb, text)
from public, anon, authenticated;
revoke all on function api.get_simulation_season_archive(text)
from public, anon, authenticated;
revoke all on table private.simulation_season_archives
from public, anon, authenticated;

comment on table private.simulation_fixture_manifests is
  'Immutable reviewed adapter data. It is not a second gameplay or archive domain.';
comment on function api.publish_simulation_fixture_week(uuid, integer, text, text) is
  'Selects one approved fixture pack/week and delegates publication to the shared authoritative week services.';
comment on function api.apply_simulation_fixture_results(uuid, integer, text, text, text) is
  'Selects an approved scripted result step; callers cannot author scores or corrections.';
comment on function api.advance_simulated_time(uuid, timestamptz, text) is
  'Commissioner-only monotonic clock advancement. It creates no competitive fact by itself.';
