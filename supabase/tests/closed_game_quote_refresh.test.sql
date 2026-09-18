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
-- Regression: a shared MAIN response includes a game that closes after planning.
-- Its provider kickoff moves two minutes later; open MAIN + PROPS must still work.
select pg_temp.as_rolling_member(2);
update rolling_quote_context set review=api.review_live_card_quotes('rolling-quotes',pg_temp.rolling_live_positions(2,100));
update rolling_quote_context set positions=pg_temp.rolling_live_positions(2,100,review->>'reviewId');
select lives_ok($$select api.accept_stage1_card('rolling-quotes',positions,'closed-game-original-bet') from rolling_quote_context$$,
 'fixture has an accepted bet before its game closes');
create temporary table original_receipts as select id,to_jsonb(r) receipt from private.position_receipts r
 where week_id=(select first_week from rolling_quote_context);
create temporary table closed_game_context as
 select e.id event_id from private.sports_events e where e.week_id=(select first_week from rolling_quote_context) and e.fixture_event_key='rolling-game-2';
alter table closed_game_context add column plan_id uuid;
alter table closed_game_context add column main_request uuid;
update closed_game_context set plan_id=(api.plan_live_quote_refresh((select league_id from rolling_quote_context),
 pg_temp.rolling_live_positions(1,100)||pg_temp.selected_prop_positions())->>'planId')::uuid;
update closed_game_context c set main_request=(select r.id from private.member_quote_plans p
 join private.shared_quote_requests r on r.id=any(p.request_ids) where p.id=c.plan_id and r.kind='MAIN');
select is((select cardinality(request_ids) from private.member_quote_plans where id=c.plan_id),2,'mixed card plans MAIN and PROPS coverage') from closed_game_context c;
update private.odds_refresh_policy set next_request_at='-infinity';
select is(api.claim_shared_quote_request(plan_id,main_request)->>'status','CLAIMED','acquire bulk main while both games are open') from closed_game_context;
update private.sports_events set scheduled_start_at=clock_timestamp()-interval '1 minute' where id=(select event_id from closed_game_context);
select ok(not private.event_accepts_entries(event_id),'authoritative cutoff has closed the unrelated game') from closed_game_context;
select lives_ok($$select api.complete_shared_quote_request(main_request,
 jsonb_set(pg_temp.rolling_quote_import(),'{events,1,scheduledStartAt}',to_jsonb((select scheduled_start_at+interval '2 minutes' from private.sports_events where id=event_id))),
 '{"remaining":493,"last":3}') from closed_game_context$$,'provider stores the successful response including its shifted closed-game kickoff');
create temporary table closed_game_before as select to_jsonb(e) event,
 (select jsonb_agg(to_jsonb(h) order by h.market_type,h.outcome_key,h.subject_id) from private.live_quote_heads h where h.event_id=e.id) heads,
 (select count(*) from private.market_snapshots s where s.event_id=e.id) snapshots
 from private.sports_events e where id=(select event_id from closed_game_context);
select lives_ok($$select api.apply_live_quote_plan(plan_id) from closed_game_context$$,
 'closed-game timing drift does not abort mixed MAIN and PROPS refresh');
select lives_ok($$update rolling_quote_context set review=api.review_live_card_quotes('rolling-quotes',
 pg_temp.rolling_live_positions(1,100)||pg_temp.selected_prop_positions())$$,'mixed card gets fresh review after unrelated kickoff drift');
-- Use exactly the reviewed positions and explicit consent for the real fixture submission.
select lives_ok($$select api.accept_stage1_card('rolling-quotes',
 (select jsonb_agg(item||jsonb_build_object('reviewId',q.review->>'reviewId'))
  from jsonb_array_elements(pg_temp.rolling_live_positions(1,100)||pg_temp.selected_prop_positions()) item),
 'closed-game-mixed-bet') from rolling_quote_context q$$,'explicit mixed MAIN and PROPS submission succeeds');
select is((select count(*) from private.position_receipts where week_id=(select first_week from rolling_quote_context)),3::bigint,'only the original bet and two explicitly submitted picks exist');
select is((select to_jsonb(r) from private.position_receipts r where r.id=o.id),o.receipt,'original accepted receipt remains byte-for-byte unchanged') from original_receipts o;
select is((select to_jsonb(e) from private.sports_events e where e.id=c.event_id),b.event,'refresh preserves closed-game state, schedule and cutoff') from closed_game_context c,closed_game_before b;
select is((select jsonb_agg(to_jsonb(h) order by h.market_type,h.outcome_key,h.subject_id) from private.live_quote_heads h where h.event_id=c.event_id),b.heads,'closed-game quote heads and proof remain unchanged') from closed_game_context c,closed_game_before b;
select is((select count(*) from private.market_snapshots s where s.event_id=c.event_id),b.snapshots,'no new closed-game snapshots are created') from closed_game_context c,closed_game_before b;
select is((private.apply_shared_quote_events((select first_week from rolling_quote_context),event_id,
 array[main_request],false,array['MAIN'])->>'quoteCount')::integer,0,'background event application also skips the closed game') from closed_game_context;
select pg_temp.as_rolling_member(3);
select lives_ok($$select api.review_live_card_quotes('rolling-quotes',pg_temp.rolling_live_positions(1,100))$$,'game-lines-only card can also review the refreshed open game');
select throws_ok($$select api.review_live_card_quotes('rolling-quotes',pg_temp.rolling_live_positions(2,100))$$,
 '22023','The batch exceeds the remaining budget or includes a closed or submitted market.','closed game still cannot receive a new review');

-- Fail closed for mismatched games that still accept entries, and preserve freshness.
select pg_temp.as_rolling_member(2);
create temporary table good_main_payload as select payload from private.shared_quote_requests where id=(select main_request from closed_game_context);
update private.shared_quote_requests set payload=jsonb_set(payload,'{events,0,scheduledStartAt}',
 to_jsonb((payload#>>'{events,0,scheduledStartAt}')::timestamptz+interval '2 minutes')) where id=(select main_request from closed_game_context);
select throws_ok($$select api.apply_live_quote_plan(plan_id) from closed_game_context$$,'P0001','EVENT_IDENTITY_CHANGED','open-game kickoff mismatch still rejects the refresh');
update private.shared_quote_requests set payload=jsonb_set((select payload from good_main_payload),'{events,0,homeTeam}','"Different team"') where id=(select main_request from closed_game_context);
select pg_temp.as_rolling_member(3);
select throws_ok($$select api.apply_live_quote_plan(plan_id) from closed_game_context$$,'42501','League membership required.','plan remains bound to its original member');
select pg_temp.as_rolling_member(2);
select throws_ok($$select api.apply_live_quote_plan(plan_id) from closed_game_context$$,'P0001','EVENT_IDENTITY_CHANGED','open-game team mismatch still rejects the refresh');
update private.shared_quote_requests set payload=(select payload from good_main_payload),fetched_at=clock_timestamp()-interval '121 seconds' where id=(select main_request from closed_game_context);
select throws_ok($$select api.apply_live_quote_plan(plan_id) from closed_game_context$$,'P0001','QUOTE_SOURCE_STALE','closed-game skip never bypasses source freshness');
select * from finish();
rollback;
