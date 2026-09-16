-- Reuses the canonical two-league quote setup, then proves scheduled fan-out.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) select ('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'rolling-quote-'||n||'@example.test' from generate_series(1,4) n;
insert into private.profiles(id,display_name) select id,'Rolling Quote Member '||right(id::text,1) from auth.users where id::text like 'a1000000-%';
create function pg_temp.as_rolling_member(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub','a1000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true); end; $$;
select pg_temp.as_rolling_member(1);
-- Create the draft under V1.2 before activating V1.3: this is a real rollout case.
create temporary table rolling_quote_context as select league_id,season_id from api.create_league(
 p_name=>'Rolling Quotes',p_slug=>'rolling-quotes',p_mode=>'LIVE',p_nfl_year=>2026);
alter table rolling_quote_context add column kickoff timestamptz default clock_timestamp()+interval '2 hours';
alter table rolling_quote_context add column lease_id uuid;
alter table rolling_quote_context add column review jsonb;
alter table rolling_quote_context add column positions jsonb;
alter table rolling_quote_context add column first_response jsonb;
alter table rolling_quote_context add column first_week uuid;
insert into private.league_memberships(league_id,user_id,role)
 select q.league_id,('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'MEMBER' from rolling_quote_context q,generate_series(2,4) n;
insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak)
 select q.season_id,q.league_id,('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,repeat(n::text,64) from rolling_quote_context q,generate_series(2,4) n;
create function pg_temp.rolling_quote_import(p_only_late boolean default false,p_price integer default 140)
returns jsonb language sql as $$
 select jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_agg(
 jsonb_build_object('source','THE_ODDS_API','externalEventId','rolling-game-'||n,'sportKey','americanfootball_nfl',
 'awayTeam','Away '||n,'homeTeam','Home '||n,'scheduledStartAt',q.kickoff+(n-1)*interval '26 hours','markets',(
 select jsonb_agg(jsonb_build_object('sourceBook','draftkings','marketType',market,'outcomeKey',side,
 'proposition',proposition,'lineMilli',line,'americanOdds',odds,'observedAt',clock_timestamp()-interval '5 minutes'))
 from (values ('MONEYLINE','AWAY','Away to win',null::integer,-160),('MONEYLINE','HOME','Home to win',null::integer,p_price),
 ('SPREAD','AWAY','Away -3.5',-3500,-110),('SPREAD','HOME','Home +3.5',3500,-110),
 ('TOTAL','OVER','Over44.5',44500,-110),('TOTAL','UNDER','Under44.5',44500,-110)) m(market,side,proposition,line,odds)
 )) order by n)) from rolling_quote_context q,generate_series(1,2) n where not p_only_late or n=2;
$$;
select api.publish_live_week_slate(q.league_id,
 (api.store_live_odds_import(q.league_id,pg_temp.rolling_quote_import(),'rolling-initial-import')->>'importId')::uuid,
 array['rolling-game-1','rolling-game-2'],'rolling-initial-publish') from rolling_quote_context q;
update rolling_quote_context set first_week=(select id from private.season_weeks where season_id=rolling_quote_context.season_id);
update private.authoritative_season_rulesets a set ruleset_version='1.4',product_bible_version='3.3',canonical_json=p.canonical_json,
 sha256_hash=p.sha256_hash from private.prepared_player_props_rulesets p where p.mode=a.mode;
update private.odds_refresh_policy set enabled=true,requests_remaining=500;
update rolling_quote_context set lease_id=(api.claim_live_quote_refresh(league_id)->>'leaseId')::uuid;
select lives_ok($$select api.complete_live_quote_refresh(lease_id,pg_temp.rolling_quote_import(),497) from rolling_quote_context$$,'initial freshness acquisition remains available on the old draft');
select lives_ok($$select api.lock_live_roster_and_open_week(league_id,'rolling-lock-open') from rolling_quote_context$$,'oldV1.2 draft opens successfully afterV1.3 activation');
select ok(private.is_rolling_week(first_week),'prepared props package inherits rolling entry') from rolling_quote_context;
select is((select r.ruleset_version from private.seasons s join private.season_ruleset_snapshots r on r.id=s.ruleset_snapshot_id where s.id=c.season_id),'1.2','activation leaves original season snapshot intact') from rolling_quote_context c;
create function pg_temp.rolling_live_positions(p_event integer,p_stake integer,p_review text default null) returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('marketSnapshotId',s.id,'payloadHash',s.payload_hash,'stakeCredits',p_stake)
 ||case when p_review is null then '{}'::jsonb else jsonb_build_object('reviewId',p_review) end)
 from private.live_quote_heads h join private.market_snapshots s on s.id=h.market_snapshot_id join private.sports_events e on e.id=h.event_id
 where h.week_id=(select first_week from rolling_quote_context) and e.fixture_event_key='rolling-game-'||p_event and h.market_type='MONEYLINE' and h.outcome_key='HOME';
