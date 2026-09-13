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


-- The pre-lock seal is derived from receipts, not finalized compliance.
update private.season_weeks set state='OPEN', common_lock_at=clock_timestamp()+interval '1 hour', locked_at=null
  where id='85000000-0000-4000-8000-000000000001';
update private.weekly_cards set compliance='PENDING',locked_at=null;
select ok(not has_function_privilege('anon','api.get_commissioner_card_status(text)','execute'),'anonymous role has no RPC grant');
select ok(has_function_privilege('authenticated','api.get_commissioner_card_status(text)','execute'),'authenticated callers reach the independent authorization check');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select api.get_commissioner_card_status('stage3-live-result-test')$$,'42501','Commissioner membership required.','anonymous context is rejected even with elevated test connection');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select api.get_commissioner_card_status('stage3-live-result-test')$$,'42501','Commissioner membership required.','same-league member cannot read roster seals');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select throws_ok($$select api.get_commissioner_card_status('stage3-live-result-test')$$,'42501','Commissioner membership required.','outsider cannot read roster seals');
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select api.get_commissioner_card_status('another-league')$$,'42501','Commissioner membership required.','commissioner cannot probe another league');
create temp table observed_card_status as select api.get_commissioner_card_status('stage3-live-result-test') value;
select is((select jsonb_array_length(value->'cards') from observed_card_status),4,'current frozen roster is complete');
select is((select count(*) from observed_card_status,jsonb_array_elements(value->'cards') card where (card->>'sealed')::boolean),1::bigint,'only the accepted full allocation is sealed before lock');
select is((select card->>'sealed' from observed_card_status,jsonb_array_elements(value->'cards') card where card->>'entryId'='84000000-0000-4000-8000-000000000001'),'true','pending compliance does not hide a successful seal');
select is((select card->>'sealed' from observed_card_status,jsonb_array_elements(value->'cards') card where card->>'entryId'='84000000-0000-4000-8000-000000000002'),'false','empty card is not sealed');
select ok(not exists(select 1 from observed_card_status,jsonb_array_elements(value->'cards') card,jsonb_object_keys(card) key where key not in ('entryId','displayName','sealed')),'rows contain no picks, credit amounts, counts, timestamps, odds or receipt identifiers');
select ok(not (api.get_stage1_state('stage3-live-result-test')->'commissioner' ? 'cards'),'shared member projection does not gain the roster');
-- A partial accepted allocation is still not sealed.
insert into private.position_receipts(id,card_id,week_id,league_id,entry_id,owner_user_id,event_id,market_snapshot_id,market_type,outcome_key,proposition,line_milli,american_odds,stake_credits,quote_observed_at,accepted_at,ruleset_snapshot_id,idempotency_key,request_hash,receipt_hash)
select '8b000000-0000-4000-8000-000000000002','8a000000-0000-4000-8000-000000000002',week_id,league_id,'84000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002',event_id,market_snapshot_id,market_type,outcome_key,proposition,line_milli,american_odds,250,quote_observed_at,accepted_at,ruleset_snapshot_id,'partial-card-status-test',repeat('7',64),repeat('8',64)
from private.position_receipts where id='8b000000-0000-4000-8000-000000000001';
select is((select card->>'sealed' from jsonb_array_elements(api.get_commissioner_card_status('stage3-live-result-test')->'cards') card where card->>'entryId'='84000000-0000-4000-8000-000000000002'),'false','a partial accepted card is not sealed');
-- Missing storage must not be presented as a definite failure to seal.
delete from private.weekly_cards where id='8a000000-0000-4000-8000-000000000004';
select is((select card->'sealed' from jsonb_array_elements(api.get_commissioner_card_status('stage3-live-result-test')->'cards') card where card->>'entryId'='84000000-0000-4000-8000-000000000004'),'null'::jsonb,'a missing card reports unavailable');
update private.season_weeks set state='LOCKED',locked_at=clock_timestamp() where id='85000000-0000-4000-8000-000000000001';
select is((select count(*) from jsonb_array_elements(api.get_commissioner_card_status('stage3-live-result-test')->'cards') card where (card->>'sealed')::boolean),1::bigint,'locking does not turn missing or partial cards into sealed cards');
-- A real membership-role change removes access immediately.
update private.league_memberships set role='MEMBER' where league_id='82000000-0000-4000-8000-000000000001' and user_id='81000000-0000-4000-8000-000000000001';
select throws_ok($$select api.get_commissioner_card_status('stage3-live-result-test')$$,'42501','Commissioner membership required.','former commissioner loses access immediately');
select * from finish();
rollback;
