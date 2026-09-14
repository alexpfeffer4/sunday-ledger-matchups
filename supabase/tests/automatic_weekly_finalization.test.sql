begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Four members, two published games, and an accepted card on only game one.
-- Uses the production default policy, not a fixture override.
insert into auth.users (id, email)
values
  ('81000000-0000-4000-8000-000000000001', 'live-result-commissioner@example.test'),
  ('81000000-0000-4000-8000-000000000002', 'live-result-member-2@example.test'),
  ('81000000-0000-4000-8000-000000000003', 'live-result-member-3@example.test'),
  ('81000000-0000-4000-8000-000000000004', 'live-result-member-4@example.test');

insert into private.profiles (id, display_name)
values
  ('81000000-0000-4000-8000-000000000001', 'Result Commissioner'),
  ('81000000-0000-4000-8000-000000000002', 'Result Member Two'),
  ('81000000-0000-4000-8000-000000000003', 'Result Member Three'),
  ('81000000-0000-4000-8000-000000000004', 'Result Member Four');

insert into private.leagues (id, name, slug, created_by)
values (
  '82000000-0000-4000-8000-000000000001',
  'Stage 3 Live Result Test',
  'stage3-live-result-test',
  '81000000-0000-4000-8000-000000000001'
);

insert into private.league_memberships (league_id, user_id, role)
values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'COMMISSIONER'),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002', 'MEMBER'),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000003', 'MEMBER'),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000004', 'MEMBER');

insert into private.season_ruleset_snapshots (
  id,
  ruleset_id,
  ruleset_version,
  product_bible_id,
  product_bible_version,
  mode,
  canonical_json,
  sha256_hash,
  frozen_at
)
values (
  '83000000-0000-4000-8000-000000000001',
  'live-season-1',
  '1.0',
  'sunday-ledger-product-bible',
  '3.0',
  'LIVE',
  '{"mode":"LIVE","correctionHours":24,"postponementHours":48}',
  repeat('a', 64),
  now() - interval '1 day'
);

insert into private.seasons (
  id,
  league_id,
  ruleset_snapshot_id,
  mode,
  nfl_year,
  lifecycle,
  roster_seed,
  schedule_seed,
  roster_locked_at
)
values (
  '83500000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  'LIVE',
  2026,
  'REGULAR',
  repeat('b', 64),
  repeat('c', 64),
  now() - interval '1 day'
);

