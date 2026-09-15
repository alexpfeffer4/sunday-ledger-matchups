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

-- Main quote fetch cannot refresh prop evidence.
update private.odds_refresh_policy set next_request_at='-infinity';
update private.live_quote_refreshes set fetched_at=clock_timestamp()-interval '2 minutes',attempted_at=clock_timestamp()-interval '2 minutes';
update rolling_quote_context set lease_id=(api.claim_live_quote_refresh(league_id)->>'leaseId')::uuid;
select lives_ok($$select api.complete_live_quote_refresh(lease_id,pg_temp.rolling_quote_import(),493) from rolling_quote_context$$,'main import remains exactly six main outcomes despite added player heads');
select ok(not exists(select 1 from private.live_quote_heads where subject_id is not null and verified_import_id is not null),'main completion never attests unrelated player heads');
-- Expire cache eligibility in this isolated fixture then verify known suspension.
update private.shared_quote_requests set fetched_at=clock_timestamp()-interval '70 seconds' where id=(select request_id from prop_quote_context);
update prop_quote_context set plan_id=(api.plan_player_menu_quotes((select league_id from rolling_quote_context))->>'planId')::uuid;
update prop_quote_context set request_id=(select request_ids[1] from private.member_quote_plans where id=plan_id);
update private.odds_refresh_policy set next_request_at='-infinity';
select api.claim_shared_quote_request(plan_id,request_id) from prop_quote_context;
select api.complete_shared_quote_request(request_id,pg_temp.prop_quote_payload(true),'{"remaining":492,"last":0}') from prop_quote_context;
select throws_ok($$select private.assert_live_card_quote_review((select card_id from private.live_card_quote_reviews where id=(second_review->>'reviewId')::uuid),
 (select auth.uid()),jsonb_build_array((second_positions->0)||jsonb_build_object('reviewId',second_review->>'reviewId')),clock_timestamp()) from prop_quote_context$$,
 'P0001','QUOTE_CHANGED','known shared suspension invalidates another league proof before local heads apply');
-- Active/failed successor requests cannot hide the last successful suspension.
insert into private.shared_quote_requests(kind,event_ids,families,state) values('PROPS',array['rolling-game-1'],array['player_pass_yds'],'FAILED');
update private.shared_quote_coverage set request_id=(select id from private.shared_quote_requests where state='FAILED' order by created_at desc limit 1)
 where external_event_id='rolling-game-1' and family='player_pass_yds';
select throws_ok($$select private.assert_live_card_quote_review((select card_id from private.live_card_quote_reviews where id=(second_review->>'reviewId')::uuid),
 (select auth.uid()),jsonb_build_array((second_positions->0)||jsonb_build_object('reviewId',second_review->>'reviewId')),clock_timestamp()) from prop_quote_context$$,
 'P0001','QUOTE_CHANGED','failed successor cannot hide last successful public suspension');

select is((select charged_cost from private.shared_quote_requests where id=p.request_id),0,'reported zero charge is retained separately from conservative reservation') from prop_quote_context p;
select api.apply_live_quote_plan(plan_id) from prop_quote_context;
select is((select count(*) from private.live_quote_heads where week_id=c.first_week and subject_id is not null),0::bigint,'successful absent requested family removes old offers') from rolling_quote_context c;
select throws_ok($$select api.review_live_card_quotes('rolling-quotes',pg_temp.selected_prop_positions())$$,'P0001','QUOTE_SOURCE_STALE','suspended offer cannot receive a new review');
-- Concurrent duplicate claims share the lease; charged/unknown failures keep
-- their conservative reservation and late headers never raise the balance.
update private.shared_quote_requests set fetched_at=clock_timestamp()-interval '70 seconds' where id=(select request_id from prop_quote_context);
update prop_quote_context set plan_id=(api.plan_player_menu_quotes((select league_id from rolling_quote_context))->>'planId')::uuid,
 credits=(select daily_credits from private.odds_refresh_policy);
