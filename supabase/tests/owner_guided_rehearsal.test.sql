begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'private', 'owner_rehearsal_entitlements',
  'owner entitlement is explicit and private'
);
select has_table(
  'private', 'owner_rehearsals',
  'the rehearsal has a dedicated database identity'
);
select table_privs_are(
  'private', 'owner_rehearsals', 'authenticated', array[]::text[],
  'authenticated callers cannot read rehearsal metadata directly'
);
select table_privs_are(
  'private', 'owner_rehearsal_bots', 'authenticated', array[]::text[],
  'authenticated callers cannot discover bot principals'
);
select function_privs_are(
  'api', 'advance_owner_rehearsal', array['text', 'text'],
  'anon', array[]::text[], 'anonymous advance is denied'
);
select function_privs_are(
  'api', 'reset_owner_rehearsal', array['text', 'text'],
  'anon', array[]::text[], 'anonymous reset is denied'
);

insert into auth.users (id, email)
values
  ('0a000000-0000-4000-8000-000000000001', 'owner-rehearsal@example.test'),
  ('0a000000-0000-4000-8000-000000000002', 'ordinary-commissioner@example.test'),
  ('0a000000-0000-4000-8000-000000000003', 'authenticated-outsider@example.test');
insert into private.profiles (id, display_name)
values
  ('0a000000-0000-4000-8000-000000000001', 'Rehearsal Owner'),
  ('0a000000-0000-4000-8000-000000000002', 'Ordinary Commissioner'),
  ('0a000000-0000-4000-8000-000000000003', 'Authenticated Outsider');
insert into private.owner_rehearsal_entitlements (user_id, note)
values (
  '0a000000-0000-4000-8000-000000000001',
  'pgTAP owner-only acceptance'
);

create or replace function pg_temp.rehearsal_actor(p_user_id uuid)
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

create or replace function pg_temp.rehearsal_owner()
returns void
language sql
volatile
as $$
  select pg_temp.rehearsal_actor(
    '0a000000-0000-4000-8000-000000000001'::uuid
  );
$$;

create or replace function pg_temp.rehearsal_slug()
returns text
language sql
stable
as $$
  select league.slug
  from private.owner_rehearsals as rehearsal
  join private.leagues as league on league.id = rehearsal.league_id
  where rehearsal.owner_user_id =
    '0a000000-0000-4000-8000-000000000001'::uuid
    and rehearsal.status = 'ACTIVE';
$$;

select pg_temp.rehearsal_actor(
  '0a000000-0000-4000-8000-000000000002'::uuid
);
select lives_ok(
  $$select api.create_league(
    'Ordinary Live Boundary', 'ordinary-live-boundary', 'LIVE', 2026
  )$$,
  'an ordinary commissioner retains an unrelated Live league'
);
select throws_ok(
  $$select api.start_owner_rehearsal('outsider-start-0001')$$,
  'Not found.',
  'an ordinary commissioner cannot discover or start an owner rehearsal'
);

select pg_temp.rehearsal_owner();
select is(api.has_owner_rehearsal_entitlement(), true,
  'the explicitly entitled owner can discover the private tool');
select lives_ok(
  $$select api.start_owner_rehearsal('owner-start-0001')$$,
  'the entitled owner can start one personal rehearsal'
);
select is(
  api.get_owner_rehearsal() ->> 'checkpoint',
  'FORMATION_EMPTY',
  'the owner begins before rehearsal seats are filled'
);
select is(
  (api.start_owner_rehearsal('owner-start-0001') ->> 'replayed')::boolean,
  true,
  'a lost start response recovers the original result'
);
select is(
  (select count(*)::integer from api.my_leagues
   where slug = pg_temp.rehearsal_slug()),
  0,
  'the private rehearsal is excluded from ordinary league discovery'
);

