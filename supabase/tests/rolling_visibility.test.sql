begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- The prepared release is activated only inside this rolled-back fixture.
update private.authoritative_season_rulesets active
set ruleset_version = '1.3', product_bible_version = '3.2',
  canonical_json = prepared.canonical_json, sha256_hash = prepared.sha256_hash
from private.prepared_rolling_rulesets prepared where prepared.mode = active.mode;

insert into auth.users(id,email)
select ('9e000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'rolling-visibility-' || n || '@example.test' from generate_series(1,5) n;
insert into private.profiles(id,display_name)
select id, 'Visibility Member ' || right(id::text,1)
from auth.users where id::text like '9e000000-%';
create function pg_temp.as_member(n integer) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '9e000000-0000-4000-8000-' || lpad(n::text,12,'0'), 'role', 'authenticated'
  )::text, true);
end;
$$;
select pg_temp.as_member(1);
create temporary table visibility_context as
select league_id, season_id from api.create_league('Rolling Visibility', 'rolling-visibility', 'SIMULATION', 2026);
insert into private.league_memberships(league_id,user_id,role)
select context.league_id, ('9e000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'MEMBER'
from visibility_context context, generate_series(2,4) n;
insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak)
select context.season_id, context.league_id,
  ('9e000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, repeat(n::text,64)
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
and card.owner_user_id = '9e000000-0000-4000-8000-000000000002';
update visibility_context context set opponent_user_id = opponent.user_id
from private.matchups matchup join private.season_entries opponent
on opponent.id in (matchup.side_a_entry_id, matchup.side_b_entry_id)
where matchup.week_id = context.week_id
and context.selected_entry_id in (matchup.side_a_entry_id, matchup.side_b_entry_id)
and opponent.id <> context.selected_entry_id;

create function pg_temp.cards() returns jsonb language sql as $$
  select api.get_league_matchup_cards('rolling-visibility', week_id) from visibility_context;
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

select ok(private.is_rolling_week(week_id), 'fixture opens under the approved rolling rule package') from visibility_context;
select is(api.get_stage1_state('rolling-visibility') #>> '{week,rollingSubmissionsEnabled}', 'true', 'the week explicitly identifies incremental submission');
select ok((api.get_stage1_state('rolling-visibility') #>> '{ownerCard,canSubmit}')::boolean, 'the owner may submit before the former weekly lock');
select is(pg_temp.selected_card() -> 'selectedGames', '[]'::jsonb, 'no selected games exist before successful acceptance');
select is(pg_temp.selected_card() ->> 'submitted', 'false', 'an empty stored card is not submitted');
create temporary table visibility_draft as select pg_temp.positions(1,'MONEYLINE',200) positions;
select is(pg_temp.selected_card() -> 'selectedGames', '[]'::jsonb, 'a draft alone publishes no game');
select pg_temp.as_member(2);
select throws_ok($$select api.accept_stage1_card('rolling-visibility',pg_temp.positions(1,'MONEYLINE',1001),'visibility-invalid-batch')$$,
  '22023','The submitted bets exceed the remaining weekly credits.','a failed batch cannot publish selected games');
select pg_temp.as_member(1);
select is(pg_temp.selected_card() -> 'selectedGames', '[]'::jsonb, 'failed acceptance leaves the game list empty');
select pg_temp.as_member(2);
select lives_ok($$select api.accept_stage1_card('rolling-visibility',positions,'visibility-first-batch') from visibility_draft$$,
  'the first partial batch accepts through the real authority');
select pg_temp.as_member(1);
select is(jsonb_array_length(pg_temp.selected_card() -> 'selectedGames'), 1, 'successful acceptance immediately exposes the game before common lock');
select is(pg_temp.selected_card() ->> 'submitted', 'true', 'successful partial allocation immediately exposes the submission bit');
select is(pg_temp.selected_card() -> 'positions', '[]'::jsonb, 'actual bet details remain hidden before confirmed start');
select is(pg_temp.selected_card() -> 'outstanding', 'null'::jsonb, 'outstanding totals remain hidden before common lock');
select is(pg_temp.selected_card() -> 'availableCredits', 'null'::jsonb, 'unused allocation remains hidden before common lock');
select is(pg_temp.selected_card() -> 'expiredCredits', 'null'::jsonb, 'expired amount remains hidden before common lock');
select is(pg_temp.selected_card() -> 'canSubmit', 'null'::jsonb, 'eligibility cannot leak remaining budget before common lock');
select is(pg_temp.selected_card() -> 'readiness', 'null'::jsonb, 'the old aggregate readiness boundary remains intact');
select ok(not exists(select 1 from jsonb_array_elements(pg_temp.selected_card() -> 'selectedGames') event,
  jsonb_object_keys(event) field where field not in ('eventId','eventLabel','scheduledStartAt')),
  'each selected-game row contains only neutral game identity and kickoff');
create temporary table first_game_projection as select pg_temp.selected_card() -> 'selectedGames' games;
select pg_temp.as_member(2);
select lives_ok($$select api.accept_stage1_card('rolling-visibility',pg_temp.positions(1,'SPREAD',100),'visibility-second-batch')$$,
  'a different market on the same game accepts as another immutable batch');
select pg_temp.as_member(1);
select is(pg_temp.selected_card() -> 'selectedGames', (select games from first_game_projection),
  'a second market does not duplicate the game or disclose a per-game bet count');
select is((select card ->> 'sealed' from jsonb_array_elements(api.get_commissioner_card_status('rolling-visibility') -> 'cards') card
  where card ->> 'entryId' = (select selected_entry_id::text from visibility_context)), 'true',
  'commissioner submitted status recognizes partial accepted allocation');
select ok(not exists(select 1 from jsonb_array_elements(api.get_commissioner_card_status('rolling-visibility') -> 'cards') card,
  jsonb_object_keys(card) field where field not in ('entryId','displayName','sealed')),
  'commissioner roster contains only identity and the submission bit');
select pg_temp.as_opponent();
select is(api.get_stage1_state('rolling-visibility') #> '{matchup,opponentSelectedGames}', (select games from first_game_projection),
  'the scheduled opponent receives the same immediate distinct game list');
select is(api.get_stage1_state('rolling-visibility') #>> '{matchup,opponentSubmitted}', 'true', 'opponent status uses partial submissions');
select is(api.get_stage1_state('rolling-visibility') #> '{matchup,opponentAvailableCredits}', 'null'::jsonb,
  'the fallback matchup projection also gates unused allocation');
select is(api.get_stage1_state('rolling-visibility') #> '{matchup,opponentRevealedPositions}', '[]'::jsonb,
  'the fallback matchup projection contains no actual bet');
select pg_temp.as_member(2);
select is(jsonb_array_length(api.get_stage1_state('rolling-visibility') #> '{ownerCard,positions}'), 2,
  'accepted terms remain visible to their owner');
select is(api.get_stage1_state('rolling-visibility') #>> '{ownerCard,remainingCredits}', '700',
  'owners always see their own remaining original allocation');

select pg_temp.as_member(1);
select api.advance_simulated_time(context.league_id, week.common_lock_at, 'visibility-common-clock')
from visibility_context context join private.season_weeks week on week.id = context.week_id;
select is(pg_temp.selected_card() -> 'outstanding', '{"picks":2,"credits":300}'::jsonb,
  'the exact former common deadline reveals whole-card outstanding totals');
select is(pg_temp.selected_card() ->> 'availableCredits', '700', 'the established aggregate window exposes unused original credits');
select is(pg_temp.selected_card() ->> 'expiredCredits', '0', 'unused credits have not expired at the former common lock');
select is(pg_temp.selected_card() ->> 'canSubmit', 'true', 'later valid submission remains possible after the former common lock');
select is(pg_temp.selected_card() ->> 'readiness', 'COMPLIANT', 'the partial card participates normally after common lock');
select is((select card ->> 'readiness' from jsonb_array_elements(pg_temp.cards() -> 'cards') card
  where card ->> 'submitted' = 'false' limit 1), 'PENDING', 'zero submissions remain pending while later games can be selected');
select is((select card -> 'scoreCenticredits' from jsonb_array_elements(pg_temp.cards() -> 'cards') card
  where card ->> 'submitted' = 'false' limit 1), 'null'::jsonb, 'zero submissions do not create an official zero or absence prematurely');

select pg_temp.as_member(2);
select lives_ok($$select api.prepare_simulation_card_quotes('rolling-visibility')$$,
  'deterministic quote refresh keeps later Simulation submissions available');
select lives_ok($$select api.accept_stage1_card('rolling-visibility',pg_temp.positions(8,'TOTAL',100),'visibility-later-game')$$,
  'a later game accepts another partial batch after the former common lock');
select pg_temp.as_member(1);
select is(jsonb_array_length(pg_temp.selected_card() -> 'selectedGames'), 2,
  'a post-common-lock successful submission immediately adds its distinct game');
select is(pg_temp.selected_card() -> 'positions', '[]'::jsonb,
  'post-common-lock successful submission still does not reveal the selection');
select is(pg_temp.selected_card() -> 'outstanding', '{"picks":3,"credits":400}'::jsonb,
  'only the separately approved whole-card aggregate changes with the later bet');

select api.advance_simulated_time(context.league_id, (select min(scheduled_start_at) from private.sports_events where week_id=context.week_id),
  'visibility-scheduled-start') from visibility_context context;
select is(pg_temp.selected_card() -> 'positions', '[]'::jsonb, 'scheduled cutoff alone never reveals bet details');
select is(api.get_stage1_state('rolling-visibility') #>> '{slate,0,entryOpen}', 'false', 'the first game closes exactly at scheduled kickoff');
-- Confirm only the first game through the same start authority used by rehearsal.
select lives_ok($$select api.set_stage1_event_live(event.id,event.scheduled_start_at,'visibility-confirmed-start')
  from private.sports_events event where event.id = (
    select receipt.event_id from private.position_receipts receipt
    where receipt.card_id = (select selected_card_id from visibility_context)
    and receipt.market_type = 'MONEYLINE'
  )$$,
  'authoritative start evidence applies through the shared Simulation lifecycle');
select is(jsonb_array_length(pg_temp.selected_card() -> 'positions'), 2, 'both accepted markets reveal only with authoritative actual-start evidence');
select is(jsonb_array_length(pg_temp.selected_card() -> 'selectedGames'), 2, 'detail reveal does not duplicate the game list');

select api.advance_simulated_time(context.league_id, private.week_entry_closes_at(context.week_id),
  'visibility-entry-close') from visibility_context context;
select is(pg_temp.selected_card() ->> 'availableCredits', '0', 'unused credits stop being available at final slate entry cutoff');
select is(pg_temp.selected_card() ->> 'expiredCredits', '600', 'only original unspent credits expire');
select is(pg_temp.selected_card() ->> 'canSubmit', 'false', 'the member cannot submit after weekly entry closure');
select is((select card ->> 'readiness' from jsonb_array_elements(pg_temp.cards() -> 'cards') card
  where card ->> 'submitted' = 'false' limit 1), 'INCOMPLETE', 'zero submissions become incomplete only after final entry cutoff');
select is((select card ->> 'scoreCenticredits' from jsonb_array_elements(pg_temp.cards() -> 'cards') card
  where card ->> 'submitted' = 'false' limit 1), '0', 'the zero-submission score appears only after final entry cutoff');

select ok(not has_function_privilege('anon','api.get_league_matchup_cards(text,uuid)','execute'), 'anonymous callers cannot execute the member read');
select ok(not has_function_privilege('authenticated','private.rolling_card_public_fields(uuid,uuid)','execute'),
  'the internal projection cannot be called around the RPC authorization guard');
select pg_temp.as_member(5);
select throws_ok($$select pg_temp.cards()$$,'42501','League membership required.','a different account cannot discover selected games');
select throws_ok($$select api.get_stage1_state('rolling-visibility')$$,'42501','League membership required.','the main page read also rejects an outsider');
select pg_temp.as_member(3);
select lives_ok($$select pg_temp.cards()$$,'a league member may follow another pairing');
select throws_ok($$select api.get_commissioner_card_status('rolling-visibility')$$,'42501','Commissioner membership required.',
  'ordinary members cannot acquire commissioner roster access');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select pg_temp.cards()$$,'42501','League membership required.','missing auth context is denied');
select pg_temp.as_member(1);
set local role authenticated;
select lives_ok($$select api.get_stage1_state('rolling-visibility')$$, 'the actual authenticated role can use the authorized main read');
select is((select count(*) from private.position_receipts), 0::bigint, 'receipt RLS hides the other member even when its game identity is public');
reset role;

select * from finish();
rollback;