$$;
insert into private.player_subjects(id,canonical_key,display_name,position) values
 ('fa000000-0000-4000-8000-000000000001','fixture-qb-away','Away QB','QB'),
 ('fa000000-0000-4000-8000-000000000002','fixture-qb-home','Home QB','QB');
insert into private.player_provider_mappings(provider,external_event_id,external_player_id,subject_id,team,game_date,verified_at,evidence_hash,role_rank,role_evidence,result_path_verified)
 select 'THE_ODDS_API','rolling-game-1',s.display_name,s.id,case when s.display_name='Away QB' then 'Away 1' else 'Home 1' end,
 (q.kickoff at time zone 'America/New_York')::date,clock_timestamp(),repeat('b',64),1,'Verified synthetic role fixture',true
 from private.player_subjects s,rolling_quote_context q where s.id::text like 'fa000000-%';
update private.player_prop_controls set offers_enabled=true;
insert into private.player_prop_leagues select league_id,true from rolling_quote_context;
select api.prepare_player_prop_menu('rolling-quotes');
select api.confirm_player_prop_menu('rolling-quotes',(select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id)) from private.week_player_menu where week_id=(select first_week from rolling_quote_context)));
create temporary table prop_quote_context(plan_id uuid,request_id uuid,snapshot_id uuid,credits integer,second_league uuid,second_plan uuid,second_review jsonb,second_positions jsonb);
insert into prop_quote_context(credits) select daily_credits from private.odds_refresh_policy;
update prop_quote_context set plan_id=(api.plan_player_menu_quotes((select league_id from rolling_quote_context))->>'planId')::uuid;
update prop_quote_context set request_id=(select request_ids[1] from private.member_quote_plans where id=plan_id);
select is((select cardinality(request_ids) from private.member_quote_plans where id=p.plan_id),1,'menu bootstrap fetches only the one known player statistic/event') from prop_quote_context p;
select is((select families from private.shared_quote_requests where id=p.request_id),array['player_pass_yds'],'passing-only menu consumes one provider family') from prop_quote_context p;
update private.odds_refresh_policy set next_request_at='-infinity';
select is(api.claim_shared_quote_request(plan_id,request_id)->>'status','CLAIMED','each network request gets its own reservation') from prop_quote_context;
select is((select daily_credits from private.odds_refresh_policy),credits+1,'single selected prop family reserves exactly one credit') from prop_quote_context;
create function pg_temp.prop_quote_payload(p_missing boolean default false,p_price integer default -110) returns jsonb language sql as $$
 select jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_build_array(jsonb_build_object(
  'source','THE_ODDS_API','externalEventId','rolling-game-1','sportKey','americanfootball_nfl','awayTeam','Away 1','homeTeam','Home 1',
  'scheduledStartAt',q.kickoff,'requestedFamilies',jsonb_build_array('player_pass_yds'),'markets',coalesce((select jsonb_agg(jsonb_build_object(
   'sourceBook','draftkings','marketType','PLAYER_PASSING_YARDS','statistic','PASSING_YARDS','period','FULL_GAME','externalPlayerId',ps.display_name,
   'outcomeKey',side,'proposition',ps.display_name||' '||side||' 250.5','lineMilli',250500,'americanOdds',p_price,'observedAt',clock_timestamp()-interval '1 minute'))
   from private.player_subjects ps cross join(values('OVER'),('UNDER')) sides(side) where ps.id::text like 'fa000000-%' and not p_missing),'[]'::jsonb))))
 from rolling_quote_context q;