select lives_ok(
  $$select api.fill_owner_rehearsal_bots('owner-fill-bots-0001')$$,
  'the owner explicitly fills nine seats without invitations'
);
select is(
  (select count(*)::integer
   from private.league_memberships as membership
   join private.owner_rehearsals as rehearsal
     on rehearsal.league_id = membership.league_id
   where rehearsal.status = 'ACTIVE'),
  10,
  'the rehearsal roster contains the owner and nine teams'
);
select is(
  (select count(*)::integer
   from private.owner_rehearsal_bots as bot
   join auth.users as account on account.id = bot.bot_user_id
   where account.email is null
     and coalesce(account.encrypted_password, '') = ''
     and not exists (
       select 1 from auth.identities as identity
       where identity.user_id = bot.bot_user_id
     )),
  9,
  'all nine rehearsal principals have no email, password, or auth identity'
);
select is(
  (select count(*)::integer
   from private.league_invites as invite
   join private.owner_rehearsals as rehearsal
     on rehearsal.league_id = invite.league_id),
  0,
  'filling seats sent no invitation'
);
select throws_ok(
  $$insert into private.league_invites (
      league_id, token_hash, expires_at, max_uses, created_by
    ) select rehearsal.league_id, repeat('a', 64), now() + interval '1 day', 1,
      rehearsal.owner_user_id
    from private.owner_rehearsals as rehearsal where rehearsal.status = 'ACTIVE'$$,
  'Owner rehearsals do not send invitations.',
  'the database rejects any rehearsal invitation'
);

select pg_temp.rehearsal_actor(
  '0a000000-0000-4000-8000-000000000003'::uuid
);
select is(api.has_owner_rehearsal_entitlement(), false,
  'an authenticated outsider cannot discover owner tools');
select throws_ok(
  $$select api.get_owner_rehearsal()$$,
  'Not found.',
  'an authenticated outsider receives no rehearsal metadata'
);
select throws_ok(
  $$select api.get_stage1_state(pg_temp.rehearsal_slug())$$,
  'League membership required.',
  'a guessed rehearsal league route grants no access'
);

select pg_temp.rehearsal_actor(
  (select bot.bot_user_id from private.owner_rehearsal_bots as bot
   order by bot.bot_number limit 1)
);
select throws_ok(
  $$select api.get_stage1_state(pg_temp.rehearsal_slug())$$,
  'League membership required.',
  'a credentialless bot principal has no member-shaped public access'
);
select throws_ok(
  $$select api.advance_owner_rehearsal(
    'FORMATION_READY', 'bot-advance-0001'
  )$$,
  'Not found.',
  'a bot cannot call rehearsal orchestration'
);

select pg_temp.rehearsal_owner();
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'FORMATION_READY', 'owner-advance-formation'
  )$$,
  'the real roster lock and schedule authority opens Week 1'
);
select is(
  (select jsonb_array_length(publication.schedule_json -> 'matchups')
   from private.schedule_publications as publication
   join private.owner_rehearsals as rehearsal
     on rehearsal.league_id = publication.league_id
   where rehearsal.status = 'ACTIVE'),
  70,
  'the canonical ten-member 14-week schedule has 70 matchups'
);
select lives_ok(
  $$select api.use_owner_rehearsal_sample_card('owner-sample-week-01')$$,
  'a sample owner card seals through whole-card acceptance'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_1_OPEN', 'owner-advance-week-01-partial'
  )$$,
  'the first advance locks cards and reveals only begun events'
);
select is(
  (select count(*)::integer
   from private.sports_events as event
   join private.owner_rehearsals as rehearsal
     on rehearsal.season_id = event.season_id
   join private.season_weeks as week on week.id = event.week_id
   where rehearsal.status = 'ACTIVE' and week.nfl_week = 1
     and event.state = 'LIVE'),
  2,
  'two same-time opening events are genuinely live at partial reveal'
);
select is(
  (select count(*)::integer
   from private.sports_events as event
   join private.owner_rehearsals as rehearsal
     on rehearsal.season_id = event.season_id
   join private.season_weeks as week on week.id = event.week_id
   where rehearsal.status = 'ACTIVE' and week.nfl_week = 1
     and event.state = 'SCHEDULED'),
  6,
  'six later events remain hidden at partial reveal'
);
set local role authenticated;
select is(
  (select count(*)::integer from private.position_receipts),
  1,
  'the owner commissioner can read only the owner receipt before reveal'
);
reset role;
select is(
  (api.advance_owner_rehearsal(
    'WEEK_1_OPEN', 'owner-advance-week-01-partial'
  ) ->> 'replayed')::boolean,
  true,
  'a lost partial-reveal response cannot double-run the checkpoint'
);
select is(
  api.get_owner_rehearsal() ->> 'checkpoint',
  'WEEK_1_PARTIAL',
  'retry recovery preserves the authoritative checkpoint'
);

