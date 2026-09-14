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
insert into private.player_prop_leagues(league_id,enabled,rules_enabled,season_id,first_enabled_week,activated_at,release_sha,approval_reference)
 select league_id,true,true,season_id,2,clock_timestamp(),repeat('a',40),'DISPOSABLE_TEST_ONLY' from rollout_context;
select is((select ruleset_snapshot_id from private.season_weeks where id=c.week_id),c.ruleset_id,'scoped future activation does not repin an open week') from rollout_context c;
insert into private.season_weeks(season_id,league_id,nfl_week,scope,state,opens_at,common_lock_at)
 select c.season_id,c.league_id,2,'REGULAR','OPEN',w.opens_at+interval '7 days',w.common_lock_at+interval '7 days'
 from rollout_context c join private.season_weeks w on w.id=c.week_id;
select is((select r.ruleset_version from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.season_id=c.season_id and nfl_week=2),'1.4','configured next unopened week adopts exact1.4') from rollout_context c;
select is((select count(*) from private.authoritative_season_rulesets where ruleset_version='1.3'),2::bigint,'global LIVE/SIMULATION catalogs remain1.3');
select throws_ok($$update private.season_weeks set ruleset_snapshot_id=(select ruleset_id from rollout_context) where season_id=(select season_id from rollout_context) and nfl_week=2$$,'55000',null,'an opened props week cannot be downgraded');
update private.player_prop_leagues set enabled=false where league_id=(select league_id from rollout_context);
insert into private.season_weeks(season_id,league_id,nfl_week,scope,state,opens_at,common_lock_at)
 select c.season_id,c.league_id,3,'REGULAR','OPEN',w.opens_at+interval '14 days',w.common_lock_at+interval '14 days'
 from rollout_context c join private.season_weeks w on w.id=c.week_id;
select is((select r.ruleset_version from private.season_weeks w join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.season_id=c.season_id and nfl_week=3),'1.4','offer disable preserves supported future rules without downgrade or blocked opening') from rollout_context c;
select ok(not private.player_prop_offers_enabled((select id from private.season_weeks where season_id=c.season_id and nfl_week=3)),'offer disable still rejects fresh player props') from rollout_context c;
select is((select ruleset_snapshot_id from private.season_weeks where id=c.week_id),c.ruleset_id,'all original bindings remain unchanged after later openings') from rollout_context c;
select * from finish();
rollback;
