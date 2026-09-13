-- Reuse the established four-member Live result fixture, with isolated IDs and rollback.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
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



create function pg_temp.cards() returns jsonb language sql as $$
  select api.get_league_matchup_cards('stage3-live-result-test','85000000-0000-4000-8000-000000000001')
$$;
select ok(not has_function_privilege('anon','api.get_league_matchup_cards(text,uuid)','execute'),'anonymous execute denied');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select pg_temp.cards()$$,'42501','League membership required.','anonymous context denied');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select throws_ok($$select pg_temp.cards()$$,'42501','League membership required.','outsider denied');
-- Member Three is neither the card owner nor the owner's opponent.
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select api.get_league_matchup_cards('stage3-live-result-test','85000000-0000-4000-8000-000000000099')$$,'P0002','Published week not found.','foreign or unknown week denied');
select throws_ok($$select api.get_league_matchup_cards('another-league','85000000-0000-4000-8000-000000000001')$$,'42501','League membership required.','foreign league denied');
select is(jsonb_array_length(pg_temp.cards()->'cards'),4,'same-league spectator sees all four card summaries');
select ok(not (pg_temp.cards()::text like '%Buffalo Bills to win%'),'scheduled receipt hidden even after scheduled kickoff');
select ok(not (pg_temp.cards()::text like '%8b000000%'),'unrevealed receipt identifier absent');
select is(pg_temp.cards()#>'{cards,0,scoreCenticredits}','null'::jsonb,'no score before reliable start');
update private.season_weeks set state='OPEN',locked_at=null where id='85000000-0000-4000-8000-000000000001';
select is(pg_temp.cards()#>'{cards,0,readiness}','null'::jsonb,'pregame compliance and submission facts stay private');
select ok(not (pg_temp.cards()::text ~ 'allocated|remaining|receiptHash|acceptedAt|owner_user_id|sealed'),'no hidden metadata fields');
update private.season_weeks set state='LOCKED',locked_at=clock_timestamp() where id='85000000-0000-4000-8000-000000000001';
update private.sports_events set state='LIVE',actual_started_at=clock_timestamp()+interval '1 hour' where id='88000000-0000-4000-8000-000000000001';
select is(jsonb_array_length(pg_temp.cards()#>'{cards,0,positions}'),0,'future start evidence does not reveal');
update private.sports_events set actual_started_at=clock_timestamp()-interval '1 minute' where id='88000000-0000-4000-8000-000000000001';
select is(jsonb_array_length(pg_temp.cards()#>'{cards,0,positions}'),1,'confirmed live pick visible to spectator');
select is(pg_temp.cards()#>>'{cards,0,positions,0,proposition}','Buffalo Bills to win','visible terms retain accepted proposition');
select is(pg_temp.cards()#>>'{cards,0,scoreCenticredits}','0','compliant card has actual zero before settlement');
select is(pg_temp.cards()#>>'{cards,1,scoreCenticredits}','0','incomplete card has official zero');
-- Add a future event/receipt to the same card; revealed response must not change.
create temp table prior_reveal as select pg_temp.cards() value;
insert into private.sports_events(id,week_id,season_id,league_id,fixture_event_key,away_team,home_team,scheduled_start_at)
select '88000000-0000-4000-8000-000000000003',week_id,season_id,league_id,'future-private-game','Future Away','Future Home',clock_timestamp()+interval '2 hours'
from private.sports_events where id='88000000-0000-4000-8000-000000000001';
insert into private.market_snapshots(id,event_id,week_id,league_id,market_type,outcome_key,proposition,line_milli,american_odds,quality_status,observed_at,payload_hash)
select '89000000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000003',week_id,league_id,market_type,outcome_key,'SECRET FUTURE PICK',line_milli,american_odds,quality_status,observed_at,repeat('8',64)
from private.market_snapshots where id='89000000-0000-4000-8000-000000000001';
insert into private.live_quote_heads(event_id,week_id,league_id,market_type,outcome_key,market_snapshot_id)
select event_id,week_id,league_id,market_type,outcome_key,id
from private.market_snapshots where id='89000000-0000-4000-8000-000000000002';
insert into private.position_receipts(id,card_id,week_id,league_id,entry_id,owner_user_id,event_id,market_snapshot_id,market_type,outcome_key,proposition,line_milli,american_odds,stake_credits,quote_observed_at,accepted_at,ruleset_snapshot_id,idempotency_key,request_hash,receipt_hash)
select '8b000000-0000-4000-8000-000000000002',card_id,week_id,league_id,entry_id,owner_user_id,'88000000-0000-4000-8000-000000000003','89000000-0000-4000-8000-000000000002',market_type,outcome_key,'SECRET FUTURE PICK',line_milli,american_odds,50,quote_observed_at,accepted_at,ruleset_snapshot_id,'future-read-test',repeat('7',64),repeat('8',64)
from private.position_receipts where id='8b000000-0000-4000-8000-000000000001';
select is(pg_temp.cards(),(select value from prior_reveal),'hidden pick cannot affect payload or any derived score/metadata');
-- Latest append-only settlement is used, including a correction.
insert into private.event_result_versions(id,event_id,week_id,league_id,version,status,away_score,home_score,source,reason,recorded_by,input_hash)
values('8c000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',1,'FINAL',20,10,'MANUAL_OBJECTIVE','test result','81000000-0000-4000-8000-000000000001',repeat('5',64));
insert into private.settlement_versions(receipt_id,result_version_id,week_id,league_id,owner_user_id,outcome,returned_centicredits)
values('8b000000-0000-4000-8000-000000000001','8c000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','WIN',200000);
select is(pg_temp.cards()#>>'{cards,0,scoreCenticredits}','200000','score reproduces visible settlement');
insert into private.event_result_versions(id,event_id,week_id,league_id,version,status,away_score,home_score,source,reason,recorded_by,input_hash,supersedes_id)
select '8c000000-0000-4000-8000-000000000002',event_id,week_id,league_id,2,'FINAL',10,20,source,'test correction',recorded_by,repeat('6',64),id
from private.event_result_versions where id='8c000000-0000-4000-8000-000000000001';
insert into private.settlement_versions(receipt_id,result_version_id,week_id,league_id,owner_user_id,outcome,returned_centicredits,supersedes_id)
select receipt_id,'8c000000-0000-4000-8000-000000000002',week_id,league_id,owner_user_id,'LOSS',0,id
from private.settlement_versions where result_version_id='8c000000-0000-4000-8000-000000000001';
select is(pg_temp.cards()#>>'{cards,0,scoreCenticredits}','0','latest correction replaces the earlier return without double-counting');
select is(pg_temp.cards()#>>'{cards,0,positions,0,settlement,outcome}','LOSS','revealed pick shows the corrected outcome');
update private.sports_events set state='VOID',actual_started_at=null where id='88000000-0000-4000-8000-000000000003';
select is(jsonb_array_length(pg_temp.cards()#>'{cards,0,positions}'),2,'authoritatively voided event is public without kickoff');
delete from private.league_memberships where league_id='82000000-0000-4000-8000-000000000001' and user_id='81000000-0000-4000-8000-000000000003';
select throws_ok($$select pg_temp.cards()$$,'42501','League membership required.','removed member immediately loses access');
select * from finish();
rollback;