select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_1_PARTIAL', 'owner-advance-week-01-provisional'
  )$$,
  'Week 1 reaches a provisional result'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_1_PROVISIONAL', 'owner-advance-week-01-final'
  )$$,
  'Week 1 finalizes after its correction window'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_1_FINAL', 'owner-advance-open-week-02'
  )$$,
  'Week 2 opens through the normal weekly handoff'
);
select lives_ok(
  $$select api.prepare_owner_rehearsal_quote_review(
    pg_temp.rehearsal_slug(), 'owner-quote-review-week-02'
  )$$,
  'the deterministic Week 2 quote changes before sealing'
);
select is(
  (api.prepare_owner_rehearsal_quote_review(
    pg_temp.rehearsal_slug(), 'owner-quote-review-week-02'
  ) ->> 'replayed')::boolean,
  true,
  'a lost quote-review response recovers without another change'
);
select lives_ok(
  $$select api.use_owner_rehearsal_sample_card('owner-sample-week-02')$$,
  'the reviewed Week 2 sample seals only after explicit quote review'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_2_OPEN', 'owner-advance-week-02-final'
  )$$,
  'Week 2 finalizes through settlement'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_2_FINAL', 'owner-advance-open-week-05'
  )$$,
  'normal Weeks 3 and 4 run authoritatively before Week 5 opens'
);
select lives_ok(
  $$select api.use_owner_rehearsal_sample_card('owner-sample-week-05')$$,
  'the owner seals Week 5 while a bot demonstrates incompletion'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_5_OPEN', 'owner-advance-week-05-final'
  )$$,
  'Week 5 finalizes with the normal incomplete-card consequence'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_5_FINAL', 'owner-advance-open-week-08'
  )$$,
  'normal Weeks 6 and 7 run before the correction lesson'
);
select lives_ok(
  $$select api.use_owner_rehearsal_sample_card('owner-sample-week-08')$$,
  'the owner seals Week 8 through the same receipt path'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_8_OPEN', 'owner-advance-week-08-provisional'
  )$$,
  'Week 8 pauses at provisional result'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_8_PROVISIONAL', 'owner-advance-week-08-corrected'
  )$$,
  'the objective correction appends a new result version'
);
select ok(
  exists (
    select 1 from private.event_result_versions as result
    join private.season_weeks as week on week.id = result.week_id
    join private.owner_rehearsals as rehearsal
      on rehearsal.season_id = week.season_id
    where rehearsal.status = 'ACTIVE' and week.nfl_week = 8
      and result.supersedes_id is not null
  ) and exists (
    select 1 from private.settlement_versions as settlement
    join private.position_receipts as receipt
      on receipt.id = settlement.receipt_id
    join private.season_weeks as week on week.id = receipt.week_id
    join private.owner_rehearsals as rehearsal
      on rehearsal.season_id = week.season_id
    where rehearsal.status = 'ACTIVE' and week.nfl_week = 8
      and settlement.supersedes_id is not null
  ),
  'Week 8 retains append-only event and settlement correction lineage'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_8_CORRECTED', 'owner-advance-open-week-14'
  )$$,
  'Weeks 9 through 13 run normally before Week 14 opens'
);
select lives_ok(
  $$select api.use_owner_rehearsal_sample_card('owner-sample-week-14')$$,
  'the owner seals the final regular-season card'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_14_OPEN', 'owner-advance-week-14-final'
  )$$,
  'Week 14 freezes standings and publishes qualification'
);
select is(
  (select jsonb_array_length(publication.qualifiers)
   from private.playoff_publications as publication
   join private.owner_rehearsals as rehearsal
     on rehearsal.season_id = publication.season_id
   where rehearsal.status = 'ACTIVE'
     and publication.publication_stage = 'QUALIFICATION'
   order by publication.version limit 1),
  6,
  'the ten-member rehearsal freezes a six-member playoff field'
);
select ok(
  exists (
    select 1
    from private.standings_snapshots as standing
    join private.owner_rehearsals as rehearsal
      on rehearsal.season_id = standing.season_id
    cross join lateral jsonb_array_elements(standing.ordered_rows) as row(value)
    where rehearsal.status = 'ACTIVE' and standing.through_week = 14
      and (row.value ->> 'attendanceMisses')::integer = 3
  ),
  'three bot attendance misses freeze the eligibility lesson'
);
select ok(
  exists (
    select 1
    from private.standings_snapshots as standing
    join private.owner_rehearsals as rehearsal
      on rehearsal.season_id = standing.season_id
    cross join lateral jsonb_array_elements(standing.ordered_rows)
      with ordinality as first_row(value, ordinal)
    cross join lateral jsonb_array_elements(standing.ordered_rows)
      with ordinality as second_row(value, ordinal)
    where rehearsal.status = 'ACTIVE' and standing.through_week = 14
      and first_row.ordinal < second_row.ordinal
      and first_row.value ->> 'wins' = second_row.value ->> 'wins'
      and first_row.value ->> 'losses' = second_row.value ->> 'losses'
      and first_row.value ->> 'ties' = second_row.value ->> 'ties'
      and (
        first_row.value ->> 'pointsForCenticredits'
          <> second_row.value ->> 'pointsForCenticredits'
        or first_row.value ->> 'allPlayHalfWinUnits'
          <> second_row.value ->> 'allPlayHalfWinUnits'
      )
  ),
  'Points For or all-play meaningfully resolves a tied matchup record'
);

