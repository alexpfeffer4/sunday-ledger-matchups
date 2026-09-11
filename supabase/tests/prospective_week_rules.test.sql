begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select function_privs_are('private','pin_week_rules',array[]::text[],'authenticated',array[]::text[],'members cannot choose or repin week rules');
select function_privs_are('private','pin_week_rules',array[]::text[],'anon',array[]::text[],'anonymous cannot invoke rule activation');

create temporary table rule_upgrade_context(owner_id uuid,slug text,season_id uuid,old_snapshot uuid,new_snapshot uuid,week1 uuid,week2 uuid);
grant select on rule_upgrade_context to authenticated;
do $$
declare v_owner uuid:=gen_random_uuid(); v_slug text; v_season uuid; v_snapshot uuid; v_json jsonb;
begin
  insert into auth.users(id,email) values(v_owner,v_owner::text||'@future-rules.test');
  insert into private.profiles(id,display_name) values(v_owner,'Future Rules Owner');
  insert into private.owner_rehearsal_entitlements(user_id,note) values(v_owner,'Disposable future-week proof');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'role','authenticated')::text,true);
  perform api.start_owner_rehearsal('future-rules-start');
  perform api.fill_owner_rehearsal_bots('future-rules-fill');
  perform api.advance_owner_rehearsal('FORMATION_READY','future-rules-open');
  select l.slug,s.id,s.ruleset_snapshot_id into v_slug,v_season,v_snapshot
    from private.owner_rehearsals r join private.leagues l on l.id=r.league_id
    join private.seasons s on s.id=r.season_id where r.owner_user_id=v_owner and r.status='ACTIVE';
  select canonical_json into v_json from private.season_ruleset_snapshots where id=v_snapshot;
  v_json:=jsonb_set(jsonb_set(jsonb_set(v_json,'{version}','"1.1"'),'{productBibleVersion}','"3.0"'),
    '{standings,tiebreakOrder}','["MATCHUP_WIN_PERCENTAGE","POINTS_FOR","ALL_PLAY_PERCENTAGE","BALANCED_HEAD_TO_HEAD","FEWER_ATTENDANCE_MISSES","HIGHEST_SINGLE_WEEK_SCORE","STORED_DETERMINISTIC_RANDOM"]');
  -- Establish an already-open historical fixture, then restore its real guard.
  alter table private.season_ruleset_snapshots disable trigger guard_frozen_ruleset_update;
  update private.season_ruleset_snapshots set canonical_json=v_json,ruleset_version='1.1',product_bible_version='3.0',
    sha256_hash=encode(extensions.digest(private.canonical_ruleset_json(v_json),'sha256'),'hex') where id=v_snapshot;
  alter table private.season_ruleset_snapshots enable trigger guard_frozen_ruleset_update;
  insert into rule_upgrade_context(owner_id,slug,season_id,old_snapshot,week1)
    select v_owner,v_slug,v_season,v_snapshot,id from private.season_weeks where season_id=v_season and nfl_week=1;
end;
$$;

