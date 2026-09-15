begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) select ('ad100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'catalog-hold-'||n||'@example.test' from generate_series(1,4) n;
insert into private.profiles(id,display_name) select id,'Catalog Member '||right(id::text,1) from auth.users where id::text like 'ad100000-%';
create function pg_temp.as_rolling_member(n integer) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub','ad100000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true); end; $$;
select pg_temp.as_rolling_member(1);
-- Create a real Live draft through the ordinary league authority.
create temporary table catalog_fixture_context as select league_id,season_id from api.create_league(
 p_name=>'Catalog Hold',p_slug=>'catalog-hold',p_mode=>'LIVE',p_nfl_year=>2026);
alter table catalog_fixture_context add column kickoff timestamptz default clock_timestamp()+interval '2 hours';
alter table catalog_fixture_context add column first_week uuid;
insert into private.league_memberships(league_id,user_id,role)
 select q.league_id,('ad100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'MEMBER' from catalog_fixture_context q,generate_series(2,4) n;
insert into private.season_entries(season_id,league_id,user_id,standing_tiebreak)
 select q.season_id,q.league_id,('ad100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,repeat(n::text,64) from catalog_fixture_context q,generate_series(2,4) n;
create function pg_temp.catalog_fixture_import(p_week integer)
returns jsonb language sql as $$
 select jsonb_build_object('source','THE_ODDS_API','fetchedAt',clock_timestamp(),'events',jsonb_agg(
 jsonb_build_object('source','THE_ODDS_API','externalEventId','catalog-hold-week-'||p_week||'-game-'||n,'sportKey','americanfootball_nfl',
 'awayTeam','Away '||n,'homeTeam','Home '||n,'scheduledStartAt',q.kickoff+(p_week-1)*interval '7 days','markets',(
 select jsonb_agg(jsonb_build_object('sourceBook','draftkings','marketType',market,'outcomeKey',side,
 'proposition',proposition,'lineMilli',line,'americanOdds',odds,'observedAt',now()))
 from (values ('MONEYLINE','AWAY','Away to win',null::integer,-160),('MONEYLINE','HOME','Home to win',null::integer,140),
 ('SPREAD','AWAY','Away -3.5',-3500,-110),('SPREAD','HOME','Home +3.5',3500,-110),
 ('TOTAL','OVER','Over44.5',44500,-110),('TOTAL','UNDER','Under44.5',44500,-110)) m(market,side,proposition,line,odds)
 )) order by n)) from catalog_fixture_context q,generate_series(1,1) n;
$$;

select api.publish_live_week_slate(q.league_id,
 (api.store_live_odds_import(q.league_id,pg_temp.catalog_fixture_import(1),'hold-initial-import')->>'importId')::uuid,
 array['catalog-hold-week-1-game-1'],'hold-initial-publish') from catalog_fixture_context q;
select throws_ok($$select private.configure_player_catalog_hold(league_id,season_id) from catalog_fixture_context$$,'P0001','An already-open active Live season is required for this release hold','release setup refuses an initial draft outside its supported abort scope');
select is((select count(*) from private.player_prop_leagues),0::bigint,'rejected initial-draft setup creates no partial hold');
select api.lock_live_roster_and_open_week(league_id,'hold-initial-open') from catalog_fixture_context;
update catalog_fixture_context set first_week=(select id from private.season_weeks where season_id=catalog_fixture_context.season_id);
create temporary table hold_bindings as select w.id,w.nfl_week,w.ruleset_snapshot_id from private.season_weeks w join catalog_fixture_context q on q.season_id=w.season_id;
select is((select r.ruleset_version from hold_bindings b join private.season_ruleset_snapshots r on r.id=b.ruleset_snapshot_id),'1.2','current live pilot starts with the opened historical1.2 binding');
update private.season_weeks set state='LOCKED' where id=(select first_week from catalog_fixture_context);
update private.authoritative_season_rulesets a set ruleset_version='1.3',product_bible_version='3.2',
 canonical_json=p.canonical_json,sha256_hash=p.sha256_hash from private.prepared_rolling_rulesets p where p.mode=a.mode;
select is(private.configure_player_catalog_hold(league_id,season_id),2,'acquisition-only setup chooses next unopened week after locked1.2') from catalog_fixture_context;
select is(private.configure_player_catalog_hold(league_id,season_id),2,'repeated setup retains the existing hold boundary') from catalog_fixture_context;
select is((select count(*) from private.player_catalog_jobs),0::bigint,'setup does not queue the locked previous slate or perform provider calls');
select is((select ruleset_snapshot_id from private.season_weeks where id=b.id),b.ruleset_snapshot_id,'setup leaves the old opened week binding unchanged') from hold_bindings b;
select ok(not enabled and not rules_enabled and catalog_enabled,'acquisition hold retains disabled offers and prospective rules') from private.player_prop_leagues where league_id=(select league_id from catalog_fixture_context);
create function pg_temp.publish_hold_week(p_week integer) returns jsonb language plpgsql as $$
declare lid uuid:=(select league_id from catalog_fixture_context);iid uuid;
begin
 iid:=(api.store_live_odds_import(lid,pg_temp.catalog_fixture_import(p_week),'hold-import-'||p_week)->>'importId')::uuid;
 return api.publish_next_live_week_slate(lid,iid,array['catalog-hold-week-'||p_week||'-game-1'],'hold-publish-'||p_week);
end; $$;
select throws_ok($$select pg_temp.publish_hold_week(2)$$,'55000','The current week must be final before the next week can publish.','acquisition cannot bypass ordinary previous-week finality');
-- Fixture-only state progression: no runtime result evidence is fabricated.
update private.season_weeks set state='FINAL' where id=(select first_week from catalog_fixture_context);
select is(pg_temp.publish_hold_week(2)->>'weekState','PLANNED','normal explicit publication stages the future week without activating props');
select is((select count(*) from private.player_catalog_jobs),1::bigint,'publication atomically queues catalog work despite hidden disabled menu');
select is((select r.ruleset_version from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.season_id=(select season_id from catalog_fixture_context) and nfl_week=2),'1.2','PLANNED staging retains the inherited baseline until actual opening');
select is((select count(*) from private.week_player_menu),0::bigint,'cold staging does not invent a reviewed or empty frozen menu');
create temporary table hold_claim as select api.claim_player_catalog_job() response;
select is((select response->>'status' from hold_claim),'CLAIMED','disabled release can acquire the staged next-week catalog');
select is((select response->>'week' from hold_claim),'2','source worker receives the correct prospective NFL week');
select is((select jsonb_array_length(response->'events') from hold_claim),1,'source worker receives the real published future slate');
select is(private.configure_player_catalog_hold(league_id,season_id),2,'setup remains idempotent after staged publication and worker acquisition') from catalog_fixture_context;
select is((select lease_id from private.player_catalog_jobs),(select (response->>'leaseId')::uuid from hold_claim),'repeated setup does not interrupt a valid acquisition lease');
select ok(not (select processing_enabled from private.player_result_policy) and not (select offers_enabled from private.player_prop_controls),'source acquisition leaves result processing and offers off');
select throws_ok($$update private.season_weeks set state='OPEN' where season_id=(select season_id from catalog_fixture_context) and nfl_week=2$$,'55000','This future week is held for player-source readiness and prospective release approval.','opening is blocked before validated prospective activation');
select ok(not has_function_privilege('authenticated','private.configure_player_catalog_hold(uuid,uuid)','execute'),'members cannot change release scope');
select ok(not has_function_privilege('authenticated','private.abort_player_catalog_hold(uuid,uuid,uuid)','execute'),'members cannot abort the release hold');
select lives_ok($$select private.abort_player_catalog_hold(league_id,season_id,(select id from private.season_weeks where season_id=q.season_id and nfl_week=2)) from catalog_fixture_context q$$,'approved source-readiness failure can release only its exact staged week');
select is((select state from private.season_weeks where season_id=(select season_id from catalog_fixture_context) and nfl_week=2),'OPEN','aborting the hold preserves ordinary game-only play');
select is((select r.ruleset_version from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.season_id=(select season_id from catalog_fixture_context) and nfl_week=2),'1.3','abort uses the current supported game-only opening authority');
select ok(not enabled and not rules_enabled and not catalog_enabled and catalog_hold_from_week is null,'abort clears only acquisition scope without enabling props') from private.player_prop_leagues where league_id=(select league_id from catalog_fixture_context);
select is((select state from private.player_catalog_jobs),'UNAVAILABLE','abort stops unneeded catalog retries');
select throws_ok($$select api.complete_player_catalog_job((select (response->>'leaseId')::uuid from hold_claim),'READY')$$,'55000','Catalog lease expired.','an in-flight old worker cannot complete an aborted release');
insert into hold_bindings select id,nfl_week,ruleset_snapshot_id from private.season_weeks where season_id=(select season_id from catalog_fixture_context) and nfl_week=2;
select is(private.configure_player_catalog_hold(league_id,season_id),3,'a newly approved retry stages the following unopened week') from catalog_fixture_context;
select throws_ok($$select private.abort_player_catalog_hold(league_id,season_id,(select id from private.season_weeks where season_id=q.season_id and nfl_week=2)) from catalog_fixture_context q$$,'55000','Only the exact staged unopened game-only week can release its catalog hold.','stale abort cannot repin a now-open week or release the new target');
update private.season_weeks set state='LOCKED' where season_id=(select season_id from catalog_fixture_context) and nfl_week=2;
update private.season_weeks set state='FINAL' where season_id=(select season_id from catalog_fixture_context) and nfl_week=2;
select is(pg_temp.publish_hold_week(3)->>'weekState','PLANNED','future retry again queues a closed staged slate');
-- Fixture-only completed release gates: the real activate.sql independently
-- requires account entitlement, source contracts, scheduler and approval proof.
update private.player_prop_leagues set rules_enabled=true,enabled=true,first_enabled_week=3,
 activated_at=clock_timestamp(),release_sha=repeat('a',40),approval_reference='Disposable prospective activation test'
 where league_id=(select league_id from catalog_fixture_context);
select throws_ok($$select private.abort_player_catalog_hold(league_id,season_id,(select id from private.season_weeks where season_id=q.season_id and nfl_week=3)) from catalog_fixture_context q$$,'55000','Only the exact staged unopened game-only week can release its catalog hold.','abort refuses a release whose prospective props rules were activated');
select lives_ok($$select api.prepare_player_prop_menu('catalog-hold')$$,'validated activation makes staged menu available for normal preparation');
select throws_ok($$select api.open_reviewed_player_prop_week('catalog-hold','hold-open-unreviewed')$$,'55000','Confirm the full player slate before opening the week.','activation still cannot open an unreviewed player menu');
select api.confirm_player_prop_menu('catalog-hold',(select jsonb_agg(jsonb_build_object('eventId',event_id,'team',team,'slot',slot,'subjectId',subject_id)) from private.week_player_menu));
select lives_ok($$select api.open_reviewed_player_prop_week('catalog-hold','hold-open-reviewed')$$,'normal commissioner review opens the validated prospective week');
select is((select r.ruleset_version from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.season_id=(select season_id from catalog_fixture_context) and nfl_week=3),'1.4','only actual reviewed opening adopts the prepared1.4 package');
select is((select count(*) from hold_bindings b join private.season_weeks w on w.id=b.id where w.ruleset_snapshot_id=b.ruleset_snapshot_id),2::bigint,'original1.2 and aborted1.3 opened bindings both remain unchanged');
select is((select count(*) from private.authoritative_season_rulesets where ruleset_version='1.3'),2::bigint,'all staging, abort and activation paths leave global catalogs on1.3');
with copied as (
 insert into private.season_ruleset_snapshots(ruleset_id,ruleset_version,product_bible_id,product_bible_version,mode,canonical_json,sha256_hash,frozen_at)
 select r.ruleset_id,r.ruleset_version,r.product_bible_id,r.product_bible_version,r.mode,r.canonical_json,r.sha256_hash,r.frozen_at
 from private.season_ruleset_snapshots r join private.seasons s on s.ruleset_snapshot_id=r.id join catalog_fixture_context q on q.season_id=s.id returning id)
insert into private.seasons(league_id,ruleset_snapshot_id,mode,nfl_year,roster_seed,schedule_seed,created_at)
 select s.league_id,copied.id,'LIVE',2027,s.roster_seed,s.schedule_seed,clock_timestamp()+interval '1 minute' from private.seasons s join catalog_fixture_context q on q.season_id=s.id cross join copied;
select throws_ok($$select private.configure_player_catalog_hold(league_id,season_id) from catalog_fixture_context$$,'P0001','The configured season is no longer current','stale setup cannot resume a superseded season scope');
select throws_ok($$select private.abort_player_catalog_hold(league_id,season_id,(select id from private.season_weeks where season_id=q.season_id and nfl_week=3)) from catalog_fixture_context q$$,'P0001','The configured season is no longer current','stale abort cannot mutate a superseded season scope');
select is((select catalog_hold_from_week from private.player_prop_leagues where league_id=(select league_id from catalog_fixture_context)),3,'rejected stale setup leaves the existing boundary untouched');
select * from finish();
rollback;
