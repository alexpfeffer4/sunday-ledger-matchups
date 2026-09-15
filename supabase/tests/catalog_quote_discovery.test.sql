begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) select ('ad100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'catalog-quote-'||n||'@example.test' from generate_series(1,4) n;
insert into private.profiles(id,display_name) select id,'Catalog Member '||right(id::text,1) from auth.users where id::text like 'ad100000-%';
create function pg_temp.as_rolling_member(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub','ad100000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true); end; $$;
select pg_temp.as_rolling_member(1);
-- Create a real Live draft through the ordinary league authority.
create temporary table catalog_fixture_context as select league_id,season_id from api.create_league(
 p_name=>'Discovery Quotes',p_slug=>'discovery-quotes',p_mode=>'LIVE',p_nfl_year=>2026);
alter table catalog_fixture_context add column kickoff timestamptz default clock_timestamp()+interval '2 hours';
alter table catalog_fixture_context add column lease_id uuid;
alter table catalog_fixture_context add column review jsonb;
alter table catalog_fixture_context add column positions jsonb;
alter table catalog_fixture_context add column first_response jsonb;
alter table catalog_fixture_context add column first_week uuid;
insert into private.league_memberships(league_id,user_id,role)
 select q.league_id,('ad100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'MEMBER' from catalog_fixture_context q,generate_series(2,4) n;
insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak)
 select q.season_id,q.league_id,('ad100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,repeat(n::text,64) from catalog_fixture_context q,generate_series(2,4) n;
create function pg_temp.catalog_fixture_import(p_only_late boolean default false,p_price integer default 140)
returns jsonb language sql as $$
 select jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_agg(
 jsonb_build_object('source','THE_ODDS_API','externalEventId','discovery-game-'||n,'sportKey','americanfootball_nfl',
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
 array(select 'discovery-game-'||n from generate_series(1,16)n),'catalog-initial-publish') from catalog_fixture_context q;
update catalog_fixture_context set first_week=(select id from private.season_weeks where season_id=catalog_fixture_context.season_id);
-- This fixture exercises the real empty-catalog discovery path, with no player
-- mappings, no player menus and no rules/offer activation.
select ok(not has_function_privilege('authenticated','api.claim_player_catalog_quote(uuid)','EXECUTE'),'members cannot reserve pre-menu discovery');
select ok(not has_function_privilege('anon','api.get_player_catalog_quotes(uuid)','EXECUTE'),'public visitors cannot read service catalog payloads');
select is(api.claim_player_catalog_quote((select first_week from catalog_fixture_context))->>'status','DISABLED','an unqueued game-only week cannot spend provider quota');
insert into private.player_prop_leagues(league_id,season_id,enabled,rules_enabled,catalog_enabled,first_enabled_week)
 select league_id,season_id,false,false,true,1 from catalog_fixture_context;
update private.player_result_policy set metadata_enabled=true;
select api.enqueue_player_catalog('discovery-quotes');
update private.odds_refresh_policy set enabled=true,provider_entitlement_credits=20000,requests_remaining=20000,
 daily_credit_limit=1000,monthly_credit_limit=5000,protected_core_daily_credits=350,protected_core_monthly_credits=2000,
 daily_credits=0,monthly_credits=0,prop_daily_credits=0,prop_monthly_credits=0;
create function pg_temp.discovery_payload(p_event text) returns jsonb language sql as $$
 select jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_build_array(jsonb_build_object(
  'source','THE_ODDS_API','externalEventId',e.fixture_event_key,'sportKey','americanfootball_nfl',
  'awayTeam',e.away_team,'homeTeam',e.home_team,'scheduledStartAt',e.scheduled_start_at,
  'requestedFamilies',jsonb_build_array('player_pass_yds','player_rush_yds','player_reception_yds'),
  -- Some complete events and two families of every other event are absent.
  -- Those successful negative observations also persist across the next tick.
  'markets',case when right(e.fixture_event_key,1) in('0','2','4','6','8') then '[]'::jsonb else
   (select jsonb_agg(jsonb_build_object('sourceBook','draftkings','marketType','PLAYER_PASSING_YARDS','statistic','PASSING_YARDS',
    'period','FULL_GAME','externalPlayerId','Unmapped Source QB','outcomeKey',side,'proposition','Unmapped Source QB '||side||' 250.5',
    'lineMilli',250500,'americanOdds',-110,'observedAt',clock_timestamp()-interval '1 minute'))
    from(values('OVER'),('UNDER')) sides(side)) end)))
 from private.sports_events e where e.fixture_event_key=p_event and e.week_id=(select first_week from catalog_fixture_context);
$$;
create function pg_temp.discover_tick(p_tick integer) returns setof text language plpgsql as $$
declare job jsonb;claim jsonb;facts jsonb;n integer;wk uuid:=(select first_week from catalog_fixture_context);
begin
 -- Advance only the disposable scheduled fixture; production leases and retry
 -- times are enforced by the job claim. Provider HTTP remains fully synthetic.
 update private.player_catalog_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where week_id=wk;
 job:=api.claim_player_catalog_job(wk);
 return next is(job->>'status','CLAIMED','tick '||p_tick||' leases pending discovery');
 for n in 1..2 loop
  update private.odds_refresh_policy set next_request_at='-infinity';
  claim:=api.claim_player_catalog_quote(wk);
  return next is(claim->>'status','CLAIMED','tick '||p_tick||' request '||n||' discovers next event');
  if claim->>'status'<>'CLAIMED' then return;end if;
  return next is(api.complete_shared_quote_request((claim->>'requestId')::uuid,
   pg_temp.discovery_payload(claim->>'externalEventId'),'{"last":3}') ->>'status','SUCCEEDED','tick '||p_tick||' persists exact three-family result');
 end loop;
 facts:=api.get_player_catalog_quotes(wk);
 return next is(jsonb_array_length(facts->'imports'),p_tick*2,'tick '||p_tick||' retains prior event identity progress');
 return next is((facts->>'pending')::boolean,p_tick<8,'tick '||p_tick||' truthfully reports remaining discovery');
 return next is(api.claim_player_catalog_quote(wk)->>'status',case when p_tick<8 then 'LIMIT' else 'CACHED' end,'tick '||p_tick||' cannot make a third paid call');
 -- Expire ordinary quote freshness between every tick. Retained identities,
 -- including confirmed absence, do not inherit the60s current-quote limit.
 update private.shared_quote_requests set fetched_at=fetched_at-interval '5 minutes' where kind='PROPS' and state='SUCCEEDED';
 perform api.complete_player_catalog_job((job->>'leaseId')::uuid,'PENDING',16-p_tick*2,null);
end; $$;
select pg_temp.discover_tick(n) from generate_series(1,8)n;
select is((select count(distinct event_ids[1]) from private.shared_quote_requests where kind='PROPS' and state='SUCCEEDED'),16::bigint,'eight bounded ticks discover all16 distinct published events');
select is((select count(*) from private.shared_quote_requests where kind='PROPS'),16::bigint,'no event was fetched again after its ordinary quote cache expired');
select is((select daily_credits from private.odds_refresh_policy),48,'the full cold16-game catalog reserves48 optional credits once');
select is((select count(*) from private.player_catalog_quote_evidence),48::bigint,'positive and negative families all have durable progress');
select is((select count(*) from private.live_quote_heads where subject_id is not null),0::bigint,'catalog discovery never creates or refreshes player quote heads');
select is((select count(*) from private.player_provider_mappings),0::bigint,'quote descriptions alone never become verified canonical player mappings');
select is((select count(*) from private.week_player_menu),0::bigint,'source discovery does not publish or freeze a player menu');
select ok((select max(fetched_at)<clock_timestamp()-interval '60 seconds' from private.shared_quote_requests where kind='PROPS'),'final retained identity evidence is explicitly stale for new quote proof');
-- A further scheduled attempt uses all cached successes, including fully empty
-- responses. No unbounded negative-discovery loop drains the optional budget.
update private.player_catalog_jobs set next_attempt_at=clock_timestamp()-interval '1 second';
select api.claim_player_catalog_job((select first_week from catalog_fixture_context));
select is(api.claim_player_catalog_quote((select first_week from catalog_fixture_context))->>'status','CACHED','successful absent families are not retried on the next scheduled tick');
select is((api.get_player_catalog_quotes((select first_week from catalog_fixture_context))->>'pending')::boolean,false,'known absence finishes discovery and leaves unproven players unavailable');
select is((select daily_credits from private.odds_refresh_policy),48,'cached negative discovery adds no paid reservation');
select * from finish();
rollback;
