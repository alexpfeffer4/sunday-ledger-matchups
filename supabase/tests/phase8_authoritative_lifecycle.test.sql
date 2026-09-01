begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email)
values (
  'e1000000-0000-4000-8000-000000000001',
  'phase8-lifecycle-commissioner@example.test'
);

create temporary table phase8_lifecycle_members (
  slug text not null,
  seed integer not null,
  user_id uuid not null,
  entry_id uuid not null,
  primary key (slug, seed),
  unique (slug, user_id),
  unique (slug, entry_id)
);

create temporary table phase8_correction_evidence (
  case_name text primary key,
  before_bracket_id uuid,
  after_bracket_id uuid,
  before_round_id uuid,
  after_round_id uuid,
  before_archive_id uuid,
  after_archive_id uuid,
  before_receipts text,
  after_receipts text,
  before_w18_results text,
  after_w18_results text,
  response jsonb not null
);

create or replace function pg_temp.phase8_set_actor(p_user_id uuid)
returns void
language plpgsql
volatile
as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create or replace function pg_temp.phase8_commissioner()
returns void
language sql
volatile
as $$
  select pg_temp.phase8_set_actor(
    'e1000000-0000-4000-8000-000000000001'::uuid
  );
$$;

create or replace function pg_temp.phase8_create_simulation(
  p_slug text,
  p_roster_size integer
)
returns uuid
language plpgsql
volatile
as $$
declare
  v_league_id uuid;
  v_season_id uuid;
  v_user_id uuid;
  v_entry_id uuid;
  v_seed integer;
begin
  perform pg_temp.phase8_commissioner();
  perform api.create_league(
    initcap(replace(p_slug, '-', ' ')),
    p_slug,
    'SIMULATION',
    2026
  );
  select league.id, season.id into strict v_league_id, v_season_id
  from private.leagues as league
  join private.seasons as season on season.league_id = league.id
  where league.slug = p_slug
  order by season.created_at desc, season.id desc
  limit 1;

  select entry.id into strict v_entry_id
  from private.season_entries as entry
  where entry.season_id = v_season_id
    and entry.user_id = 'e1000000-0000-4000-8000-000000000001';
  insert into phase8_lifecycle_members (slug, seed, user_id, entry_id)
  values (
    p_slug, 1,
    'e1000000-0000-4000-8000-000000000001',
    v_entry_id
  );

  for v_seed in 2..p_roster_size loop
    v_user_id := md5(p_slug || ':member:' || v_seed::text)::uuid;
    insert into auth.users (id, email)
    values (v_user_id, p_slug || '-member-' || v_seed::text || '@example.test');
    insert into private.profiles (id, display_name)
    values (v_user_id, initcap(p_slug) || ' Member ' || v_seed::text);
    insert into private.league_memberships (league_id, user_id, role)
    values (v_league_id, v_user_id, 'MEMBER');
    insert into private.season_entries (
      season_id, league_id, user_id, standing_tiebreak
    ) values (
      v_season_id,
      v_league_id,
      v_user_id,
      encode(extensions.digest(v_season_id::text || v_user_id::text, 'sha256'), 'hex')
    ) returning id into strict v_entry_id;
    insert into phase8_lifecycle_members (slug, seed, user_id, entry_id)
    values (p_slug, v_seed, v_user_id, v_entry_id);
  end loop;

  update private.seasons
  set simulated_now = '2026-09-01 00:00:00+00'
  where id = v_season_id;
  return v_league_id;
end;
$$;

create or replace function pg_temp.phase8_manifest_time(
  p_week integer,
  p_version integer
)
returns timestamptz
language sql
stable
as $$
  select max((result.value ->> 'availableAt')::timestamptz)
  from private.simulation_fixture_manifests as manifest
  cross join lateral jsonb_array_elements(manifest.manifest_json -> 'weeks') as week(value)
  cross join lateral jsonb_array_elements(week.value -> 'events') as event(value)
  cross join lateral jsonb_array_elements(event.value -> 'resultVersions') as result(value)
  where manifest.pack_id = 'sunday-ledger-authoritative-2026-v1'
    and (week.value ->> 'week')::integer = p_week
    and (result.value ->> 'version')::integer = p_version;
$$;

create or replace function pg_temp.phase8_week_open(p_week integer)
returns timestamptz
language sql
stable
as $$
  select (week.value ->> 'opensAt')::timestamptz
  from private.simulation_fixture_manifests as manifest
  cross join lateral jsonb_array_elements(manifest.manifest_json -> 'weeks') as week(value)
  where manifest.pack_id = 'sunday-ledger-authoritative-2026-v1'
    and (week.value ->> 'week')::integer = p_week;
$$;