select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_14_FINAL', 'owner-advance-open-week-15'
  )$$,
  'Week 15 opens with six-slot postseason scopes and byes'
);
select lives_ok(
  $$select api.use_owner_rehearsal_sample_card('owner-sample-week-15')$$,
  'the owner chooses a valid Week 15 sample'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_15_OPEN', 'owner-advance-week-15-final'
  )$$,
  'Week 15 advances through an instructive incomplete playoff card'
);
select ok(
  exists (
    select 1 from private.matchup_result_versions as result
    join private.matchups as matchup on matchup.id = result.matchup_id
    join private.season_weeks as week on week.id = result.week_id
    join private.owner_rehearsals as rehearsal
      on rehearsal.season_id = week.season_id
    where rehearsal.status = 'ACTIVE' and week.nfl_week = 15
      and matchup.postseason_role = 'CHAMPIONSHIP'
      and result.status = 'FINAL'
      and result.side_a_decision <> result.side_b_decision
  ),
  'the incomplete playoff card produces deterministic advancement evidence'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_15_FINAL', 'owner-advance-open-week-16'
  )$$,
  'Week 16 opens with the bye teams in the bracket'
);
select lives_ok(
  $$select api.use_owner_rehearsal_sample_card('owner-sample-week-16')$$,
  'the owner chooses a valid semifinal sample'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_16_OPEN', 'owner-advance-week-16-final'
  )$$,
  'Week 16 finalizes with deterministic advancement'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_16_FINAL', 'owner-advance-open-week-17'
  )$$,
  'the championship round opens'
);
select lives_ok(
  $$select api.use_owner_rehearsal_sample_card('owner-sample-week-17')$$,
  'the owner chooses a valid championship-week sample'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_17_OPEN', 'owner-advance-week-17-champion'
  )$$,
  'Week 17 finalizes one champion'
);
select is(
  (select count(*)::integer
   from private.playoff_publications as publication
   join private.owner_rehearsals as rehearsal
     on rehearsal.season_id = publication.season_id
   where rehearsal.status = 'ACTIVE'
     and publication.publication_stage = 'CHAMPION_FINAL'
     and publication.champion_entry_id is not null
     and not exists (
       select 1 from private.playoff_publications as successor
       where successor.supersedes_id = publication.id
     )),
  1,
  'exactly one effective champion is final at Week 17'
);

create temporary table rehearsal_week14_evidence as
select standing.ordered_rows
from private.standings_snapshots as standing
join private.owner_rehearsals as rehearsal
  on rehearsal.season_id = standing.season_id
where rehearsal.status = 'ACTIVE' and standing.through_week = 14
  and standing.status = 'FINAL';

