begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is((select count(*) from private.authoritative_season_rulesets where ruleset_version='1.2'),2::bigint,'support migration does not activate the new rules');
select is((select count(*) from private.prepared_rolling_rulesets),2::bigint,'both supported modes have a prepared immutable package');
select function_privs_are('private','rolling_ruleset_package',array['text'],'authenticated',array[]::text[],'members cannot select or change rule activation');
select table_privs_are('private','prepared_rolling_rulesets','authenticated',array[]::text[],'the prepared catalog is private');
select table_privs_are('private','event_entry_cutoff_history','authenticated',array[]::text[],'cutoff evidence has no direct public access');

-- Rollback-only activation of the exact compiled package, followed by real
-- rehearsal formation and the same member acceptance RPC used by Live.
update private.authoritative_season_rulesets a set ruleset_version='1.3',product_bible_version='3.2',
 canonical_json=p.canonical_json,sha256_hash=p.sha256_hash from private.prepared_rolling_rulesets p where p.mode=a.mode;
create temporary table rolling_context(owner_id uuid,slug text,season_id uuid,week_id uuid,card_id uuid,batch jsonb,response jsonb);
grant select,update on rolling_context to authenticated;
do $$
declare u uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(u,u::text||'@rolling.test');
 insert into private.profiles(id,display_name) values(u,'Rolling Owner');
 insert into private.owner_rehearsal_entitlements(user_id,note) values(u,'Disposable rolling submission verification');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform api.start_owner_rehearsal('rolling-start-1');
 perform api.fill_owner_rehearsal_bots('rolling-fill-1');
 perform api.advance_owner_rehearsal('FORMATION_READY','rolling-open-1');
 insert into rolling_context(owner_id,slug,season_id,week_id,card_id)
 select u,l.slug,r.season_id,w.id,c.id from private.owner_rehearsals r join private.leagues l on l.id=r.league_id
 join private.season_weeks w on w.season_id=r.season_id and w.nfl_week=1
 join private.weekly_cards c on c.week_id=w.id and c.owner_user_id=u where r.owner_user_id=u and r.status='ACTIVE';
end; $$;
create function pg_temp.rolling_positions(p_start integer,p_stakes integer[]) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('marketSnapshotId',m.id,'payloadHash',m.payload_hash,'stakeCredits',p_stakes[m.rn-p_start+1]) order by m.rn)
 from (select row_number() over(order by e.scheduled_start_at,e.id,s.market_type) rn,s.*
  from private.sports_events e join private.live_quote_heads h on h.event_id=e.id
  join private.market_snapshots s on s.id=h.market_snapshot_id
  where e.week_id=(select week_id from rolling_context) and h.outcome_key in ('HOME','OVER')) m
 where m.rn between p_start and p_start+cardinality(p_stakes)-1;
$$;

select is(api.get_owner_rehearsal()->>'rollingSubmissionsEnabled','true','owner guide identifies a rolling week');
update rolling_context set batch=pg_temp.rolling_positions(1,array[300]);
select lives_ok($$update rolling_context set response=api.accept_stage1_card(slug,batch,'rolling-authorized-retry')$$,'owner submits an authorized partial batch');
select is(api.get_owner_rehearsal()->>'ownerCardSealed','true','owner guide recognizes partial submission');
create temporary table retry_receipts as select to_jsonb(r) value from private.position_receipts r where r.card_id=(select card_id from rolling_context);
-- A controlled fixture clock change is rolled back with the test. Read/replay
-- authorization and all immutable receipt guards remain real.
update private.seasons set simulated_now=private.week_entry_closes_at((select week_id from rolling_context))+interval '1 second'
where id=(select season_id from rolling_context);
select is(api.accept_stage1_card(slug,batch,'rolling-authorized-retry')->>'replayed','true','an authorized exact request still replays after final entry cutoff') from rolling_context;
select throws_ok($$select api.accept_stage1_card(slug,jsonb_set(batch,'{0,stakeCredits}','350'),'rolling-authorized-retry') from rolling_context$$,
 '22000','Idempotency key was reused with a different request.','changed replay content remains rejected after cutoff');
update private.owner_rehearsal_entitlements set revoked_at=clock_timestamp() where user_id=(select owner_id from rolling_context);
select throws_ok($$select api.get_owner_rehearsal()$$,'42501','Not found.','revoked owner cannot read the rehearsal');
select throws_ok($$select api.accept_stage1_card(slug,batch,'rolling-authorized-retry') from rolling_context$$,
 '42501','Owner rehearsal not found.','revoked entitlement also denies exact replay of a previously accepted batch');
select is((select jsonb_agg(to_jsonb(r) order by r.id) from private.position_receipts r where r.card_id=(select card_id from rolling_context)),
 (select jsonb_agg(value order by value->>'id') from retry_receipts),'failed or rejected retries never change accepted receipt evidence');
select * from finish();
rollback;