create or replace function pg_temp.phase8_accept_card(
  p_slug text,
  p_week integer,
  p_user_id uuid,
  p_opposed_week17 boolean default false
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_season_id uuid;
  v_week_id uuid;
  v_entry_id uuid;
  v_seed integer;
  v_event_ordinal integer;
  v_market_type text;
  v_outcome_key text;
  v_snapshot private.market_snapshots%rowtype;
begin
  select season.id into strict v_season_id
  from private.seasons as season
  join private.leagues as league on league.id = season.league_id
  where league.slug = p_slug
  order by season.created_at desc, season.id desc
  limit 1;
  select week.id into strict v_week_id
  from private.season_weeks as week
  where week.season_id = v_season_id and week.nfl_week = p_week;
  select member.entry_id, member.seed into strict v_entry_id, v_seed
  from phase8_lifecycle_members as member
  where member.slug = p_slug and member.user_id = p_user_id;

  v_event_ordinal := case
    when p_week = 2 then 4
    when p_week = 3 then 3
    when p_week = 8 then 5
    when p_week = 17 then 6
    else 1
  end;
  v_market_type := case when p_week = 2 then 'SPREAD' else 'MONEYLINE' end;
  v_outcome_key := case
    when p_week = 2 then 'AWAY'
    when p_week = 1 and v_seed % 2 = 0 then 'HOME'
    when p_week = 17 and p_opposed_week17 then (
      select case when matchup.side_a_entry_id = v_entry_id then 'AWAY' else 'HOME' end
      from private.matchups as matchup
      where matchup.week_id = v_week_id
        and v_entry_id in (matchup.side_a_entry_id, matchup.side_b_entry_id)
        and private.is_effective_postseason_matchup(matchup.id)
      limit 1
    )
    else 'AWAY'
  end;

  select snapshot.* into strict v_snapshot
  from (
    select
      event.id,
      row_number() over (order by event.fixture_event_key) as event_ordinal
    from private.sports_events as event
    where event.week_id = v_week_id
  ) as ordered_event
  join private.market_snapshots as snapshot
    on snapshot.event_id = ordered_event.id
   and snapshot.week_id = v_week_id
  where ordered_event.event_ordinal = v_event_ordinal
    and snapshot.market_type = v_market_type
    and snapshot.outcome_key = v_outcome_key
  order by snapshot.created_at desc, snapshot.id desc
  limit 1;

  perform pg_temp.phase8_set_actor(p_user_id);
  return api.accept_stage1_card(
    p_slug,
    jsonb_build_array(jsonb_build_object(
      'marketSnapshotId', v_snapshot.id,
      'stakeCredits', 1000,
      'payloadHash', v_snapshot.payload_hash
    )),
    p_slug || '-card-' || p_week::text || '-' || v_seed::text
  );
end;
$$;

create or replace function pg_temp.phase8_run_to_champion(
  p_slug text,
  p_roster_size integer,
  p_canonical_scenarios boolean
)
returns uuid
language plpgsql
volatile
as $$
declare
  v_league_id uuid;
  v_season_id uuid;
  v_week integer;
  v_open_at timestamptz;
  v_live_at timestamptz;
  v_final_at timestamptz;
  v_correction_at timestamptz;
  v_correction_closes_at timestamptz;
  v_seed_ten_entry uuid;
  v_skip_entries uuid[];
  v_member record;
  v_week_id uuid;
begin
  v_league_id := pg_temp.phase8_create_simulation(p_slug, p_roster_size);
  select season.id into strict v_season_id
  from private.seasons as season
  where season.league_id = v_league_id
  order by season.created_at desc, season.id desc
  limit 1;
  if p_roster_size >= 10 then
    select entry_id into strict v_seed_ten_entry
    from phase8_lifecycle_members
    where slug = p_slug and seed = 10;
  end if;

  for v_week in 1..17 loop
    perform pg_temp.phase8_commissioner();
    v_open_at := pg_temp.phase8_week_open(v_week);
    perform api.advance_simulated_time(
      v_league_id,
      v_open_at,
      p_slug || '-advance-open-' || v_week::text
    );
    perform api.publish_simulation_fixture_week(
      v_league_id,
      v_week,
      'sunday-ledger-authoritative-2026-v1',
      p_slug || '-publish-' || v_week::text
    );
    if v_week = 1 then
      perform api.lock_live_roster_and_open_week(
        v_league_id,
        p_slug || '-lock-roster'
      );
    end if;

    select week.id into strict v_week_id
    from private.season_weeks as week
    where week.season_id = v_season_id and week.nfl_week = v_week;
    v_skip_entries := '{}'::uuid[];
    if p_canonical_scenarios and v_week = 5 then
      v_skip_entries := array[v_seed_ten_entry];
    elsif p_canonical_scenarios and v_week = 6 then
      v_skip_entries := array[
        v_seed_ten_entry,
        (
          select case
            when matchup.side_a_entry_id = v_seed_ten_entry then matchup.side_b_entry_id
            else matchup.side_a_entry_id
          end
          from private.matchups as matchup
          where matchup.week_id = v_week_id
            and v_seed_ten_entry in (matchup.side_a_entry_id, matchup.side_b_entry_id)
          limit 1
        )
      ];
    elsif p_canonical_scenarios and v_week = 14 then
      v_skip_entries := array[v_seed_ten_entry];
    elsif p_canonical_scenarios and v_week = 15 then
      v_skip_entries := array[
        (
          select matchup.side_b_entry_id
          from private.matchups as matchup
          where matchup.week_id = v_week_id
            and matchup.postseason_role = 'CHAMPIONSHIP'
            and private.is_effective_postseason_matchup(matchup.id)
          order by matchup.display_order
          limit 1
        )
      ];
    elsif p_canonical_scenarios and v_week = 17 then
      v_skip_entries := array[
        (
          select matchup.side_a_entry_id
          from private.matchups as matchup
          where matchup.week_id = v_week_id
            and matchup.postseason_role = 'CHAMPIONSHIP'
            and private.is_effective_postseason_matchup(matchup.id)
          limit 1
        ),
        (
          select matchup.side_b_entry_id
          from private.matchups as matchup
          where matchup.week_id = v_week_id
            and matchup.postseason_role = 'CHAMPIONSHIP'
            and private.is_effective_postseason_matchup(matchup.id)
          limit 1
        ),
        (
          select matchup.side_a_entry_id
          from private.matchups as matchup
          where matchup.week_id = v_week_id
            and matchup.postseason_role = 'EXHIBITION'
            and private.is_effective_postseason_matchup(matchup.id)
          order by matchup.display_order
          limit 1
        )
      ];
    end if;

    for v_member in
      select member.*
      from phase8_lifecycle_members as member
      where member.slug = p_slug
      order by member.seed
    loop
      if v_member.entry_id = any(v_skip_entries) then
        continue;
      end if;
      perform pg_temp.phase8_accept_card(
        p_slug,
        v_week,
        v_member.user_id,
        not p_canonical_scenarios
      );
    end loop;

    perform pg_temp.phase8_commissioner();
    v_live_at := pg_temp.phase8_manifest_time(v_week, 1);
    perform api.advance_simulated_time(
      v_league_id,
      v_live_at,
      p_slug || '-advance-live-' || v_week::text
    );
    perform api.lock_stage1_week(
      v_league_id,
      p_slug || '-lock-week-' || v_week::text
    );
    perform api.apply_simulation_fixture_results(
      v_league_id,
      v_week,
      'LIVE',
      'sunday-ledger-authoritative-2026-v1',
      p_slug || '-results-live-' || v_week::text
    );

    v_final_at := pg_temp.phase8_manifest_time(v_week, 2);
    perform api.advance_simulated_time(
      v_league_id,
      v_final_at,
      p_slug || '-advance-final-' || v_week::text
    );
    perform api.apply_simulation_fixture_results(
      v_league_id,
      v_week,
      'FINAL',
      'sunday-ledger-authoritative-2026-v1',
      p_slug || '-results-final-' || v_week::text
    );

    if p_canonical_scenarios and v_week = 8 then
      v_correction_at := pg_temp.phase8_manifest_time(v_week, 3);
      perform api.advance_simulated_time(
        v_league_id,
        v_correction_at,
        p_slug || '-advance-correction-8'
      );
      perform api.apply_simulation_fixture_results(
        v_league_id,
        v_week,
        'CORRECTION',
        'sunday-ledger-authoritative-2026-v1',
        p_slug || '-results-correction-8'
      );
    end if;

    select week.correction_window_closes_at into strict v_correction_closes_at
    from private.season_weeks as week
    where week.id = v_week_id;
    perform api.advance_simulated_time(
      v_league_id,
      v_correction_closes_at + interval '1 second',
      p_slug || '-advance-close-' || v_week::text
    );
    perform api.finalize_stage1_week(
      v_league_id,
      p_slug || '-finalize-' || v_week::text
    );

    if v_week = 14 then
      perform api.publish_playoff_qualification(
        v_league_id,
        p_slug || '-qualification'
      );
    elsif v_week = 17 then
      perform api.finalize_champion_bracket(
        v_league_id,
        p_slug || '-champion-final'
      );
    end if;
  end loop;
  return v_league_id;
end;
$$;

create or replace function pg_temp.phase8_publish_week18(p_slug text)
returns uuid
language plpgsql
volatile
as $$
declare
  v_league_id uuid;
begin
  select league.id into strict v_league_id
  from private.leagues as league where league.slug = p_slug;
  perform pg_temp.phase8_commissioner();
  perform api.advance_simulated_time(
    v_league_id,
    pg_temp.phase8_week_open(18),
    p_slug || '-advance-open-18'
  );
  perform api.publish_simulation_fixture_week(
    v_league_id,
    18,
    'sunday-ledger-authoritative-2026-v1',
    p_slug || '-publish-18'
  );
  return v_league_id;
end;
$$;

create or replace function pg_temp.phase8_finish_week18(p_slug text)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_league_id uuid;
  v_week_id uuid;
  v_correction_closes_at timestamptz;
  v_member record;
begin
  select league.id into strict v_league_id
  from private.leagues as league where league.slug = p_slug;
  for v_member in
    select member.* from phase8_lifecycle_members as member
    where member.slug = p_slug order by member.seed
  loop
    perform pg_temp.phase8_accept_card(
      p_slug, 18, v_member.user_id, false
    );
  end loop;
  perform pg_temp.phase8_commissioner();
  perform api.advance_simulated_time(
    v_league_id,
    pg_temp.phase8_manifest_time(18, 1),
    p_slug || '-advance-live-18'
  );
  perform api.lock_stage1_week(v_league_id, p_slug || '-lock-week-18');
  perform api.apply_simulation_fixture_results(
    v_league_id, 18, 'LIVE',
    'sunday-ledger-authoritative-2026-v1',
    p_slug || '-results-live-18'
  );
  perform api.advance_simulated_time(
    v_league_id,
    pg_temp.phase8_manifest_time(18, 2),
    p_slug || '-advance-final-18'
  );
  perform api.apply_simulation_fixture_results(
    v_league_id, 18, 'FINAL',
    'sunday-ledger-authoritative-2026-v1',
    p_slug || '-results-final-18'
  );
  select week.id, week.correction_window_closes_at
  into strict v_week_id, v_correction_closes_at
  from private.season_weeks as week
  join private.seasons as season on season.id = week.season_id
  where season.league_id = v_league_id and week.nfl_week = 18;
  perform api.advance_simulated_time(
    v_league_id,
    v_correction_closes_at + interval '1 second',
    p_slug || '-advance-close-18'
  );
  perform api.finalize_stage1_week(v_league_id, p_slug || '-finalize-18');
  return api.finalize_season_archive(v_league_id, p_slug || '-archive-final');
end;
$$;

select lives_ok(
  $$select pg_temp.phase8_run_to_champion(
    'phase8-canonical-10', 10, true
  )$$,
  'the canonical ten-member Simulation reaches champion finality through shared commands'
);
select lives_ok(
  $$select pg_temp.phase8_publish_week18('phase8-canonical-10')$$,
  'the canonical Simulation publishes Week 18 only after champion finality'
);
select lives_ok(
  $$select pg_temp.phase8_finish_week18('phase8-canonical-10')$$,
  'the canonical Simulation finalizes Week 18 and derives its final archive'
);

select is(
  (select season.lifecycle
   from private.seasons as season
   join private.leagues as league on league.id = season.league_id
   where league.slug = 'phase8-canonical-10'),
  'FINAL',
  'the canonical Simulation reaches FINAL'
);
select ok(
  (select snapshot.frozen_at is not null
   from private.season_ruleset_snapshots as snapshot
   join private.seasons as season on season.ruleset_snapshot_id = snapshot.id
   join private.leagues as league on league.id = season.league_id
   where league.slug = 'phase8-canonical-10'),
  'the canonical Simulation stores a frozen Simulation Ruleset snapshot'
);
select is(
  (select jsonb_array_length(publication.schedule_json -> 'matchups')
   from private.schedule_publications as publication
   join private.leagues as league on league.id = publication.league_id
   where league.slug = 'phase8-canonical-10'),
  70,
  'the ten-member Simulation stores all 14 regular-season schedule rounds'
);
select is(
  (select count(*)::integer
   from private.season_weeks as week
   join private.leagues as league on league.id = week.league_id
   where league.slug = 'phase8-canonical-10'),
  18,
  'the canonical Simulation stores exactly 18 authoritative weeks'
);
select is(
  (select count(*)::integer
   from private.weekly_cards as card
   join private.leagues as league on league.id = card.league_id
   where league.slug = 'phase8-canonical-10'),
  180,
  'one ordinary weekly card exists for every member in every week'
);
select is(
  (select count(*)::integer
   from private.position_receipts as receipt
   join private.weekly_cards as card on card.id = receipt.card_id
   join private.leagues as league on league.id = card.league_id
   where league.slug = 'phase8-canonical-10'),
  172,
  'whole-card acceptance stores one atomic receipt for every intentionally sealed card'
);
select ok(
  (select count(*) > 0
   from private.command_receipts as command
   join private.leagues as league on league.id = command.league_id
   where league.slug = 'phase8-canonical-10'
     and command.command_name = 'SET_STAGE1_EVENT_LIVE'
     and command.response_json ->> 'state' = 'LIVE'),
  'scripted live transitions are stored before terminal results'
);
select results_eq(
  $$select distinct settlement.outcome
    from private.settlement_versions as settlement
    join private.position_receipts as receipt on receipt.id = settlement.receipt_id
    join private.weekly_cards as card on card.id = receipt.card_id
    join private.leagues as league on league.id = card.league_id
    where league.slug = 'phase8-canonical-10'
    order by settlement.outcome$$,
  $$values ('LOSS'), ('PUSH'), ('VOID'), ('WIN')$$,
  'the canonical receipts include win, loss, push, and void settlement evidence'
);
select ok(
  exists (
    select 1
    from private.matchup_result_versions as result
    join private.season_weeks as week on week.id = result.week_id
    join private.leagues as league on league.id = result.league_id
    where league.slug = 'phase8-canonical-10'
      and week.nfl_week = 4
      and result.status = 'FINAL'
      and result.side_a_decision = 'TIE'
      and result.side_b_decision = 'TIE'
  ),
  'Week 4 stores an exact matchup tie'
);
select ok(
  exists (
    select 1
    from private.matchup_result_versions as result
    join private.season_weeks as week on week.id = result.week_id
    join private.leagues as league on league.id = result.league_id
    where league.slug = 'phase8-canonical-10'
      and week.nfl_week = 5
      and result.status = 'FINAL'
      and (
        (result.side_a_decision = 'WIN' and result.side_b_decision = 'LOSS')
        or (result.side_a_decision = 'LOSS' and result.side_b_decision = 'WIN')
      )
  ),
  'Week 5 stores the one-card-incomplete win/loss decision'
);
select ok(
  exists (
    select 1
    from private.matchup_result_versions as result
    join private.season_weeks as week on week.id = result.week_id
    join private.leagues as league on league.id = result.league_id
    where league.slug = 'phase8-canonical-10'
      and week.nfl_week = 6
      and result.status = 'FINAL'
      and result.side_a_decision = 'LOSS'
      and result.side_b_decision = 'LOSS'
  ),
  'Week 6 stores the dual-incomplete loss/loss decision'
);
select ok(
  exists (
    select 1
    from private.standings_snapshots as standing
    join private.leagues as league on league.id = standing.league_id
    cross join lateral jsonb_array_elements(standing.ordered_rows) as row(value)
    where league.slug = 'phase8-canonical-10'
      and standing.through_week = 14
      and standing.status = 'FINAL'
      and (row.value ->> 'attendanceMisses')::integer = 3
  ),
  'the canonical third regular miss is frozen in Week 14 standings'
);
select ok(
  exists (
    select 1
    from private.event_result_versions as result
    join private.sports_events as event on event.id = result.event_id
    join private.season_weeks as week on week.id = result.week_id
    join private.leagues as league on league.id = result.league_id
    where league.slug = 'phase8-canonical-10'
      and week.nfl_week = 7
      and result.status = 'VOID'
      and result.reason = 'Scripted 48-hour postponement boundary expired.'
  ),
  'the exact 48-hour postponement boundary stores a terminal void'
);
select ok(
  exists (
    select 1
    from private.event_result_versions as result
    join private.season_weeks as week on week.id = result.week_id
    join private.leagues as league on league.id = result.league_id
    where league.slug = 'phase8-canonical-10'
      and week.nfl_week = 8
      and result.supersedes_id is not null
      and result.reason = 'Scripted objective correction superseded the first final.'
  ) and exists (
    select 1
    from private.settlement_versions as settlement
    join private.position_receipts as receipt on receipt.id = settlement.receipt_id
    join private.weekly_cards as card on card.id = receipt.card_id
    join private.season_weeks as week on week.id = card.week_id
    join private.leagues as league on league.id = card.league_id
    where league.slug = 'phase8-canonical-10'
      and week.nfl_week = 8
      and settlement.supersedes_id is not null
  ),
  'the objective Week 8 correction appends event and settlement lineage'
);
select is(
  (select jsonb_array_length(publication.qualifiers)
   from private.playoff_publications as publication
   join private.leagues as league on league.id = publication.league_id
   where league.slug = 'phase8-canonical-10'
     and publication.publication_stage = 'QUALIFICATION'
     and not exists (
       select 1 from private.playoff_publications as successor
       where successor.supersedes_id = publication.id
     )),
  6,
  'the canonical ten-member Simulation freezes a six-slot qualification field'
);
select ok(
  exists (
    select 1
    from private.matchups as matchup
    join private.season_weeks as week on week.id = matchup.week_id
    join private.leagues as league on league.id = matchup.league_id
    where league.slug = 'phase8-canonical-10'
      and week.nfl_week = 15
      and matchup.postseason_role = 'EXHIBITION'
  ),
  'Week 15 stores bye exhibitions alongside championship assignments'
);
select ok(
  exists (
    select 1
    from private.matchup_result_versions as result
    join private.matchups as matchup on matchup.id = result.matchup_id
    join private.season_weeks as week on week.id = result.week_id
    join private.leagues as league on league.id = result.league_id
    where league.slug = 'phase8-canonical-10'
      and week.nfl_week = 15
      and matchup.postseason_role = 'CHAMPIONSHIP'
      and result.status = 'FINAL'
      and result.side_a_decision <> result.side_b_decision
  ),
  'Week 15 stores single-incompletion championship advancement'
);
select ok(
  exists (
    select 1
    from private.matchup_result_versions as result
    join private.matchups as matchup on matchup.id = result.matchup_id
    join private.season_weeks as week on week.id = result.week_id
    join private.leagues as league on league.id = result.league_id
    where league.slug = 'phase8-canonical-10'
      and week.nfl_week = 16
      and matchup.postseason_role = 'CHAMPIONSHIP'
      and result.status = 'FINAL'
      and result.side_a_decision = 'TIE'
      and result.side_b_decision = 'TIE'
  ),
  'Week 16 stores playoff exact-tie evidence for higher-seed advancement'
);
select ok(
  exists (
    select 1
    from private.matchup_result_versions as result
    join private.matchups as matchup on matchup.id = result.matchup_id
    join private.season_weeks as week on week.id = result.week_id
    join private.leagues as league on league.id = result.league_id
    where league.slug = 'phase8-canonical-10'
      and week.nfl_week = 17
      and matchup.postseason_role = 'CHAMPIONSHIP'
      and result.status = 'FINAL'
      and result.side_a_decision = 'LOSS'
      and result.side_b_decision = 'LOSS'
  ),
  'Week 17 stores dual-incomplete championship evidence'
);
select ok(
  not exists (
    select 1
    from private.standings_snapshots as standing
    join private.leagues as league on league.id = standing.league_id
    where league.slug = 'phase8-canonical-10'
      and standing.through_week > 14
  ),
  'postseason and Week 18 do not mutate regular standings or eligibility facts'
);
select is(
  (select archive.archive_schema_version
   from private.season_archive_versions as archive
   join private.leagues as league on league.id = archive.league_id
   where league.slug = 'phase8-canonical-10'
     and not exists (
       select 1 from private.season_archive_versions as successor
       where successor.supersedes_id = archive.id
     )),
  2,
  'the canonical final archive uses schema version 2'
);
select is(
  (select jsonb_array_length(archive.archive_json #> '{regularSeason,weeks}')
   from private.season_archive_versions as archive
   join private.leagues as league on league.id = archive.league_id
   where league.slug = 'phase8-canonical-10'),
  14,
  'the final archive retains every regular week for history and rivalry derivation'
);
select is(
  (select jsonb_array_length(archive.archive_json -> 'week18')
   from private.season_archive_versions as archive
   join private.leagues as league on league.id = archive.league_id
   where league.slug = 'phase8-canonical-10'),
  5,
  'the complete archive appears only with all five Week 18 exhibitions'
);

select lives_ok(
  $$select pg_temp.phase8_run_to_champion(
    'phase8-correction-before-seal', 4, false
  )$$,
  'the pre-seal correction fixture reaches champion finality'
);
select lives_ok(
  $$select pg_temp.phase8_publish_week18('phase8-correction-before-seal')$$,
  'the pre-seal fixture publishes its initial Week 18 pairing'
);
do $case_one$
declare
  v_league_id uuid;
  v_season_id uuid;
  v_before_bracket uuid;
  v_after_bracket uuid;
  v_before_round uuid;
  v_after_round uuid;
  v_response jsonb;
begin
  select league.id, season.id into strict v_league_id, v_season_id
  from private.leagues as league
  join private.seasons as season on season.league_id = league.id
  where league.slug = 'phase8-correction-before-seal';
  select publication.id into strict v_before_bracket
  from private.playoff_publications as publication
  where publication.season_id = v_season_id
    and publication.publication_stage = 'CHAMPION_FINAL'
    and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
    );
  select round.id into strict v_before_round
  from private.playoff_round_publications as round
  where round.season_id = v_season_id and round.nfl_week = 18
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    );
  perform pg_temp.phase8_commissioner();
  v_response := api.apply_simulation_fixture_results(
    v_league_id, 17, 'CORRECTION',
    'sunday-ledger-authoritative-2026-v1',
    'phase8-before-seal-correction'
  );
  select publication.id into strict v_after_bracket
  from private.playoff_publications as publication
  where publication.season_id = v_season_id
    and publication.publication_stage = 'CHAMPION_FINAL'
    and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
    );
  select round.id into strict v_after_round
  from private.playoff_round_publications as round
  where round.season_id = v_season_id and round.nfl_week = 18
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    );
  insert into phase8_correction_evidence (
    case_name, before_bracket_id, after_bracket_id,
    before_round_id, after_round_id, response
  ) values (
    'BEFORE_FIRST_SEAL', v_before_bracket, v_after_bracket,
    v_before_round, v_after_round, v_response
  );