$$;
select lives_ok($$select api.complete_shared_quote_request(request_id,pg_temp.prop_quote_payload(),'{"remaining":496,"used":4,"last":1}') from prop_quote_context$$,'strict prop response completes its exact coverage');
select lives_ok($$select api.apply_live_quote_plan(plan_id) from prop_quote_context$$,'verified mapped subjects import through the trusted snapshot path');
select is((select count(*) from private.live_quote_heads where week_id=c.first_week and subject_id is not null),4::bigint,'both QBs have independent Over and Under heads') from rolling_quote_context c;
update prop_quote_context set snapshot_id=(select market_snapshot_id from private.live_quote_heads where subject_id='fa000000-0000-4000-8000-000000000001' and outcome_key='OVER');
create function pg_temp.selected_prop_positions() returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('marketSnapshotId',s.id,'payloadHash',s.payload_hash,'stakeCredits',100))
 from private.market_snapshots s where s.id=(select snapshot_id from prop_quote_context);
$$;
select pg_temp.as_rolling_member(2);
select lives_ok($$select api.review_live_card_quotes('rolling-quotes',pg_temp.selected_prop_positions())$$,'member obtains30-second exact-subject proof from shared coverage');
select is((api.plan_live_quote_refresh((select league_id from rolling_quote_context),pg_temp.selected_prop_positions())->'requestIds'->>0)::uuid,
 (select request_id from prop_quote_context),'another member reuses identical public coverage');
select is((select daily_credits from private.odds_refresh_policy),(select credits+1 from prop_quote_context),'shared plan does not reserve another provider call');
select throws_ok($$select api.plan_player_menu_quotes((select league_id from rolling_quote_context))$$,'42501','Commissioner membership required.','member cannot refresh every game from a page');
select lives_ok($$select api.plan_player_menu_quotes((select league_id from rolling_quote_context),(select event_id from private.market_snapshots where id=(select snapshot_id from prop_quote_context)))$$,'member explicitly checks late frozen-player quotes for one published event');
-- A new independent league uses the exact same source event/date/team coverage.
select pg_temp.as_rolling_member(1);
update prop_quote_context set second_league=(select league_id from api.create_league(p_name=>'Shared Prop Quotes',p_slug=>'shared-prop-quotes',p_mode=>'LIVE',p_nfl_year=>2026));
insert into private.league_memberships(league_id,user_id,role) select second_league,('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'MEMBER' from prop_quote_context,generate_series(2,4) n;
insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak) select s.id,p.second_league,('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,repeat(n::text,64) from prop_quote_context p join private.seasons s on s.league_id=p.second_league,generate_series(2,4) n;
select api.publish_live_week_slate(p.second_league,(api.store_live_odds_import(p.second_league,pg_temp.rolling_quote_import(),'shared-main-import')->>'importId')::uuid,array['rolling-game-1','rolling-game-2'],'shared-main-publish') from prop_quote_context p;
-- Open the independent league prospectively under the same supported package.
update private.odds_refresh_policy set next_request_at='-infinity';
do $$ declare l uuid; claim jsonb; begin
 select second_league into l from prop_quote_context;
 claim:=api.claim_live_quote_refresh(l);
 perform api.complete_live_quote_refresh((claim->>'leaseId')::uuid,pg_temp.rolling_quote_import(),493);
 perform api.lock_live_roster_and_open_week(l,'shared-prop-open');
end $$;
insert into private.player_prop_leagues select second_league,true from prop_quote_context;
select api.prepare_player_prop_menu('shared-prop-quotes');
select api.confirm_player_prop_menu('shared-prop-quotes',(select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id)) from private.week_player_menu m join private.season_weeks w on w.id=m.week_id where w.league_id=(select second_league from prop_quote_context)));
select is((api.plan_player_menu_quotes(second_league)->'requestIds'->>0)::uuid,request_id,'a second league reuses the same public event/statistic request') from prop_quote_context;
update prop_quote_context set second_plan=(api.plan_player_menu_quotes(second_league)->>'planId')::uuid;
select api.apply_live_quote_plan(second_plan) from prop_quote_context;
update prop_quote_context p set second_positions=(select jsonb_build_array(jsonb_build_object('marketSnapshotId',s.id,'payloadHash',s.payload_hash,'stakeCredits',100))
 from private.market_snapshots s join private.live_quote_heads h on h.market_snapshot_id=s.id
 where h.league_id=p.second_league and h.subject_id='fa000000-0000-4000-8000-000000000001' and h.outcome_key='OVER');