select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_17_CHAMPION', 'owner-advance-open-week-18'
  )$$,
  'Week 18 opens only after champion finality'
);
select lives_ok(
  $$select api.use_owner_rehearsal_sample_card('owner-sample-week-18')$$,
  'the owner and every bot receive ordinary exhibition cards'
);
select lives_ok(
  $$select api.advance_owner_rehearsal(
    'WEEK_18_OPEN', 'owner-advance-week-18-archive'
  )$$,
  'Week 18 settles before archive finality'
);
select is(
  api.get_owner_rehearsal() ->> 'checkpoint',
  'COMPLETE',
  'the guided rehearsal reaches its recoverable completion checkpoint'
);
select is(
  (select count(*)::integer
   from private.season_weeks as week
   join private.owner_rehearsals as rehearsal
     on rehearsal.season_id = week.season_id
   where rehearsal.status = 'ACTIVE'),
  18,
  'the rehearsal stores all 18 authoritative weeks'
);
select is(
  (select count(*)::integer
   from private.weekly_cards as card
   join private.owner_rehearsals as rehearsal
     on rehearsal.season_id = card.season_id
   where rehearsal.status = 'ACTIVE'),
  180,
  'exactly one ordinary card exists per member per week'
);
select is(
  (select count(*)::integer
   from private.position_receipts as receipt
   join private.owner_rehearsals as rehearsal
     on rehearsal.league_id = receipt.league_id
   where rehearsal.status = 'ACTIVE'),
  176,
  'every completed card has one atomic receipt and four lessons remain intentionally incomplete'
);
select results_eq(
  $$select distinct settlement.outcome
    from private.settlement_versions as settlement
    join private.position_receipts as receipt
      on receipt.id = settlement.receipt_id
    join private.owner_rehearsals as rehearsal
      on rehearsal.league_id = receipt.league_id
    where rehearsal.status = 'ACTIVE'
    order by settlement.outcome$$,
  $$values ('LOSS'), ('PUSH'), ('VOID'), ('WIN')$$,
  'the season teaches win, loss, push, and void settlement'
);
select ok(
  not exists (
    select 1 from private.standings_snapshots as standing
    join private.owner_rehearsals as rehearsal
      on rehearsal.season_id = standing.season_id
    where rehearsal.status = 'ACTIVE' and standing.through_week > 14
  ),
  'postseason and Week 18 cannot change regular-season standings'
);
select results_eq(
  $$select ordered_rows from rehearsal_week14_evidence$$,
  $$select standing.ordered_rows
    from private.standings_snapshots as standing
    join private.owner_rehearsals as rehearsal
      on rehearsal.season_id = standing.season_id
    where rehearsal.status = 'ACTIVE' and standing.through_week = 14
      and standing.status = 'FINAL'$$,
  'Week 18 leaves official records, Points For, all-play, and misses unchanged'
);
select is(
  (select jsonb_array_length(archive.archive_json -> 'week18')
   from private.season_archive_versions as archive
   join private.owner_rehearsals as rehearsal
     on rehearsal.season_id = archive.season_id
   where rehearsal.status = 'ACTIVE'),
  5,
  'the archive retains five exhibition matchups separately'
);
select is(
  (select jsonb_array_length(
      archive.archive_json #> '{regularSeason,weeks}'
    )
   from private.season_archive_versions as archive
   join private.owner_rehearsals as rehearsal
     on rehearsal.season_id = archive.season_id
   where rehearsal.status = 'ACTIVE'),
  14,
  'official history and rivalry inputs retain only 14 regular weeks'
);
select is(
  (select season.lifecycle
   from private.seasons as season
   join private.owner_rehearsals as rehearsal
     on rehearsal.season_id = season.id
   where rehearsal.status = 'ACTIVE'),
  'FINAL',
  'archive finality occurs only after Week 18'
);

select throws_ok(
  $$select api.reset_owner_rehearsal(
    'Ordinary Live Boundary', 'owner-reset-live-name'
  )$$,
  'Rehearsal name confirmation does not match.',
  'reset cannot name or target the unrelated Live league'
);
select lives_ok(
  $$select api.reset_owner_rehearsal(
    'Sunday Ledger Owner Rehearsal', 'owner-reset-rehearsal-0001'
  )$$,
  'reset retires only the active synthetic rehearsal'
);
select is(
  (select status from private.owner_rehearsals
   where owner_user_id = '0a000000-0000-4000-8000-000000000001'),
  'RESET',
  'reset is an append-only retirement event'
);
select is(
  (select archived_at is null from private.leagues
   where slug = 'ordinary-live-boundary'),
  true,
  'the unrelated Live league remains untouched'
);
select throws_ok(
  $$select api.get_stage1_state(
    (select league.slug from private.leagues as league
     join private.owner_rehearsals as rehearsal
       on rehearsal.league_id = league.id
     where rehearsal.status = 'RESET')
  )$$,
  'League membership required.',
  'the retired rehearsal is no longer readable through product routes'
);
select lives_ok(
  $$select api.start_owner_rehearsal('owner-start-generation-02')$$,
  'the owner can safely begin one new active generation after reset'
);
select is(
  (select count(*)::integer from private.owner_rehearsals
   where owner_user_id = '0a000000-0000-4000-8000-000000000001'
     and status = 'ACTIVE'),
  1,
  'exactly one active rehearsal exists per owner'
);

select * from finish();
rollback;
