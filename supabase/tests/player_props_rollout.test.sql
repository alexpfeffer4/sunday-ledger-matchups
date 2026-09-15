begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
update private.authoritative_season_rulesets a set ruleset_version='1.3',product_bible_version='3.2',
 canonical_json=p.canonical_json,sha256_hash=p.sha256_hash from private.prepared_rolling_rulesets p where p.mode=a.mode;
create temporary table rollout_context(league_id uuid,season_id uuid,week_id uuid,ruleset_id uuid);
do $$ declare u uuid:=gen_random_uuid(); begin
 insert into auth.users(id,email) values(u,u::text||'@props-rollout.test');
 insert into private.profiles(id,display_name) values(u,'Scoped Props Owner');
 insert into private.owner_rehearsal_entitlements(user_id,note) values(u,'Disposable scoped rules verification');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform api.start_owner_rehearsal('scoped-props-start');
 perform api.fill_owner_rehearsal_bots('scoped-props-fill');
 perform api.advance_owner_rehearsal('FORMATION_READY','scoped-props-open');
 insert into rollout_context select r.league_id,r.season_id,w.id,w.ruleset_snapshot_id from private.owner_rehearsals r
 join private.season_weeks w on w.season_id=r.season_id and w.nfl_week=1 where r.owner_user_id=u;
end $$;
select is((select ruleset_version from private.season_ruleset_snapshots where id=c.ruleset_id),'1.3','current open week begins under1.3') from rollout_context c;
create function pg_temp.prepare_rollout_week(p_week integer) returns uuid language plpgsql as $$
declare wid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid(); sl uuid:=gen_random_uuid(); ev private.sports_events%rowtype;
 m record; qid uuid;
begin
 insert into private.season_weeks(id,season_id,league_id,nfl_week,scope,state,opens_at,common_lock_at)
 select wid,c.season_id,c.league_id,p_week,'REGULAR','PLANNED',w.opens_at+(p_week-1)*interval '7 days',w.common_lock_at+(p_week-1)*interval '7 days'
 from rollout_context c join private.season_weeks w on w.id=c.week_id;
 select * into strict ev from private.sports_events where week_id=(select week_id from rollout_context) order by id limit 1;
 insert into private.sports_events(id,week_id,season_id,league_id,fixture_event_key,away_team,home_team,scheduled_start_at)
 values(eid,wid,ev.season_id,ev.league_id,ev.fixture_event_key||'-scoped-'||p_week,ev.away_team,ev.home_team,ev.scheduled_start_at+(p_week-1)*interval '7 days');
 insert into private.slates(id,week_id,season_id,league_id,version,fixture_id,common_lock_at)
 select sl,wid,c.season_id,c.league_id,1,'scoped-review-fixture',w.common_lock_at from rollout_context c join private.season_weeks w on w.id=wid;
 for m in select * from private.market_snapshots where event_id=ev.id loop
  insert into private.market_snapshots(event_id,week_id,league_id,book_key,market_type,outcome_key,proposition,line_milli,american_odds,quality_status,observed_at,payload_hash)
  values(eid,wid,ev.league_id,m.book_key,m.market_type,m.outcome_key,m.proposition,m.line_milli,m.american_odds,m.quality_status,m.observed_at,m.payload_hash) returning id into qid;
  insert into private.slate_items(slate_id,event_id,market_snapshot_id,week_id,league_id) values(sl,eid,qid,wid,ev.league_id);
 end loop;
 perform private.prepare_player_menu(wid);
 return wid;
end; $$;

insert into private.player_prop_leagues(league_id,enabled,rules_enabled,season_id,first_enabled_week,activated_at,release_sha,approval_reference)
 select league_id,true,true,season_id,2,clock_timestamp(),repeat('a',40),'DISPOSABLE_TEST_ONLY' from rollout_context;
select is((select ruleset_snapshot_id from private.season_weeks where id=c.week_id),c.ruleset_id,'scoped future activation does not repin an open week') from rollout_context c;
select pg_temp.prepare_rollout_week(2);
select throws_ok($$update private.season_weeks set state='OPEN' where season_id=(select season_id from rollout_context) and nfl_week=2$$,'55000',null,'members cannot freeze a menu before commissioner review');
select is((select count(*) from private.week_player_menu where week_id=(select id from private.season_weeks where season_id=(select season_id from rollout_context) and nfl_week=2)),6::bigint,'future1.4 menu can be prepared under its still-planned1.3 binding');
select lives_ok($$select api.confirm_player_prop_menu((select l.slug from private.leagues l join rollout_context c on c.league_id=l.id),
 (select jsonb_agg(jsonb_build_object('eventId',m.event_id,'team',m.team,'slot',m.slot,'subjectId',m.subject_id)) from private.week_player_menu m
 join private.season_weeks w on w.id=m.week_id where w.season_id=(select season_id from rollout_context) and w.nfl_week=2))$$,'commissioner confirms explicit unresolved identities before open');
select lives_ok($$select api.open_reviewed_player_prop_week((select l.slug from private.leagues l join rollout_context c on c.league_id=l.id),'scoped-open-week-2')$$,'reviewed planned week opens through guarded commissioner RPC');
select is((select r.ruleset_version from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.season_id=c.season_id and nfl_week=2),'1.4','configured next unopened week adopts exact1.4') from rollout_context c;
select is((select count(*) from private.authoritative_season_rulesets where ruleset_version='1.3'),2::bigint,'global LIVE/SIMULATION catalogs remain1.3');
select throws_ok($$update private.season_weeks set ruleset_snapshot_id=(select ruleset_id from rollout_context) where season_id=(select season_id from rollout_context) and nfl_week=2$$,'55000',null,'an opened props week cannot be downgraded');
update private.player_prop_leagues set enabled=false where league_id=(select league_id from rollout_context);
select pg_temp.prepare_rollout_week(3);
select api.confirm_player_prop_menu((select l.slug from private.leagues l join rollout_context c on c.league_id=l.id),
 (select jsonb_agg(jsonb_build_object('eventId',m.event_id,'team',m.team,'slot',m.slot,'subjectId',m.subject_id)) from private.week_player_menu m
 join private.season_weeks w on w.id=m.week_id where w.season_id=(select season_id from rollout_context) and w.nfl_week=3));
select api.open_reviewed_player_prop_week((select l.slug from private.leagues l join rollout_context c on c.league_id=l.id),'scoped-open-week-3');
select is((select r.ruleset_version from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.season_id=c.season_id and nfl_week=3),'1.4','offer disable preserves supported future rules without downgrade or blocked opening') from rollout_context c;
select ok(not private.player_prop_offers_enabled((select id from private.season_weeks where season_id=c.season_id and nfl_week=3)),'offer disable still rejects fresh player props') from rollout_context c;
select is((select ruleset_snapshot_id from private.season_weeks where id=c.week_id),c.ruleset_id,'all original bindings remain unchanged after later openings') from rollout_context c;
select * from finish();
rollback;