end;
$case_one$;

select isnt(before_bracket_id, after_bracket_id,
  'before-seal correction appends a champion/bracket version')
from phase8_correction_evidence where case_name = 'BEFORE_FIRST_SEAL';
select isnt(before_round_id, after_round_id,
  'before-seal correction supersedes the changed Week 18 pairing')
from phase8_correction_evidence where case_name = 'BEFORE_FIRST_SEAL';
select ok(
  exists (
    select 1 from private.playoff_round_publications
    where id = evidence.before_round_id
  ) and exists (
    select 1 from private.playoff_round_publications
    where id = evidence.after_round_id
      and supersedes_id = evidence.before_round_id
  ),
  'the prior pre-seal pairing remains stored in explicit lineage'
)
from phase8_correction_evidence as evidence
where case_name = 'BEFORE_FIRST_SEAL';

select lives_ok(
  $$select pg_temp.phase8_run_to_champion(
    'phase8-correction-after-seal', 4, false
  )$$,
  'the after-seal correction fixture reaches champion finality'
);
select lives_ok(
  $$select pg_temp.phase8_publish_week18('phase8-correction-after-seal')$$,
  'the after-seal fixture publishes its Week 18 pairing'
);
do $case_two$
declare
  v_league_id uuid;
  v_season_id uuid;
  v_user_id uuid;
  v_before_bracket uuid;
  v_after_bracket uuid;
  v_before_round uuid;
  v_after_round uuid;
  v_before_receipts text;
  v_after_receipts text;
  v_response jsonb;