insert into private.season_entries (
  id,
  season_id,
  league_id,
  user_id,
  standing_tiebreak
)
values
  ('84000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', repeat('1', 64)),
  ('84000000-0000-4000-8000-000000000002', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002', repeat('2', 64)),
  ('84000000-0000-4000-8000-000000000003', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000003', repeat('3', 64)),
  ('84000000-0000-4000-8000-000000000004', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000004', repeat('4', 64));

insert into private.season_weeks (
  id,
  season_id,
  league_id,
  nfl_week,
  state,
  opens_at,
  common_lock_at,
  locked_at
)
values (
  '85000000-0000-4000-8000-000000000001',
  '83500000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  1,
  'LOCKED',
  now() - interval '2 days',
  now() - interval '5 hours',
  now() - interval '5 hours'
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
  created_by
)
values (
  '86000000-0000-4000-8000-000000000001',
  '83500000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  1,
  'test-v1',
  'stage3-live-results',
  array[
    '84000000-0000-4000-8000-000000000001'::uuid,
    '84000000-0000-4000-8000-000000000002'::uuid,
    '84000000-0000-4000-8000-000000000003'::uuid,
    '84000000-0000-4000-8000-000000000004'::uuid
  ],
  repeat('d', 64),
  '81000000-0000-4000-8000-000000000001'
);

insert into private.matchups (
  id,
  week_id,
  season_id,
  league_id,
  schedule_publication_id,
  side_a_entry_id,
  side_b_entry_id,
  display_order
)
values
  ('87000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000002', 1),
  ('87000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000003', '84000000-0000-4000-8000-000000000004', 2);

insert into private.sports_events (
  id,
  week_id,
  season_id,
  league_id,
  fixture_event_key,
  away_team,
  home_team,
  scheduled_start_at
)
values
  ('88000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'provider-live-result-one', 'Buffalo Bills', 'New York Jets', now() - interval '3 hours'),
  ('88000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'provider-live-result-two', 'Chicago Bears', 'Green Bay Packers', now() - interval '2 hours');

insert into private.market_snapshots (
  id,
  event_id,
  week_id,
  league_id,
  book_key,
  market_type,
  outcome_key,
  proposition,
  line_milli,
  american_odds,
  quality_status,
  observed_at,
  payload_hash
)
values (
  '89000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  'draftkings',
  'MONEYLINE',
  'AWAY',
  'Buffalo Bills to win',
  null,
  100,
  'HEALTHY',
  now() - interval '6 hours',
  repeat('e', 64)
);

insert into private.live_quote_heads (
  event_id,
  week_id,
  league_id,
  market_type,
  outcome_key,
  market_snapshot_id
)
values (
  '88000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  'MONEYLINE',
  'AWAY',
  '89000000-0000-4000-8000-000000000001'
);

insert into private.weekly_cards (
  id,
  week_id,
  season_id,
  league_id,
  entry_id,
  owner_user_id,
  granted_at,
  compliance,
  locked_at
)
values
  ('8a000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', now() - interval '1 day', 'COMPLIANT', now() - interval '5 hours'),
  ('8a000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', now() - interval '1 day', 'INCOMPLETE', now() - interval '5 hours'),
  ('8a000000-0000-4000-8000-000000000003', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000003', now() - interval '1 day', 'INCOMPLETE', now() - interval '5 hours'),
  ('8a000000-0000-4000-8000-000000000004', '85000000-0000-4000-8000-000000000001', '83500000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000004', '81000000-0000-4000-8000-000000000004', now() - interval '1 day', 'INCOMPLETE', now() - interval '5 hours');

insert into private.position_receipts (
  id,
  card_id,
  week_id,
  league_id,
  entry_id,
  owner_user_id,
  event_id,
  market_snapshot_id,
  market_type,
  outcome_key,
  proposition,
  line_milli,
  american_odds,
  stake_credits,
  quote_observed_at,
  accepted_at,
  ruleset_snapshot_id,
  idempotency_key,
  request_hash,
  receipt_hash
)
values (
  '8b000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  '89000000-0000-4000-8000-000000000001',
  'MONEYLINE',
  'AWAY',
  'Buffalo Bills to win',
  null,
  100,
  1000,
  now() - interval '6 hours',
  now() - interval '5 hours',
  '83000000-0000-4000-8000-000000000001',
  'stage3-live-result-card',
  repeat('f', 64),
  repeat('9', 64)
);

create or replace function pg_temp.live_score_import(
  p_event_one_completed boolean,
  p_event_one_away integer,
  p_event_one_home integer,
  p_event_two_completed boolean,
  p_event_two_away integer,
  p_event_two_home integer
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'source', 'THE_ODDS_API',
    'fetchedAt', now(),
    'events', jsonb_build_array(
      jsonb_build_object(
        'source', 'THE_ODDS_API',
        'externalEventId', event.fixture_event_key,
        'sportKey', 'americanfootball_nfl',
        'awayTeam', event.away_team,
        'homeTeam', event.home_team,
        'scheduledStartAt', event.scheduled_start_at,
        'completed', p_event_one_completed,
        'awayScore', p_event_one_away,
        'homeScore', p_event_one_home,
        'lastUpdate', case when p_event_one_away is null then null else clock_timestamp() - interval '1 second' end
      ),
      (
        select jsonb_build_object(
          'source', 'THE_ODDS_API',
          'externalEventId', event_two.fixture_event_key,
          'sportKey', 'americanfootball_nfl',
          'awayTeam', event_two.away_team,
          'homeTeam', event_two.home_team,
          'scheduledStartAt', event_two.scheduled_start_at,
          'completed', p_event_two_completed,
          'awayScore', p_event_two_away,
          'homeScore', p_event_two_home,
          'lastUpdate', case when p_event_two_away is null then null else clock_timestamp() - interval '1 second' end
        )
        from private.sports_events as event_two
        where event_two.id = '88000000-0000-4000-8000-000000000002'
      )
    )
  )
  from private.sports_events as event
  where event.id = '88000000-0000-4000-8000-000000000001';
$$;


select is((select finalization_mode from private.season_weeks where id='85000000-0000-4000-8000-000000000001'), 'AFTER_RESULTS', 'new weeks default to automatic finalization');
select function_privs_are('private','finalize_completed_week',array['uuid'],'authenticated',array[]::text[], 'members cannot call the internal close operation');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select api.finalize_stage1_week('82000000-0000-4000-8000-000000000001','member-cannot-close')$$,'42501','Commissioner membership required.','a member cannot force weekly finality');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select lives_ok($$select api.import_live_scores('82000000-0000-4000-8000-000000000001',pg_temp.live_score_import(true,27,20,false,null,null),'auto-first-final')$$,'a confirmed game settles its picks');
select is((select state from private.season_weeks where id='85000000-0000-4000-8000-000000000001'),'LOCKED','an unpicked unfinished game still keeps the week open');
select is((select count(*) from private.matchup_result_versions where week_id='85000000-0000-4000-8000-000000000001'),2::bigint,'both matchups can settle before the whole slate finishes');
select ok((select correction_window_closes_at is null from private.season_weeks where id='85000000-0000-4000-8000-000000000001'),'no missing deadline is invented before slate completion');
select throws_ok($$select api.finalize_stage1_week('82000000-0000-4000-8000-000000000001','auto-too-early-close')$$,'55000','Every published game and card must be settled before the week is final.','compatibility close cannot bypass the all-games gate');
create temporary table original_receipts as select id,receipt_hash,stake_credits,american_odds from private.position_receipts;

select lives_ok($$select api.record_stage1_result('88000000-0000-4000-8000-000000000002','VOID',null,null,'Official cancellation recorded for the published game.','MANUAL_OBJECTIVE','auto-last-game-void')$$,'final or void on the last published game closes the week atomically');
select is((select state from private.season_weeks where id='85000000-0000-4000-8000-000000000001'),'FINAL','no mandatory wait or commissioner finalize action remains');
select ok((select correction_window_closes_at>clock_timestamp() from private.season_weeks where id='85000000-0000-4000-8000-000000000001'),'score-review time remains available after result finalization');
select is((select count(*) from private.weekly_score_versions s where s.status='FINAL' and not exists(select 1 from private.weekly_score_versions child where child.supersedes_id=s.id)),4::bigint,'all four terminal scores are final');
select is((select count(*) from private.matchup_result_versions r where r.status='FINAL' and not exists(select 1 from private.matchup_result_versions child where child.supersedes_id=r.id)),2::bigint,'all terminal matchup results are final');
select is((select count(*) from private.standings_snapshots s where s.status='FINAL' and not exists(select 1 from private.standings_snapshots child where child.supersedes_id=s.id)),1::bigint,'standings become final in the same operation');
select is(api.get_stage1_state('stage3-live-result-test')#>>'{week,finalizationMode}','AFTER_RESULTS','member read model carries the published close policy');
select is(api.get_live_week_operations('stage3-live-result-test')->>'correctionsOpen','true','commissioner correction controls remain available during score review');
select ok(exists(select 1 from private.due_score_events('82000000-0000-4000-8000-000000000001',true) where event_id='88000000-0000-4000-8000-000000000001'),'background correction checks remain eligible after automatic close');
select throws_ok($$select private.assert_week_review_complete('85000000-0000-4000-8000-000000000001')$$,'55000','The score review period must close before downstream playoff or archive publication.','final weekly results do not prematurely freeze downstream correction dependencies');

create temporary table before_retry as select (select count(*) from private.weekly_score_versions) scores,(select count(*) from private.matchup_result_versions) matchups,(select count(*) from private.standings_snapshots) standings;
select lives_ok($$select private.finalize_completed_week('85000000-0000-4000-8000-000000000001')$$,'automatic close is safe to repeat');
select lives_ok($$select api.finalize_stage1_week('82000000-0000-4000-8000-000000000001','auto-compatibility-close')$$,'an older client close call is a harmless acknowledgement');
select ok((select scores=(select count(*) from private.weekly_score_versions) and matchups=(select count(*) from private.matchup_result_versions) and standings=(select count(*) from private.standings_snapshots) from before_retry),'close retries append no duplicate score, matchup, or standings versions');

select lives_ok($$select api.correct_live_event_result('88000000-0000-4000-8000-000000000001','FINAL',7,35,'Official gamebook corrects the recorded final score.','auto-correct-final')$$,'verified corrections can supersede an automatically final result');
select is((select score_centicredits from private.weekly_score_versions where card_id='8a000000-0000-4000-8000-000000000001' order by created_at desc,id desc limit 1),0::bigint,'the corrected official score is applied');
select is((select status from private.weekly_score_versions where card_id='8a000000-0000-4000-8000-000000000001' order by created_at desc,id desc limit 1),'FINAL','correction never leaves a final card provisional');
select is((select count(*) from private.matchup_result_versions r where not exists(select 1 from private.matchup_result_versions child where child.supersedes_id=r.id) and r.status<>'FINAL'),0::bigint,'corrected terminal matchup results remain final');
select is((select status from private.standings_snapshots order by created_at desc,id desc limit 1),'FINAL','corrected standings remain final');
select is((select count(*) from private.corrections),1::bigint,'the original and corrected results are connected by visible history');
select is((select count(*) from private.event_result_versions where event_id='88000000-0000-4000-8000-000000000001'),2::bigint,'the original objective result is preserved');
select ok(not exists(select * from original_receipts except select id,receipt_hash,stake_credits,american_odds from private.position_receipts),'corrections preserve accepted receipts and stakes');

update private.season_weeks set correction_window_closes_at=clock_timestamp()-interval '1 second' where id='85000000-0000-4000-8000-000000000001';
select lives_ok($$select api.correct_live_event_result('88000000-0000-4000-8000-000000000001','FINAL',7,35,'Official gamebook corrects the recorded final score.','auto-correct-final')$$,'the exact correction retry still succeeds after its review period');
select throws_ok($$select api.correct_live_event_result('88000000-0000-4000-8000-000000000001','FINAL',35,7,'Another documented score change after review.','auto-after-window')$$,'55000','The correction window is closed.','the existing correction deadline remains enforced');
select is(api.get_live_week_operations('stage3-live-result-test')->>'correctionsOpen','false','closed correction controls have an authoritative state');
select ok(not exists(select 1 from private.due_score_events('82000000-0000-4000-8000-000000000001',true)),'automatic polling ends after the review period');
select lives_ok($$select private.assert_week_review_complete('85000000-0000-4000-8000-000000000001')$$,'downstream publication is allowed after review');
-- Separate routing scenario: a later published week must not divert an earlier
-- week's still-eligible score review. Re-arm only this disposable fixture.
update private.season_weeks set correction_window_closes_at=clock_timestamp()+interval '1 hour' where id='85000000-0000-4000-8000-000000000001';
insert into private.season_weeks(id,season_id,league_id,nfl_week,state,opens_at,common_lock_at)
values('85000000-0000-4000-8000-000000000002','83500000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',2,'PLANNED',clock_timestamp()+interval '1 day',clock_timestamp()+interval '6 days');
insert into private.sports_events(id,week_id,season_id,league_id,fixture_event_key,away_team,home_team,scheduled_start_at)
values('88000000-0000-4000-8000-000000000003','85000000-0000-4000-8000-000000000002','83500000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','auto-next-week-game','Next Away','Next Home',clock_timestamp()+interval '7 days');
select ok(exists(select 1 from private.due_score_events('82000000-0000-4000-8000-000000000001',true) where event_id='88000000-0000-4000-8000-000000000001'),'a later week does not stop eligible earlier score checks');
select lives_ok($$select api.import_live_scores('82000000-0000-4000-8000-000000000001',jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_build_array(pg_temp.live_score_import(true,35,7,false,null,null)#>'{events,0}')),'auto-prior-week-provider-correction')$$,'provider correction is routed by its published game to the earlier final week');
select is((select score_centicredits from private.weekly_score_versions where card_id='8a000000-0000-4000-8000-000000000001' order by created_at desc,id desc limit 1),200000::bigint,'the provider correction updates the earlier score');
select is((select status from private.weekly_score_versions where card_id='8a000000-0000-4000-8000-000000000001' order by created_at desc,id desc limit 1),'FINAL','the provider correction preserves final status');
select is((select state from private.season_weeks where nfl_week=2),'PLANNED','the later week remains untouched');
select throws_ok($$select api.import_live_scores('82000000-0000-4000-8000-000000000001',jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_build_array(pg_temp.live_score_import(true,35,7,false,null,null)#>'{events,0}',jsonb_build_object('externalEventId','auto-next-week-game'))),'auto-reject-mixed-week-batch')$$,'22023','The live score batch must match published events.','mixed-week imports cannot cross the published-week boundary');
select * from finish();
rollback;
