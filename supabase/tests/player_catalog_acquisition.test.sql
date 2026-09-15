begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) select ('ac100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'catalog-quote-'||n||'@example.test' from generate_series(1,4) n;
insert into private.profiles(id,display_name) select id,'Catalog Member '||right(id::text,1) from auth.users where id::text like 'ac100000-%';
create function pg_temp.as_rolling_member(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub','ac100000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true); end; $$;
select pg_temp.as_rolling_member(1);
-- Create a real Live draft through the ordinary league authority.
create temporary table catalog_fixture_context as select league_id,season_id from api.create_league(
 p_name=>'Catalog Quotes',p_slug=>'catalog-quotes',p_mode=>'LIVE',p_nfl_year=>2026);
alter table catalog_fixture_context add column kickoff timestamptz default clock_timestamp()+interval '2 hours';
alter table catalog_fixture_context add column lease_id uuid;
alter table catalog_fixture_context add column review jsonb;
alter table catalog_fixture_context add column positions jsonb;
alter table catalog_fixture_context add column first_response jsonb;
alter table catalog_fixture_context add column first_week uuid;
insert into private.league_memberships(league_id,user_id,role)
 select q.league_id,('ac100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'MEMBER' from catalog_fixture_context q,generate_series(2,4) n;
insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak)
 select q.season_id,q.league_id,('ac100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,repeat(n::text,64) from catalog_fixture_context q,generate_series(2,4) n;
create function pg_temp.catalog_fixture_import(p_only_late boolean default false,p_price integer default 140)
returns jsonb language sql as $$
 select jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_agg(
 jsonb_build_object('source','THE_ODDS_API','externalEventId','catalog-game-'||n,'sportKey','americanfootball_nfl',
 'awayTeam','Away '||n,'homeTeam','Home '||n,'scheduledStartAt',q.kickoff,'markets',(
 select jsonb_agg(jsonb_build_object('sourceBook','draftkings','marketType',market,'outcomeKey',side,
 'proposition',proposition,'lineMilli',line,'americanOdds',odds,'observedAt',clock_timestamp()-interval '5 minutes'))
 from (values ('MONEYLINE','AWAY','Away to win',null::integer,-160),('MONEYLINE','HOME','Home to win',null::integer,p_price),
 ('SPREAD','AWAY','Away -3.5',-3500,-110),('SPREAD','HOME','Home +3.5',3500,-110),
 ('TOTAL','OVER','Over44.5',44500,-110),('TOTAL','UNDER','Under44.5',44500,-110)) m(market,side,proposition,line,odds)
 )) order by n)) from catalog_fixture_context q,generate_series(1,16) n where not p_only_late or n=2;
$$;
select api.publish_live_week_slate(q.league_id,
 (api.store_live_odds_import(q.league_id,pg_temp.catalog_fixture_import(),'catalog-initial-import')->>'importId')::uuid,
 array(select 'catalog-game-'||n from generate_series(1,16)n),'catalog-initial-publish') from catalog_fixture_context q;
update catalog_fixture_context set first_week=(select id from private.season_weeks where season_id=catalog_fixture_context.season_id);
select is(api.enqueue_player_catalog('catalog-quotes')->>'status','DISABLED','published game-only league does not acquire providers without explicit scope');
insert into private.player_prop_leagues(league_id,season_id,enabled,rules_enabled,catalog_enabled,first_enabled_week)
 select league_id,season_id,false,false,true,1 from catalog_fixture_context;
update private.player_result_policy set metadata_enabled=true,processing_enabled=false,provider_remaining=100,provider_observed_at=clock_timestamp(),provider_window_date=(clock_timestamp() at time zone 'UTC')::date;
select is(api.enqueue_player_catalog('catalog-quotes')->>'status','PENDING','commissioner queues existing published game-only week without activating rules');
select is((select count(*) from private.week_player_menu),0::bigint,'acquisition setup does not change a game-only menu');
select pg_temp.as_rolling_member(2);
select throws_ok($$select api.enqueue_player_catalog('catalog-quotes')$$,'42501','Commissioner access required.','member cannot trigger automatic acquisition');
select pg_temp.as_rolling_member(1);
create temporary table catalog_run as select api.claim_player_catalog_job((select first_week from catalog_fixture_context)) response;
select is((select response->>'status' from catalog_run),'CLAIMED','service worker leases queued scope');
select is((select jsonb_array_length(response->'events') from catalog_run),16,'all 16 published games are included in automatic scope');
select is(api.claim_player_catalog_job((select first_week from catalog_fixture_context))->>'status','IDLE','another worker cannot claim the same active job');
create temporary table catalog_cache as select api.claim_player_catalog_source('GAMES:2026') response;
select is((select response->>'status' from catalog_cache),'CLAIMED','public source request obtains a shared lease');
select is(api.claim_player_catalog_source('GAMES:2026')->>'status','WAIT','simultaneous league request waits on source lease');
select api.complete_player_catalog_source('GAMES:2026',(select (response->>'leaseId')::uuid from catalog_cache),'{"publicFixture":true}');
select is(api.claim_player_catalog_source('GAMES:2026')->>'status','CACHED','next league reuses source cache without paid request');
create temporary table catalog_metadata as select api.reserve_player_metadata_request() request_id;
select api.complete_player_result_request(request_id,null,99,10,null) from catalog_metadata;
insert into private.player_result_requests(request_class,reserved_at,completed_at)
 select 'METADATA',greatest(clock_timestamp()-interval '2 minutes',(date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC')),clock_timestamp() from generate_series(1,19);
select throws_ok($$select api.reserve_player_metadata_request()$$,'55000','Statistics metadata budget exhausted.','cold catalog stops at shared 20 metadata requests per day');
update private.player_result_requests set reserved_at=clock_timestamp()-interval '1 day' where request_class='METADATA';
update private.player_result_policy set provider_window_date=(clock_timestamp() at time zone 'UTC')::date-1,provider_remaining=0;
select throws_ok($$select api.reserve_player_metadata_request()$$,'55000','Statistics metadata requests unavailable.','UTC rollover cannot invent account quota');
create temporary table catalog_status as select api.claim_player_statistics_status() response;
select is((select response->>'status' from catalog_status),'CLAIMED','metadata-only queue gets account proof independently of result processing');
select api.complete_player_statistics_status((select (response->>'leaseId')::uuid from catalog_status),true,100,0,clock_timestamp());
select lives_ok($$select api.reserve_player_metadata_request()$$,'verified new day resumes the 34-call cold catalog without deadlocking at 20');
select api.import_player_catalog((select jsonb_agg(jsonb_build_object(
 'canonicalKey','catalog:'||e.fixture_event_key||':'||team||':'||pos,'displayName',team||' '||pos,'position',pos,
 'provider','THE_ODDS_API','externalEventId',e.fixture_event_key,'externalPlayerId',team||' '||pos,
 'team',team,'gameDate',(e.scheduled_start_at at time zone 'America/New_York')::date,'verifiedAt',clock_timestamp(),
 'evidenceHash',repeat('c',64),'roleRank',1,'roleEvidence','Verified provider position and recent usage','resultPathVerified',true))
 from private.sports_events e cross join lateral unnest(array[e.away_team,e.home_team]) team
 cross join unnest(array['QB','RB','WR']) pos where e.week_id=(select first_week from catalog_fixture_context)));
select ok(private.player_catalog_complete(first_week),'all 96 role-correct subjects have verified import records') from catalog_fixture_context;
update private.player_prop_leagues set rules_enabled=true,activated_at=clock_timestamp(),release_sha=repeat('0',40),approval_reference='Disposable acquisition test scope' where league_id=(select league_id from catalog_fixture_context);
select lives_ok($$select api.complete_player_catalog_job((select (response->>'leaseId')::uuid from catalog_run),'READY',0,null)$$,'successful durable completion proposes eligible planned menu');
select is((select count(*) from private.week_player_menu where week_id=(select first_week from catalog_fixture_context) and subject_id is not null),96::bigint,'all 96 proposals persist for one commissioner review');
select is(api.enqueue_player_catalog('catalog-quotes')->>'status','READY','fully imported catalog shortcircuits explicit Prepare without a key or provider call');
select lives_ok($$select api.prepare_player_prop_menu('catalog-quotes')$$,'explicit Prepare uses same persisted catalog and proposal authority');
select is((select count(*) from private.week_player_menu where confirmed_at is not null),0::bigint,'automatic acquisition never confirms on commissioner behalf');
select * from finish();
rollback;