begin
  select league.id, season.id into strict v_league_id, v_season_id
  from private.leagues as league
  join private.seasons as season on season.league_id = league.id
  where league.slug = 'phase8-correction-after-seal';
  select member.user_id into strict v_user_id
  from phase8_lifecycle_members as member
  where member.slug = 'phase8-correction-after-seal'
  order by member.seed limit 1;
  perform pg_temp.phase8_accept_card(
    'phase8-correction-after-seal', 18, v_user_id, false
  );
  select publication.id into strict v_before_bracket
  from private.playoff_publications as publication
  where publication.season_id = v_season_id
    and publication.publication_stage = 'CHAMPION_FINAL'
    and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
    );
  select round.id into strict v_before_round
  from private.playoff_round_publications as round
  where round.season_id = v_season_id and round.nfl_week = 18
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    );
  select string_agg(receipt.id::text || ':' || receipt.receipt_hash, ',' order by receipt.id)
  into v_before_receipts
  from private.position_receipts as receipt
  join private.weekly_cards as card on card.id = receipt.card_id
  join private.season_weeks as week on week.id = card.week_id
  where week.season_id = v_season_id and week.nfl_week = 18;
  perform pg_temp.phase8_commissioner();
  v_response := api.apply_simulation_fixture_results(
    v_league_id, 17, 'CORRECTION',
    'sunday-ledger-authoritative-2026-v1',
    'phase8-after-seal-correction'
  );
  select publication.id into strict v_after_bracket
  from private.playoff_publications as publication
  where publication.season_id = v_season_id
    and publication.publication_stage = 'CHAMPION_FINAL'
    and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
    );
  select round.id into strict v_after_round
  from private.playoff_round_publications as round
  where round.season_id = v_season_id and round.nfl_week = 18
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    );
  select string_agg(receipt.id::text || ':' || receipt.receipt_hash, ',' order by receipt.id)
  into v_after_receipts
  from private.position_receipts as receipt
  join private.weekly_cards as card on card.id = receipt.card_id
  join private.season_weeks as week on week.id = card.week_id
  where week.season_id = v_season_id and week.nfl_week = 18;
  insert into phase8_correction_evidence (
    case_name, before_bracket_id, after_bracket_id,
    before_round_id, after_round_id, before_receipts, after_receipts, response
  ) values (
    'AFTER_FIRST_SEAL', v_before_bracket, v_after_bracket,
    v_before_round, v_after_round, v_before_receipts, v_after_receipts, v_response
  );