select is(api.get_stage1_state(slug)#>>'{season,rulesetSnapshot,rulesetVersion}','1.1','an already-open week retains V1.1 despite the V1.2 catalog') from rule_upgrade_context;
select lives_ok($$select api.use_owner_rehearsal_sample_card('future-rules-card-1')$$,'the open historical week seals normally');
select lives_ok($$select api.advance_owner_rehearsal('WEEK_1_OPEN','future-rules-partial-1')$$,'historical picks reveal through the real lifecycle');
select lives_ok($$select api.advance_owner_rehearsal('WEEK_1_PARTIAL','future-rules-provisional-1')$$,'historical scoring uses the real lifecycle');
select lives_ok($$select api.advance_owner_rehearsal('WEEK_1_PROVISIONAL','future-rules-final-1')$$,'the historical week finalizes');

create temporary table previous_rule_evidence as select
  (select to_jsonb(r) from private.season_ruleset_snapshots r where r.id=c.old_snapshot) snapshot,
  (select jsonb_agg(to_jsonb(r) order by r.id) from private.position_receipts r where r.week_id=c.week1) receipts,
  (select jsonb_agg(to_jsonb(r) order by r.id) from private.weekly_score_versions r where r.week_id=c.week1) scores,
  (select jsonb_agg(to_jsonb(r) order by r.id) from private.standings_snapshots r where r.week_id=c.week1) standings,
  private.build_regular_standings(c.week1) recalculation
from rule_upgrade_context c;

select lives_ok($$select api.advance_owner_rehearsal('WEEK_1_FINAL','future-rules-open-2')$$,'the next week automatically adopts the approved release');
update rule_upgrade_context c set new_snapshot=w.ruleset_snapshot_id,week2=w.id
from private.season_weeks w where w.season_id=c.season_id and w.nfl_week=2;
select isnt(new_snapshot,old_snapshot,'a new rules record leaves the original snapshot in place') from rule_upgrade_context;
select is(api.get_stage1_state(slug)#>>'{season,rulesetSnapshot,rulesetVersion}','1.2','Week 2 card validation receives V1.2') from rule_upgrade_context;
select is(api.get_season_ruleset(slug)->>'rulesetVersion','1.2','the Rules page reads the current week package') from rule_upgrade_context;
select is(api.get_season_ruleset(slug)#>>'{priorRules,0,rulesetVersion}','1.1','earlier rules remain available for historical standings') from rule_upgrade_context;
select is(api.get_stage1_state(slug)->>'standingsThroughWeek','1','the standings read model still identifies Week 1 until Week 2 settles') from rule_upgrade_context;
select is((select ruleset_snapshot_id from private.seasons where id=c.season_id),old_snapshot,'the original season identity remains unchanged') from rule_upgrade_context c;
select is((select to_jsonb(r) from private.season_ruleset_snapshots r where r.id=c.old_snapshot),e.snapshot,'activation does not rewrite original snapshot bytes') from rule_upgrade_context c cross join previous_rule_evidence e;
select is((select jsonb_agg(to_jsonb(r) order by r.id) from private.position_receipts r where r.week_id=c.week1),e.receipts,'activation does not rewrite any accepted terms or receipt hashes') from rule_upgrade_context c cross join previous_rule_evidence e;
select is((select jsonb_agg(to_jsonb(r) order by r.id) from private.weekly_score_versions r where r.week_id=c.week1),e.scores,'activation does not recalculate old scores') from rule_upgrade_context c cross join previous_rule_evidence e;
select is((select jsonb_agg(to_jsonb(r) order by r.id) from private.standings_snapshots r where r.week_id=c.week1),e.standings,'activation does not rewrite old standings') from rule_upgrade_context c cross join previous_rule_evidence e;
select is(private.build_regular_standings(c.week1),e.recalculation,'a subsequent historical recomputation still uses Week 1 rules') from rule_upgrade_context c cross join previous_rule_evidence e;
select ok(exists(select 1 from jsonb_array_elements(private.build_regular_standings(week1)) r where (r->>'allPlayComparisonCount')::int>0),'the historical standings builder actually computes All-play') from rule_upgrade_context;
select ok(not exists(select 1 from jsonb_array_elements(private.build_regular_standings(week2)) r where (r->>'allPlayComparisonCount')::int>0),'future standings omit All-play using Week 2 rules') from rule_upgrade_context;
select throws_ok($$update private.season_weeks set ruleset_snapshot_id=(select new_snapshot from rule_upgrade_context) where id=(select week1 from rule_upgrade_context)$$,'55000','An opened week keeps its original rules.','completed weeks cannot be repinned');
select throws_ok($$update private.season_weeks set ruleset_snapshot_id=(select old_snapshot from rule_upgrade_context) where id=(select week2 from rule_upgrade_context)$$,'55000','An opened week keeps its original rules.','an open week cannot switch rules before another member seals');
select throws_ok($$update private.season_weeks set state='PLANNED' where id=(select week2 from rule_upgrade_context)$$,'55000','An opened week keeps its original rules.','reopening a week cannot evade its binding');
select lives_ok($$select api.advance_owner_rehearsal('WEEK_1_FINAL','future-rules-open-2')$$,'retrying publication replays the original operation');
select is((select ruleset_snapshot_id from private.season_weeks where id=c.week2),new_snapshot,'publication retries retain the same new snapshot') from rule_upgrade_context c;
select lives_ok($$select api.prepare_owner_rehearsal_quote_review((select slug from rule_upgrade_context),'future-rules-review-2')$$,'the new week retains explicit quote review');
select lives_ok($$select api.use_owner_rehearsal_sample_card('future-rules-card-2')$$,'the new week seals through authoritative acceptance');
select ok(not exists(select 1 from private.position_receipts r where r.week_id=c.week2 and r.ruleset_snapshot_id<>c.new_snapshot),'new receipts bind the new week rules') from rule_upgrade_context c;
select ok(not exists(select 1 from private.position_receipts r where r.week_id=c.week1 and r.ruleset_snapshot_id<>c.old_snapshot),'old receipts retain the original week rules') from rule_upgrade_context c;

-- Exercise a planned-to-open transition and unsupported catalog release in a
-- rolled-back subtransaction; neither trial materializes a third fixture week.
create function pg_temp.try_planned_upgrade(p_unsupported boolean)
returns text language plpgsql as $$
declare v_week uuid; v_version text;
begin
  begin
    if p_unsupported then
      update private.authoritative_season_rulesets set ruleset_version='9.9',
        canonical_json=jsonb_set(canonical_json,'{version}','"9.9"') where mode='SIMULATION';
    end if;
    insert into private.season_weeks(season_id,league_id,nfl_week,state,opens_at,common_lock_at)
      select s.id,s.league_id,3,'PLANNED',now()+interval '1 day',now()+interval '2 days'
      from private.seasons s join rule_upgrade_context c on c.season_id=s.id returning id into v_week;
    update private.season_weeks set state='OPEN' where id=v_week;
    select r.ruleset_version into v_version from private.season_weeks w
      join private.season_ruleset_snapshots r on r.id=w.ruleset_snapshot_id where w.id=v_week;
    raise exception using errcode='ZX001',message=v_version;
  exception when sqlstate 'ZX001' then return sqlerrm;
    when others then return sqlstate||':'||sqlerrm;
  end;
end;
$$;
select is(pg_temp.try_planned_upgrade(false),'1.2','a planned week adopts the approved current version when it opens');
select is(pg_temp.try_planned_upgrade(true),'22023:UNSUPPORTED_WEEK_RULE_UPGRADE','unsupported future releases cannot silently replace week rules');
select is((select count(*) from private.season_weeks w join rule_upgrade_context c on c.season_id=w.season_id),2::bigint,'failed/trial publication leaves no partial future week');

set local role authenticated;
select is(api.get_season_ruleset(slug)->>'rulesetVersion','1.2','member RLS allows the new week snapshot') from rule_upgrade_context;
select is(api.get_season_ruleset(slug)#>>'{priorRules,0,rulesetVersion}','1.1','member RLS retains original rule history') from rule_upgrade_context;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
select is(api.get_season_ruleset(slug),null::jsonb,'an outsider cannot read another season rule history') from rule_upgrade_context;
select is((select count(*) from private.season_ruleset_snapshots where id=(select new_snapshot from rule_upgrade_context)),0::bigint,'new week snapshots remain protected by RLS');
reset role;
select * from finish();
rollback;