update prop_quote_context set request_id=(select request_ids[1] from private.member_quote_plans where id=plan_id);
update private.odds_refresh_policy set next_request_at='-infinity';
select api.claim_shared_quote_request(plan_id,request_id) from prop_quote_context;
select is(api.claim_shared_quote_request(plan_id,request_id)->>'status','WAIT','duplicate claim waits for the same request lease') from prop_quote_context;
select api.complete_shared_quote_request(request_id,null,'{"remaining":480,"used":20,"last":2}') from prop_quote_context;
select is((select daily_credits from private.odds_refresh_policy),credits+2,'charged failure accounts for a larger actual request cost') from prop_quote_context;
update prop_quote_context set plan_id=(api.plan_player_menu_quotes((select league_id from rolling_quote_context))->>'planId')::uuid;
update prop_quote_context set request_id=(select request_ids[1] from private.member_quote_plans where id=plan_id);
update private.odds_refresh_policy set next_request_at='-infinity';
select api.claim_shared_quote_request(plan_id,request_id) from prop_quote_context;
select api.complete_shared_quote_request(request_id,null,'{"remaining":999}') from prop_quote_context;
select is((select requests_remaining from private.odds_refresh_policy),479,'higher late remaining header never increases accounted allowance');
select is((select daily_credits from private.odds_refresh_policy),credits+3,'unknown failed charge retains its reservation') from prop_quote_context;
-- Optional props cannot consume the distinct unused core reserve.
update private.odds_refresh_policy set daily_credit_limit=40,monthly_credit_limit=200,protected_core_daily_credits=30,protected_core_monthly_credits=150,
 daily_credits=10,prop_daily_credits=10,monthly_credits=10,prop_monthly_credits=10,next_request_at='-infinity';
select throws_ok($$select private.reserve_selective_quote_credits(1,true)$$,'P0001','QUOTE_REFRESH_BUDGET','optional prop demand leaves core/result budget available');
select lives_ok($$select private.reserve_provider_credits(2)$$,'protected score request still fits the same global budget');
select is((select daily_credits from private.odds_refresh_policy),12,'core reservation is recorded conservatively');
-- An upgrade is explicit and records evidence without erasing prior usage.
select throws_ok($$select api.configure_player_prop_odds_budget(jsonb_build_object('entitlementCredits',500,'remaining',490,'used',10,'cycleId','fixture-cycle','observedAt',clock_timestamp(),'resetPolicy','FIRST_OF_MONTH_CONFIRMED_HEADERS','nextQuotaResetAt',(date_trunc('month',clock_timestamp() at time zone 'UTC')+interval '1 month 1 day') at time zone 'UTC'))$$,'P0001','ODDS_ENTITLEMENT_NOT_VERIFIED','free allowance cannot activate the prepared paid-tier cap');
select lives_ok($$select api.configure_player_prop_odds_budget(jsonb_build_object('entitlementCredits',20000,'remaining',19990,'used',10,'cycleId','fixture-cycle','observedAt',clock_timestamp(),'resetPolicy','FIRST_OF_MONTH_CONFIRMED_HEADERS','nextQuotaResetAt',(date_trunc('month',clock_timestamp() at time zone 'UTC')+interval '1 month 1 day') at time zone 'UTC'))$$,'verified upgraded allowance applies the prepared cap transition');
select is((select daily_credits from private.odds_refresh_policy),12,'upgrading never resets recorded app usage');
select is((select monthly_credit_limit from private.odds_refresh_policy),5000,'prepared monthly app cap stays below purchased allowance');
select is((select protected_core_monthly_credits from private.odds_refresh_policy),2000,'prepared core reserve is independently protected');
-- Calendar reset clears app counters; it does not invent a provider-cycle reset.
update private.odds_refresh_policy set usage_day=(clock_timestamp() at time zone 'UTC')::date-1,
 usage_month=(date_trunc('month',clock_timestamp() at time zone 'UTC')-interval '1 month')::date,
 daily_credits=999,monthly_credits=4999,prop_daily_credits=900,prop_monthly_credits=4000,requests_remaining=100,next_request_at='-infinity';
select lives_ok($$select private.reserve_selective_quote_credits(2,false)$$,'daily and monthly reset can reserve a core request');
select is((select daily_credits from private.odds_refresh_policy),2,'daily reset starts only the app counter');
select is((select prop_monthly_credits from private.odds_refresh_policy),0,'optional counter resets with the matching app month');
select is((select requests_remaining from private.odds_refresh_policy),98,'app month boundary never resets provider remaining credits');
select * from finish();
rollback;