end;
$case_two$;

select isnt(before_bracket_id, after_bracket_id,
  'after-seal correction still appends a champion/bracket version')
from phase8_correction_evidence where case_name = 'AFTER_FIRST_SEAL';
select is(before_round_id, after_round_id,
  'after-seal correction preserves the effective Week 18 pairing')
from phase8_correction_evidence where case_name = 'AFTER_FIRST_SEAL';
select is(before_receipts, after_receipts,
  'after-seal correction preserves every existing Week 18 receipt byte-for-byte')
from phase8_correction_evidence where case_name = 'AFTER_FIRST_SEAL';

select lives_ok(
  $$select pg_temp.phase8_run_to_champion(
    'phase8-correction-after-final', 4, false
  )$$,
  'the post-FINAL correction fixture reaches champion finality'
);
select lives_ok(
  $$select pg_temp.phase8_publish_week18('phase8-correction-after-final')$$,
  'the post-FINAL fixture publishes Week 18'
);
select lives_ok(
  $$select pg_temp.phase8_finish_week18('phase8-correction-after-final')$$,
  'the post-FINAL fixture stores its first complete archive'
);
do $case_three$
declare
  v_league_id uuid;
  v_season_id uuid;
  v_before_bracket uuid;
  v_after_bracket uuid;
  v_round_id uuid;
  v_after_round uuid;
  v_before_archive uuid;
  v_after_archive uuid;
  v_before_results text;
  v_after_results text;
  v_response jsonb;
