begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Visibility applies to the already-open V1.2 week without activating new
-- entry, allocation, or scoring rules. Every receipt uses the real authority.
insert into auth.users(id,email)
select ('9f000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'legacy-game-visibility-' || n || '@example.test' from generate_series(1,5) n;
insert into private.profiles(id,display_name)
select id, 'Visibility Member ' || right(id::text,1)
from auth.users where id::text like '9f000000-%';
create function pg_temp.as_member(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '9f000000-0000-4000-8000-' || lpad(n::text,12,'0'), 'role', 'authenticated'
  )::text, true);
end;
$$;
select pg_temp.as_member(1);
create temporary table visibility_context as
select league_id, season_id from api.create_league('Legacy Game Visibility', 'legacy-game-visibility', 'SIMULATION', 2026);
insert into private.league_memberships(league_id,user_id,role)
select context.league_id, ('9f000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'MEMBER'
from visibility_context context, generate_series(2,4) n;
insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak)
select context.season_id, context.league_id,
  ('9f000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, repeat(n::text,64)
from visibility_context context, generate_series(2,4) n;
-- Establish the existing authoritative Simulation clock, then use normal commands.
update private.seasons set simulated_now = '2026-09-01 00:00:00+00'
where id = (select season_id from visibility_context);
select api.advance_simulated_time(league_id, '2026-09-13 16:00:00+00', 'visibility-clock-open') from visibility_context;
select api.publish_simulation_fixture_week(league_id, 1, 'sunday-ledger-authoritative-2026-v1', 'visibility-publish') from visibility_context;
select api.lock_live_roster_and_open_week(league_id, 'visibility-roster-open') from visibility_context;
alter table visibility_context add column week_id uuid;
alter table visibility_context add column selected_card_id uuid;
alter table visibility_context add column selected_entry_id uuid;
alter table visibility_context add column opponent_user_id uuid;
update visibility_context context set week_id = week.id
from private.season_weeks week where week.season_id = context.season_id and week.nfl_week = 1;
update visibility_context context set selected_card_id = card.id, selected_entry_id = card.entry_id
from private.weekly_cards card where card.week_id = context.week_id
and card.owner_user_id = '9f000000-0000-4000-8000-000000000002';
update visibility_context context set opponent_user_id = opponent.user_id
from private.matchups matchup join private.season_entries opponent
on opponent.id in (matchup.side_a_entry_id, matchup.side_b_entry_id)
where matchup.week_id = context.week_id
and context.selected_entry_id in (matchup.side_a_entry_id, matchup.side_b_entry_id)
and opponent.id <> context.selected_entry_id;

create function pg_temp.cards() returns jsonb language sql as $$
  select api.get_league_matchup_cards('legacy-game-visibility', week_id) from visibility_context;
$$;
create function pg_temp.selected_card() returns jsonb language sql as $$
  select card from visibility_context context,
    jsonb_array_elements(pg_temp.cards() -> 'cards') card
  where card ->> 'entryId' = context.selected_entry_id::text;
$$;
create function pg_temp.as_opponent() returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub',opponent_user_id,'role','authenticated')::text,true)
  from visibility_context;
$$;
create function pg_temp.positions(event_number integer, market text, stake integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('marketSnapshotId', snapshot.id,
    'payloadHash', snapshot.payload_hash, 'stakeCredits', stake))
  from (
    select event.id, row_number() over (order by event.scheduled_start_at, event.fixture_event_key) ordinal
    from private.sports_events event where event.week_id = (select week_id from visibility_context)
  ) event
  join private.live_quote_heads head on head.event_id = event.id and head.market_type = market
    and head.outcome_key = case when market = 'TOTAL' then 'OVER' else 'AWAY' end
  join private.market_snapshots snapshot on snapshot.id = head.market_snapshot_id
  where event.ordinal = event_number;
$$;


select is((select rules.ruleset_version from visibility_context context join private.season_weeks week on week.id=context.week_id
  join private.season_ruleset_snapshots rules on rules.id=week.ruleset_snapshot_id), '1.2', 'the current published week keeps its V1.2 rules');
select ok(not private.is_rolling_week(week_id), 'immediate game visibility does not enable rolling submissions') from visibility_context;
select ok(not coalesce((api.get_stage1_state('legacy-game-visibility') #>> '{week,rollingSubmissionsEnabled}')::boolean,false),
  'the legacy member state does not advertise rolling entry rules');
select is(pg_temp.selected_card() -> 'selectedGames','[]'::jsonb,'an unsubmitted legacy card reveals no games');
create temporary table legacy_snapshot as select to_jsonb(week) week, to_jsonb(rules) rules
from visibility_context context join private.season_weeks week on week.id=context.week_id
join private.season_ruleset_snapshots rules on rules.id=week.ruleset_snapshot_id;
create temporary table legacy_batch as select pg_temp.positions(1,'MONEYLINE',500)||pg_temp.positions(1,'SPREAD',500) positions;
select pg_temp.as_member(2);
select throws_ok($$select api.accept_stage1_card('legacy-game-visibility',pg_temp.positions(1,'MONEYLINE',200),'legacy-partial-rejected')$$,
 '22023','The complete card must allocate exactly 1,000 credits.','the current legacy week still rejects a partial allocation');
select pg_temp.as_member(1);
select is(pg_temp.selected_card() -> 'selectedGames','[]'::jsonb,'drafts and failed partial requests reveal no game identities');
select pg_temp.as_member(2);
select lives_ok($$select api.accept_stage1_card('legacy-game-visibility',positions,'legacy-complete-card') from legacy_batch$$,
 'the complete legacy card accepts through the unchanged authority');
select pg_temp.as_member(1);
select is(jsonb_array_length(pg_temp.selected_card() -> 'selectedGames'),1,'two accepted markets immediately expose one distinct game on V1.2');
select is(pg_temp.selected_card() ->> 'submitted','true','a successfully accepted legacy card exposes its submission fact');
select ok(not exists(select 1 from jsonb_array_elements(pg_temp.selected_card() -> 'selectedGames') event,
 jsonb_object_keys(event) field where field not in ('eventId','eventLabel','scheduledStartAt')),
 'legacy game previews contain only event identity, teams and kickoff; no markets, stakes, or counts');
select is(pg_temp.selected_card() -> 'positions','[]'::jsonb,'legacy bet details remain hidden before confirmed start');
select is(pg_temp.selected_card() -> 'outstanding','null'::jsonb,'legacy whole-card aggregates stay hidden before common lock');
select is(pg_temp.selected_card() -> 'readiness','null'::jsonb,'legacy readiness keeps its existing reveal boundary');
select is(pg_temp.selected_card() -> 'scoreCenticredits','null'::jsonb,'legacy game disclosure creates no score');
select ok(not (pg_temp.selected_card() ?| array['availableCredits','expiredCredits','canSubmit']),
 'the legacy projection does not gain rolling credit or eligibility fields');
create temporary table legacy_games as select pg_temp.selected_card() -> 'selectedGames' games;
select pg_temp.as_opponent();
select is(api.get_stage1_state('legacy-game-visibility') #> '{matchup,opponentSelectedGames}',(select games from legacy_games),
 'the paired-opponent fallback also reveals current-week legacy game identities immediately');
select is(api.get_stage1_state('legacy-game-visibility') #>> '{matchup,opponentSubmitted}','true','the paired fallback receives the legacy submission fact');
select is(api.get_stage1_state('legacy-game-visibility') #> '{matchup,opponentRevealedPositions}','[]'::jsonb,
 'the paired fallback still conceals legacy actual bets');
select ok(not ((api.get_stage1_state('legacy-game-visibility')->'matchup') ?| array['opponentAvailableCredits','opponentExpiredCredits','opponentCanSubmit']),
 'the paired legacy fallback does not advertise new rolling budget rules');
select pg_temp.as_member(2);
select is(jsonb_array_length(api.get_stage1_state('legacy-game-visibility') #> '{ownerCard,positions}'),2,
 'the owner retains access to both accepted legacy bets');
select is(api.get_stage1_state('legacy-game-visibility') #>> '{ownerCard,remainingCredits}','0','the owner retains the original full-allocation accounting');
select is(api.accept_stage1_card('legacy-game-visibility',positions,'legacy-complete-card')->>'replayed','true',
 'an exact legacy retry still returns the accepted batch') from legacy_batch;
select pg_temp.as_member(1);
select is(pg_temp.selected_card()->'selectedGames',(select games from legacy_games),'a retry never duplicates a public game');

-- Future rule activation must not rewrite the already-open week or its receipts.
update private.authoritative_season_rulesets active set ruleset_version='1.3',product_bible_version='3.2',
 canonical_json=prepared.canonical_json,sha256_hash=prepared.sha256_hash
from private.prepared_rolling_rulesets prepared where prepared.mode=active.mode;
select ok(not private.is_rolling_week(week_id),'activating future weeks leaves current-week acceptance and scoring on V1.2') from visibility_context;
select is((select to_jsonb(week) from visibility_context context join private.season_weeks week on week.id=context.week_id),
 (select week from legacy_snapshot),'visibility and future activation do not rewrite the current week');
select is((select to_jsonb(rules) from visibility_context context join private.season_weeks week on week.id=context.week_id
 join private.season_ruleset_snapshots rules on rules.id=week.ruleset_snapshot_id),(select rules from legacy_snapshot),
 'the current frozen rules snapshot remains byte-for-byte unchanged');
select is(pg_temp.selected_card()->'selectedGames',(select games from legacy_games),'game identity remains visible across future catalog activation');
select api.advance_simulated_time(context.league_id,week.common_lock_at,'legacy-common-clock')
from visibility_context context join private.season_weeks week on week.id=context.week_id;
select lives_ok($$select api.lock_stage1_week(league_id,'legacy-common-lock') from visibility_context$$,
 'the existing common-lock command still closes the legacy card window');
select is(pg_temp.selected_card()->'outstanding','{"picks":2,"credits":1000}'::jsonb,
 'legacy aggregate totals reveal only at their existing common lock');
select is((select count(*) from private.weekly_cards where week_id=(select week_id from visibility_context) and compliance='INCOMPLETE'),
 3::bigint,'zero-bet legacy cards retain the existing common-lock absence treatment');
select pg_temp.as_member(3);
select throws_ok($$select api.accept_stage1_card('legacy-game-visibility',pg_temp.positions(8,'TOTAL',1000),'legacy-late-rejected')$$,
 '55000','The current card is not open.','later games do not reopen the current legacy week after common lock');
select pg_temp.as_member(1);
select api.advance_simulated_time(context.league_id,(select min(scheduled_start_at) from private.sports_events where week_id=context.week_id),
 'legacy-scheduled-start') from visibility_context context;
select is(pg_temp.selected_card()->'positions','[]'::jsonb,'scheduled kickoff alone does not reveal actual legacy bets');
select lives_ok($$select api.set_stage1_event_live(event.id,event.scheduled_start_at,'legacy-confirmed-start')
 from private.sports_events event where event.id=(select receipt.event_id from private.position_receipts receipt
 where receipt.card_id=(select selected_card_id from visibility_context) limit 1)$$,'legacy start evidence uses the unchanged authoritative path');
select is(jsonb_array_length(pg_temp.selected_card()->'positions'),2,'actual legacy bets reveal only when their game has confirmed start evidence');
select is(pg_temp.selected_card()->'selectedGames',(select games from legacy_games),'confirmed start does not duplicate the public game list');
select pg_temp.as_member(5);
select throws_ok($$select pg_temp.cards()$$,'42501','League membership required.','an outsider cannot discover legacy game identities');
select throws_ok($$select api.get_stage1_state('legacy-game-visibility')$$,'42501','League membership required.','the paired legacy read also rejects outsiders');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select pg_temp.cards()$$,'42501','League membership required.','anonymous context cannot read legacy game identities');
select pg_temp.as_member(1);
set local role authenticated;
select lives_ok($$select api.get_stage1_state('legacy-game-visibility')$$,'authorized authenticated users receive the new legacy projection');
select is((select count(*) from private.position_receipts),0::bigint,'public game identities do not grant direct access to another member''s receipts');
reset role;
select * from finish();
rollback;