update prop_quote_context set second_review=api.review_live_card_quotes('shared-prop-quotes',second_positions);


-- BACKGROUND ACCEPTANCE START
create temporary table background_context(run_id uuid,request_id uuid,credits integer,background_credits integer);
insert into background_context default values;
select pg_temp.as_rolling_member(1);
-- A genuine accepted bet exists before any background application.
select pg_temp.as_rolling_member(2);
update rolling_quote_context set review=api.review_live_card_quotes('rolling-quotes',pg_temp.rolling_live_positions(1,300));
update rolling_quote_context set positions=pg_temp.rolling_live_positions(1,300,review->>'reviewId');
select api.accept_stage1_card('rolling-quotes',positions,'background-existing-bet') from rolling_quote_context;
create temporary table background_saved_receipts as select to_jsonb(r) receipt from private.position_receipts r;
create temporary table background_saved_players as select event_id,team,slot,subject_id from private.week_player_menu;
select pg_temp.as_rolling_member(1);
-- Eighteen additional independently authorized leagues publish the SAME games.
-- No additional provider request is made for their eventual scheduled refresh.
do $$ declare n integer;l uuid;claim jsonb;begin
 for n in 3..20 loop
 select league_id into l from api.create_league(p_name=>'Background League '||n,p_slug=>'background-league-'||n,p_mode=>'LIVE',p_nfl_year=>2026);
 insert into private.league_memberships(league_id,user_id,role) select l,('a1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'MEMBER' from generate_series(2,4) i;
 insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak) select s.id,l,('a1000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,repeat(i::text,64) from private.seasons s,generate_series(2,4) i where s.league_id=l;
 perform api.publish_live_week_slate(l,(api.store_live_odds_import(l,pg_temp.rolling_quote_import(),'bg-import-'||n)->>'importId')::uuid,array['rolling-game-1','rolling-game-2'],'bg-publish-'||n);
 update private.odds_refresh_policy set next_request_at='-infinity';
 claim:=api.claim_live_quote_refresh(l);perform api.complete_live_quote_refresh((claim->>'leaseId')::uuid,pg_temp.rolling_quote_import(),490-n*3);
 perform api.lock_live_roster_and_open_week(l,'bg-open-'||n);
 end loop;
end $$;
select is((select count(distinct week_id) from private.background_quote_targets()),20::bigint,'twenty published Live leagues are eligible');
select is((select count(*) from private.background_quote_due() where family='MAIN'),2::bigint,'twenty leagues form only two provider events');
update private.odds_refresh_policy set enabled=true,requests_remaining=19840,provider_entitlement_credits=20000,
 next_quota_reset_at=clock_timestamp()+interval '16 days',daily_credit_limit=2000,monthly_credit_limit=18000,
 protected_core_daily_credits=350,protected_core_monthly_credits=2000,next_request_at='-infinity';
insert into private.odds_entitlement_probes(state,completed_at,remaining,used) values('SUCCEEDED',clock_timestamp(),19840,160);
select is(api.claim_background_quote_run()->>'status','DISABLED','installation defaults dormant');
update private.background_quote_settings set enabled=true,polling_enabled=true,release_sha=repeat('a',40);
update background_context set run_id=(api.claim_background_quote_run()->>'runId')::uuid,
 credits=(select daily_credits from private.odds_refresh_policy),background_credits=(select background_daily_credits from private.odds_refresh_policy);
select ok((select run_id is not null from background_context),'initial worker claim selects real due published scope');
select is(api.claim_background_quote_run()->>'status','IDLE','duplicate dispatcher cannot claim another run');
update background_context set request_id=(api.claim_background_quote_request(run_id)->>'requestId')::uuid;
select is((select kind from private.shared_quote_requests where id=b.request_id),'MAIN','first due scheduled request is bulk main') from background_context b;
select is((select cardinality(event_ids) from private.shared_quote_requests where id=b.request_id),2,'bulk request covers both games once') from background_context b;
select is((select daily_credits from private.odds_refresh_policy),credits+3,'one or twenty leagues reserve one three-credit main fetch') from background_context;
select is((select background_daily_credits from private.odds_refresh_policy),background_credits+3,'scheduled MAIN is charged to background') from background_context;
select is(api.complete_background_quote_request(run_id,request_id,pg_temp.rolling_quote_import(false,150),'{"remaining":19837,"used":163,"last":3}')->>'status','SUCCEEDED','scheduled provider success is saved once') from background_context;
select is(api.complete_background_quote_request(run_id,request_id,pg_temp.rolling_quote_import(false,150),'{"remaining":19837,"used":163,"last":3}')->>'status','SUCCEEDED','duplicate completion is idempotent') from background_context;
create function pg_temp.apply_all_background() returns integer language plpgsql as $$declare target jsonb;result jsonb;n integer:=0;run uuid;begin
 select run_id into run from background_context;
 loop
 target:=api.next_background_quote_application(run);exit when target->>'status'='IDLE';
 result:=api.apply_background_quote_event(run,(target->>'eventId')::uuid,array(select jsonb_array_elements_text(target->'requestIds'))::uuid[]);
 if result->>'status'='FAILED' then raise exception 'Background application failed';end if;
 n:=n+1;if n>50 then raise exception 'Fanout did not converge';end if;
 end loop;return n;end $$;
-- An invalid league identity rolls back only its own event transaction.
create temporary table background_bad_event as select e.id,e.home_team from private.sports_events e join private.leagues l on l.id=e.league_id where l.slug='background-league-20' and e.fixture_event_key='rolling-game-1';
update private.sports_events set home_team='Invalid fixture identity' where id=(select id from background_bad_event);
select is(api.apply_background_quote_event(b.run_id,(select id from background_bad_event),array[b.request_id])->>'status','FAILED','one invalid league application is independently contained') from background_context b;
select is(api.apply_background_quote_event(b.run_id,(select e.id from private.sports_events e join private.leagues l on l.id=e.league_id where l.slug='background-league-19' and e.fixture_event_key='rolling-game-1'),array[b.request_id])->>'status','REFRESHED','a different league applies the same successful fetch despite the failure') from background_context b;
update private.sports_events e set home_team=b.home_team from background_bad_event b where e.id=b.id;
update private.background_quote_applications set retry_at='-infinity' where event_id=(select id from background_bad_event);
select is(pg_temp.apply_all_background(),39,'remaining league events recover without another fetch');
select is(pg_temp.apply_all_background(),0,'replaying application makes no duplicate publication');
select is((select count(*) from private.live_quote_heads h join private.market_snapshots m on m.id=h.market_snapshot_id where h.outcome_key='HOME' and h.market_type='MONEYLINE' and m.american_odds=150),40::bigint,'every league sees the shared new public price');
select is((select daily_credits from private.odds_refresh_policy),credits+3,'fanout and replay incur zero extra provider charges') from background_context;
select ok(not has_function_privilege('authenticated','api.claim_background_quote_run()','execute'),'members cannot claim worker runs');
select ok(not has_function_privilege('service_role','private.apply_shared_quote_events(uuid,uuid,uuid[],boolean,text[])','execute'),'service cannot directly invoke private application');
select throws_ok($$select api.apply_background_quote_event(gen_random_uuid(),(select id from private.sports_events limit 1),array[(select request_id from background_context)])$$,'P0001','QUOTE_WORKER_CLAIM_INVALID','random claim cannot write a league');
select ok((api.get_stored_quote_updates('rolling-quotes',(select first_week from rolling_quote_context))->>'pollingEnabled')::boolean,'authorized browser reads stored quotes');
select is((select daily_credits from private.odds_refresh_policy),credits+3,'stored read never reserves provider quota') from background_context;
select is(private.background_quote_interval('MAIN',now()+interval '6 hours',now()),interval '15 minutes','main accelerates at six hours');
select is(private.background_quote_interval('player_pass_yds',now()+interval '24 hours',now()),interval '1 hour','props accelerate at twenty-four hours');
select is(private.background_quote_interval('player_pass_yds',now()+interval '25 hours',now()),interval '6 hours','props outside final day target six hours');
-- Make the published passing family due; a successful empty response withdraws
-- quotes across the two prop leagues, preserving frozen identities and receipts.
select api.finish_background_quote_run(run_id) from background_context;
update private.shared_quote_requests set fetched_at=clock_timestamp()-interval '7 hours' where kind='PROPS';
update private.odds_refresh_policy set next_request_at='-infinity';
update background_context set run_id=(api.claim_background_quote_run()->>'runId')::uuid;
update background_context set request_id=(api.claim_background_quote_request(run_id)->>'requestId')::uuid;
select is((select families from private.shared_quote_requests where id=b.request_id),array['player_pass_yds'],'worker acquires only the due published family') from background_context b;
select api.complete_background_quote_request(run_id,request_id,pg_temp.prop_quote_payload(true),'{"remaining":19836,"used":164,"last":1}') from background_context;
select is(pg_temp.apply_all_background(),2,'empty public coverage applies independently to both prop leagues');
select is((select count(*) from private.live_quote_heads where subject_id is not null),0::bigint,'withdrawn offers are removed from active heads');
select ok(not exists(select 1 from background_saved_players old join private.week_player_menu m using(event_id,team,slot) where m.subject_id is distinct from old.subject_id),'withdrawal never replaces frozen players');
select is((select to_jsonb(r) from private.position_receipts r where r.id=(receipt->>'id')::uuid),receipt,'scheduled price changes and withdrawal preserve accepted bet bytes') from background_saved_receipts;
select ok((select count(*)>0 from jsonb_array_elements(api.get_stored_quote_updates('rolling-quotes',(select first_week from rolling_quote_context))->'events') e cross join lateral jsonb_array_elements(e->'freshness') f where f->>'family'='player_pass_yds' and f->>'checkedAt' is not null),'withdrawn family still reports its actual successful check');
-- Daily/calendar boundaries reset application counters only; no invented quota.
select api.finish_background_quote_run(run_id) from background_context;
update private.odds_refresh_policy set usage_day='2026-01-01',usage_month='2026-01-01',background_daily_credits=1300,background_monthly_credits=13500,next_request_at='-infinity';
select lives_ok($$select private.reserve_background_quote_credits(1)$$,'UTC calendar rollover admits a new purpose reservation');
select is((select background_daily_credits from private.odds_refresh_policy),1,'new UTC day resets purpose usage');
select is((select background_monthly_credits from private.odds_refresh_policy),1,'new UTC month resets purpose usage');
select is((select requests_remaining from private.odds_refresh_policy),19835,'calendar rollover decrements the real provider balance');
update private.odds_refresh_policy set next_request_at='-infinity',next_quota_reset_at=clock_timestamp()-interval '1 second';
select throws_ok($$select private.reserve_background_quote_credits(1)$$,'P0001','QUOTE_ENTITLEMENT_STALE','provider reset requires fresh verified entitlement evidence');
update private.odds_refresh_policy set next_request_at='-infinity',next_quota_reset_at=clock_timestamp()+interval '16 days',requests_remaining=3999;
select throws_ok($$select private.reserve_background_quote_credits(1)$$,'P0001','QUOTE_REFRESH_BUDGET','provider floor and essential demand headroom stop optional work');
update private.odds_refresh_policy set requests_remaining=19835,next_request_at='-infinity',provider_entitlement_credits=null;
select throws_ok($$select private.reserve_background_quote_credits(1)$$,'P0001','QUOTE_ENTITLEMENT_STALE','missing entitlement cannot authorize optional work');
update private.odds_refresh_policy set provider_entitlement_credits=20000;
update private.background_quote_settings set daily_limit=1;
select throws_ok($$select private.reserve_background_quote_credits(1)$$,'P0001','QUOTE_REFRESH_BUDGET','purpose ceiling applies to scheduled main as well as props');
update private.background_quote_settings set enabled=false,revision=revision+1;
select throws_ok($$select api.next_background_quote_application(run_id) from background_context$$,'P0001','QUOTE_WORKER_CLAIM_INVALID','disable fences outstanding work');
select is((api.plan_live_quote_refresh((select league_id from rolling_quote_context),pg_temp.rolling_live_positions(1,100))->>'status'),'PLANNED','ordinary demand review remains available with background disabled');
select * from finish();
rollback;