begin
  select league.id, season.id into strict v_league_id, v_season_id
  from private.leagues as league
  join private.seasons as season on season.league_id = league.id
  where league.slug = 'phase8-correction-after-final';
  select publication.id into strict v_before_bracket
  from private.playoff_publications as publication
  where publication.season_id = v_season_id
    and publication.publication_stage = 'CHAMPION_FINAL'
    and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
    );
  select round.id into strict v_round_id
  from private.playoff_round_publications as round
  where round.season_id = v_season_id and round.nfl_week = 18
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    );
  select archive.id into strict v_before_archive
  from private.season_archive_versions as archive
  where archive.season_id = v_season_id
    and not exists (
      select 1 from private.season_archive_versions as successor
      where successor.supersedes_id = archive.id
    );
  select string_agg(result.id::text || ':' || result.input_hash, ',' order by result.id)
  into v_before_results
  from private.matchup_result_versions as result
  join private.season_weeks as week on week.id = result.week_id
  where week.season_id = v_season_id and week.nfl_week = 18;
  perform pg_temp.phase8_commissioner();
  v_response := api.apply_simulation_fixture_results(
    v_league_id, 17, 'CORRECTION',
    'sunday-ledger-authoritative-2026-v1',
    'phase8-after-final-correction'
  );
  select publication.id into strict v_after_bracket
  from private.playoff_publications as publication
  where publication.season_id = v_season_id
    and publication.publication_stage = 'CHAMPION_FINAL'
    and not exists (
      select 1 from private.playoff_publications as successor
      where successor.supersedes_id = publication.id
    );
  select round.id into strict v_after_round
  from private.playoff_round_publications as round
  where round.season_id = v_season_id and round.nfl_week = 18
    and not exists (
      select 1 from private.playoff_round_publications as successor
      where successor.supersedes_id = round.id
    );
  select archive.id into strict v_after_archive
  from private.season_archive_versions as archive
  where archive.season_id = v_season_id
    and not exists (
      select 1 from private.season_archive_versions as successor
      where successor.supersedes_id = archive.id
    );
  select string_agg(result.id::text || ':' || result.input_hash, ',' order by result.id)
  into v_after_results
  from private.matchup_result_versions as result
  join private.season_weeks as week on week.id = result.week_id
  where week.season_id = v_season_id and week.nfl_week = 18;
  insert into phase8_correction_evidence (
    case_name, before_bracket_id, after_bracket_id,
    before_round_id, after_round_id, before_archive_id, after_archive_id,
    before_w18_results, after_w18_results, response
  ) values (
    'AFTER_FINAL', v_before_bracket, v_after_bracket,
    v_round_id, v_after_round, v_before_archive, v_after_archive,
    v_before_results, v_after_results, v_response
  );
