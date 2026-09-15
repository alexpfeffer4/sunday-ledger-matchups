begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) select ('ad200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'catalog-quote-'||n||'@example.test' from generate_series(1,4) n;
insert into private.profiles(id,display_name) select id,'Catalog Member '||right(id::text,1) from auth.users where id::text like 'ad200000-%';
create function pg_temp.as_rolling_member(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub','ad200000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true); end; $$;
select pg_temp.as_rolling_member(1);
-- Create a real Live draft through the ordinary league authority.
create temporary table catalog_fixture_context as select league_id,season_id from api.create_league(
 p_name=>'Catalog Progress Retry',p_slug=>'catalog-progress-retry',p_mode=>'LIVE',p_nfl_year=>2026);
alter table catalog_fixture_context add column kickoff timestamptz default clock_timestamp()+interval '2 hours';
alter table catalog_fixture_context add column lease_id uuid;
alter table catalog_fixture_context add column review jsonb;
alter table catalog_fixture_context add column positions jsonb;
alter table catalog_fixture_context add column first_response jsonb;
alter table catalog_fixture_context add column first_week uuid;
insert into private.league_memberships(league_id,user_id,role)
 select q.league_id,('ad200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'MEMBER' from catalog_fixture_context q,generate_series(2,4) n;
insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak)
 select q.season_id,q.league_id,('ad200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,repeat(n::text,64) from catalog_fixture_context q,generate_series(2,4) n;
create function pg_temp.catalog_fixture_import(p_only_late boolean default false,p_price integer default 140)
returns jsonb language sql as $$
 select jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_agg(
 jsonb_build_object('source','THE_ODDS_API','externalEventId','retry-game-'||n,'sportKey','americanfootball_nfl',
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
 array(select 'retry-game-'||n from generate_series(1,16)n),'catalog-initial-publish') from catalog_fixture_context q;
update catalog_fixture_context set first_week=(select id from private.season_weeks where season_id=catalog_fixture_context.season_id);
-- This fixture exercises the real empty-catalog discovery path, with no player
-- mappings, no player menus and no rules/offer activation.
select ok(not has_function_privilege('authenticated','api.claim_player_catalog_quote(uuid)','EXECUTE'),'members cannot reserve pre-menu discovery');
select ok(not has_function_privilege('anon','api.get_player_catalog_quotes(uuid)','EXECUTE'),'public visitors cannot read service catalog payloads');
select is(api.claim_player_catalog_quote((select first_week from catalog_fixture_context))->>'status','DISABLED','an unqueued game-only week cannot spend provider quota');
insert into private.player_prop_leagues(league_id,season_id,enabled,rules_enabled,catalog_enabled,first_enabled_week)
 select league_id,season_id,false,false,true,1 from catalog_fixture_context;
update private.player_result_policy set metadata_enabled=true;
select api.enqueue_player_catalog('catalog-progress-retry');
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
create function pg_temp.retry_claim() returns uuid language plpgsql as $$
declare response jsonb;wk uuid:=(select first_week from catalog_fixture_context);
begin
 -- Only this disposable transaction advances its fixture due time. The hosted
 -- scheduler, current leases and provider quota are never altered by the fix.
 update private.player_catalog_jobs set next_attempt_at=clock_timestamp()-interval '1 second' where week_id=wk;
 response:=api.claim_player_catalog_job(wk);
 if response->>'status'<>'CLAIMED' then raise exception 'Fixture job did not claim';end if;
 update catalog_fixture_context set lease_id=(response->>'leaseId')::uuid;
 return (response->>'leaseId')::uuid;
end; $$;
create function pg_temp.retry_discover(p_success boolean default true) returns setof text language plpgsql as $$
declare response jsonb;completed jsonb;wk uuid:=(select first_week from catalog_fixture_context);
begin
 update private.odds_refresh_policy set next_request_at='-infinity';
 response:=api.claim_player_catalog_quote(wk);
 return next is(response->>'status','CLAIMED','uncached published event reserves one bounded request');
 completed:=api.complete_shared_quote_request((response->>'requestId')::uuid,
  case when p_success then pg_temp.discovery_payload(response->>'externalEventId') else null end,'{"last":3}');
 return next is(completed->>'status',case when p_success then 'SUCCEEDED' else 'FAILED' end,'synthetic discovery records its actual outcome');
 perform api.get_player_catalog_quotes(wk);
end; $$;
create function pg_temp.retry_finish(p_fast boolean,p_error text default 'CATALOG_IDENTITIES_OR_ROLES_UNRESOLVED',p_label text default 'completion')
returns setof text language plpgsql as $$
declare before_at timestamptz:=clock_timestamp();after_at timestamptz;actual timestamptz;
 wk uuid:=(select first_week from catalog_fixture_context);lease uuid:=(select lease_id from catalog_fixture_context);
begin
 perform api.complete_player_catalog_job(lease,'PENDING',96,p_error);
 after_at:=clock_timestamp();
 select next_attempt_at into actual from private.player_catalog_jobs where week_id=wk;
 if p_fast then
  return next ok(actual between date_bin(interval '5 minutes',before_at,timestamptz '2000-01-01 00:00Z')+interval '5 minutes'
   and date_bin(interval '5 minutes',after_at,timestamptz '2000-01-01 00:00Z')+interval '5 minutes',p_label||' resumes on the next existing five-minute tick');
 else
  return next ok(actual between before_at+interval '5 minutes' and after_at+interval '5 minutes',p_label||' retains its full five-minute retry delay');
 end if;
 return next ok((select lease_id is null and lease_until is null and state='PENDING' and missing_sources=96
  and last_error is not distinct from p_error from private.player_catalog_jobs where week_id=wk),p_label||' releases only its claimed job and retains unresolved status');
end; $$;

select ok(not has_function_privilege('authenticated','api.complete_player_catalog_job(uuid,text,integer,text)','EXECUTE'),'completion remains unavailable to members');
select ok(has_function_privilege('service_role','api.complete_player_catalog_job(uuid,text,integer,text)','EXECUTE'),'completion retains its service-only entry point');
select pg_temp.retry_claim();
select pg_temp.retry_finish(false,null,'No discovery progress');
select is(api.claim_player_catalog_job((select first_week from catalog_fixture_context))->>'status','IDLE','job cannot bypass its next-attempt guard');
select throws_ok($$select api.complete_player_catalog_job((select lease_id from catalog_fixture_context),'PENDING')$$,'55000','Catalog lease expired.','completed lease cannot be replayed');
select throws_ok($$select api.complete_player_catalog_job(gen_random_uuid(),'PENDING')$$,'55000','Catalog lease expired.','another lease cannot complete the job');

select pg_temp.retry_claim();
select pg_temp.retry_discover(false);
select pg_temp.retry_discover() from generate_series(1,3);
select pg_temp.retry_finish(false,null,'Mixed failure and successful progress');

select pg_temp.retry_claim();
select pg_temp.retry_discover() from generate_series(1,4);
-- Remove only the normal three-second cooldown in this disposable fixture so a
-- test run in the final three seconds before a cron boundary stays deterministic.
update private.odds_refresh_policy set next_request_at='-infinity';
select pg_temp.retry_finish(true,null,'Four successful new discoveries');
select pg_temp.retry_claim();
select pg_temp.retry_finish(false,null,'Earlier-lease successes without new progress');
-- A successful request associated with another week is not progress for this
-- job, even if an adversarial service row copies this exact lease identifier.
create temporary table retry_other_week as
 with inserted as (
  insert into private.season_weeks(season_id,league_id,nfl_week,opens_at,common_lock_at,ruleset_snapshot_id)
  select season_id,league_id,2,opens_at+interval '7 days',common_lock_at+interval '7 days',ruleset_snapshot_id
  from private.season_weeks where id=(select first_week from catalog_fixture_context)
  returning id
 ) select id from inserted;
insert into private.player_catalog_jobs(week_id) select id from retry_other_week;
select pg_temp.retry_claim();
insert into private.player_catalog_quote_attempts(job_lease_id,week_id,request_id)
 select c.lease_id,w.id,r.id from catalog_fixture_context c cross join retry_other_week w
 cross join lateral(select id from private.shared_quote_requests where state='SUCCEEDED' order by id limit 1)r;
select pg_temp.retry_finish(false,null,'Other-week success with the same lease identifier');

select pg_temp.retry_claim();
select pg_temp.retry_discover() from generate_series(1,4);
update private.odds_refresh_policy set next_request_at='-infinity';
select pg_temp.retry_finish(true,'CATALOG_IDENTITIES_OR_ROLES_UNRESOLVED','Healthy partial identity discovery');

select pg_temp.retry_claim();
select pg_temp.retry_discover() from generate_series(1,2);
select pg_temp.retry_finish(false,'CATALOG_SOURCE_UNAVAILABLE','Source error despite some successful requests');

select pg_temp.retry_claim();
select pg_temp.retry_discover() from generate_series(1,2);
update private.odds_refresh_policy set next_request_at=clock_timestamp()+interval '30 minutes';
select pg_temp.retry_finish(false,null,'Provider backoff despite successful progress');
select pg_temp.retry_claim();
select is(api.claim_player_catalog_quote((select first_week from catalog_fixture_context))->>'status','WAIT','new lease still respects provider backoff');
update private.odds_refresh_policy set next_request_at='-infinity',daily_credits=650,prop_daily_credits=650;
select throws_ok($$select api.claim_player_catalog_quote((select first_week from catalog_fixture_context))$$,'P0001','QUOTE_REFRESH_BUDGET','faster batches cannot spend protected core credits');
update private.odds_refresh_policy set daily_credits=48,prop_daily_credits=48;
select pg_temp.retry_discover();
select is(api.claim_player_catalog_quote((select first_week from catalog_fixture_context))->>'status','CACHED','all sixteen successful observations remain cached including empty markets');
select pg_temp.retry_finish(false,'CATALOG_IDENTITIES_OR_ROLES_UNRESOLVED','Only missing identities with no remaining discovery');

select is((select count(*) from private.shared_quote_requests where kind='PROPS' and state='SUCCEEDED'),16::bigint,'complete discovery keeps exactly sixteen successful event requests');
select is((select count(*) from private.player_catalog_quote_evidence),48::bigint,'all positive and absent families keep their twelve-hour evidence');
select is((select daily_credits from private.odds_refresh_policy),51,'sixteen successes plus one failed reservation cost the same fifty-one credits');
select is((select monthly_credits from private.odds_refresh_policy),51,'monthly accounting preserves failed reservations too');
select is((select count(*) from private.week_player_menu),0::bigint,'scheduling does not publish or freeze a player menu');

select pg_temp.retry_claim();
select is(api.claim_player_catalog_quote((select first_week from catalog_fixture_context))->>'status','CACHED','later no-progress lease does not refetch absent families');
select pg_temp.retry_finish(false,null,'Fully cached no-progress retry');
-- Adversarial service fixture: unlike the real adapter, which stops after its
-- first failed request, present sixteen prior failed attempts in one lease.
-- Uncached work still exists, so the seventeenth attempt must hit the SQL cap.
select pg_temp.retry_claim();
update private.player_catalog_quote_evidence set expires_at=clock_timestamp()-interval '1 second';
update private.shared_quote_requests set fetched_at=clock_timestamp()-interval '13 hours' where state='SUCCEEDED';
with failed as (
 insert into private.shared_quote_requests(kind,event_ids,families,state)
 select 'PROPS',array['retry-game-1'],array['player_pass_yds'],'FAILED' from generate_series(1,16)
 returning id
)
insert into private.player_catalog_quote_attempts(job_lease_id,week_id,request_id)
 select c.lease_id,c.first_week,failed.id from failed cross join catalog_fixture_context c;
select is(api.claim_player_catalog_quote((select first_week from catalog_fixture_context))->>'status','LIMIT','seventeenth attempt cannot reserve credits even when uncached work remains');
select is((select daily_credits from private.odds_refresh_policy),51,'rejected seventeenth attempt reserves no additional credits');
select pg_temp.retry_finish(false,null,'Attempt-limited failed lease');
select pg_temp.retry_claim();
update private.player_catalog_jobs set lease_until=clock_timestamp()-interval '1 second' where week_id=(select first_week from catalog_fixture_context);
select throws_ok($$select api.complete_player_catalog_job((select lease_id from catalog_fixture_context),'PENDING')$$,'55000','Catalog lease expired.','expired exact lease cannot complete');
select ok((select lease_id=(select lease_id from catalog_fixture_context) from private.player_catalog_jobs where week_id=(select first_week from catalog_fixture_context)),'rejected expired completion leaves the original row unchanged');
select throws_ok($$select api.complete_player_catalog_job(gen_random_uuid(),'INVALID')$$,'22023','Invalid catalog completion.','invalid completion status retains its input guard');
select * from finish();
rollback;