end;
$case_three$;

select isnt(before_bracket_id, after_bracket_id,
  'post-FINAL correction appends a champion/bracket version')
from phase8_correction_evidence where case_name = 'AFTER_FINAL';
select isnt(before_archive_id, after_archive_id,
  'post-FINAL correction appends a final archive version')
from phase8_correction_evidence where case_name = 'AFTER_FINAL';
select is(before_round_id, after_round_id,
  'post-FINAL correction preserves the Week 18 pairing')
from phase8_correction_evidence where case_name = 'AFTER_FINAL';
select is(before_w18_results, after_w18_results,
  'post-FINAL correction preserves all Week 18 result versions')
from phase8_correction_evidence where case_name = 'AFTER_FINAL';
select ok(
  exists (
    select 1 from private.playoff_publications
    where id = evidence.before_bracket_id
  ) and exists (
    select 1 from private.season_archive_versions
    where id = evidence.before_archive_id
  ) and exists (
    select 1 from private.playoff_publications
    where id = evidence.after_bracket_id
      and supersedes_id = evidence.before_bracket_id
  ) and exists (
    select 1 from private.season_archive_versions
    where id = evidence.after_archive_id
      and supersedes_id = evidence.before_archive_id
  ),
  'prior champion and archive remain accessible through explicit lineage'
)
from phase8_correction_evidence as evidence
where case_name = 'AFTER_FINAL';

insert into auth.users (id, email)
values (
  'e1000000-0000-4000-8000-000000000099',
  'phase8-lifecycle-nonmember@example.test'
);

select pg_temp.phase8_set_actor(
  (select user_id from phase8_lifecycle_members
   where slug = 'phase8-canonical-10' and seed = 2)
);
select is(
  api.get_weekly_close_state('phase8-canonical-10') #>> '{league,mode}',
  'SIMULATION',
  'an exact participant reads authoritative Simulation history through the shared DTO'
);
select ok(
  jsonb_array_length(
    api.get_weekly_close_state('phase8-canonical-10') -> 'matchups'
  ) > 0,
  'the final participant DTO retains factual matchup history for rivalry derivation'
);
select throws_ok(
  $$select api.get_weekly_close_state('phase8-correction-before-seal')$$,
  '42501',
  'League membership required.',
  'membership in one Simulation league grants no other-league access'
);

select pg_temp.phase8_set_actor(
  'e1000000-0000-4000-8000-000000000099'::uuid
);
select throws_ok(
  $$select api.get_season_archive('phase8-canonical-10')$$,
  '42501',
  'League membership required.',
  'an authenticated nonmember cannot read the final Simulation archive'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select api.get_season_archive('phase8-canonical-10')$$,
  '42501',
  null,
  'anonymous archive reads fail'
);
select throws_ok(
  $$select api.publish_simulation_fixture_week(
    (select id from private.leagues where slug = 'phase8-canonical-10'),
    1, 'sunday-ledger-authoritative-2026-v1', 'anonymous-fixture-write'
  )$$,
  '42501',
  null,
  'anonymous authoritative fixture publication fails'
);
reset role;

select pg_temp.phase8_set_actor(
  (select user_id from phase8_lifecycle_members
   where slug = 'phase8-canonical-10' and seed = 2)
);
set local role authenticated;
select throws_ok(
  $$insert into private.playoff_publications (
      season_id, league_id, week14_standings_snapshot_id,
      ruleset_snapshot_id, roster_size, expected_qualifier_count,
      standings_json, qualifiers, bracket_json, input_hash,
      created_by, version, source_result_version_ids
    ) select
      season.id, season.league_id, standing.id,
      season.ruleset_snapshot_id, 10, 6,
      standing.ordered_rows, '[]'::jsonb, '{}'::jsonb, repeat('f', 64),
      auth.uid(), 99, '{}'::uuid[]
    from private.seasons as season
    join private.leagues as league on league.id = season.league_id
    join private.standings_snapshots as standing
      on standing.season_id = season.id and standing.through_week = 14
    where league.slug = 'phase8-canonical-10'
    limit 1$$,
  '42501',
  null,
  'a participant cannot write a competitive bracket table directly'
);
select throws_ok(
  $$select api.publish_simulation_season_archive(
    (select id from private.leagues where slug = 'phase8-canonical-10'),
    '{}'::jsonb,
    'retired-publication'
  )$$,
  '42501',
  null,
  'retired caller-authored Simulation publication remains unusable'
);
reset role;

select * from finish();
rollback;
